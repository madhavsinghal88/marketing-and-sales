/**
 * Two-way sync brain: given what Salesforce holds NOW, what it held when EventMail last
 * agreed with it (the baseline), and what EventMail holds, decide for every tracked field:
 *
 *   - nothing changed in Salesforce            -> leave it
 *   - changed in Salesforce only               -> apply it to EventMail
 *   - changed in both places                   -> conflict, settled by the chosen policy
 *
 * Pure and framework-free: no I/O, no React. The hook feeds it data and applies the result.
 *
 * Tracked fields: lead stage (Lead.Status / Opportunity.StageName), owner (OwnerId, via the
 * owner mapping) and follow-up completion (Task.Status).
 */
import type {
  FollowUpStatus,
  FollowUpTask,
  Deal,
  PipelineStage,
  SalesLead,
  SalesOwner,
} from "../types";
import { SALES_OWNERS } from "../types";
import {
  leadStatusMatchesStage,
  stageFromLeadStatus,
  stageFromOppStage,
  taskDoneFor,
  type RemoteSnap,
} from "./mapping";
import { ownerForSfId, type OwnerMap } from "./ownerMap";
import type { SyncRecord } from "./syncStore";

export type PullPolicy = "salesforce" | "eventmail" | "ask";

export const POLICY_LABELS: Record<PullPolicy, { title: string; help: string }> = {
  salesforce: {
    title: "Salesforce wins",
    help: "When both sides changed the same field, the Salesforce value is applied in EventMail.",
  },
  eventmail: {
    title: "EventMail wins",
    help: "When both sides changed the same field, EventMail keeps its value. Salesforce is never overwritten.",
  },
  ask: {
    title: "Ask me",
    help: "When both sides changed the same field, the change waits in a list and you pick which one to keep.",
  },
};

export type ConflictField = "stage" | "owner" | "done";

export type Conflict = {
  id: string;
  target: "lead" | "task";
  targetId: string;
  field: ConflictField;
  label: string;
  source: "Lead" | "Opportunity" | "Task";
  /** Display values. */
  local: string;
  remote: string;
  /** Raw value to apply if Salesforce wins: stage name, owner name, or "true"/"false". */
  remoteValue: string;
  remoteDue?: string;
  /** Sync records whose baseline moves when this conflict is settled. */
  recordKeys: string[];
  at: string;
};

export type LeadPatch = { leadId: string; stage?: PipelineStage; owner?: SalesOwner };
export type FollowUpPatch = {
  taskId: string;
  done?: boolean;
  owner?: SalesOwner;
  dueLabel?: string;
  status?: FollowUpStatus;
};

export type PullChange = {
  kind: "lead" | "deal" | "task";
  label: string;
  message: string;
  tone: "applied" | "conflict" | "kept" | "notice" | "removed";
};

export type ReconcileInput = {
  leads: SalesLead[];
  deals: Deal[];
  followUps: FollowUpTask[];
  records: Record<string, SyncRecord>;
  /** Salesforce state keyed by sfId, as returned by the pull route. */
  remote: Record<string, RemoteSnap>;
  /** Ids Salesforce no longer returns. */
  missing: string[];
  ownerMap: OwnerMap;
  policy: PullPolicy;
  /** True when the record's EventMail data still matches what was last synced. */
  isInSync: (recordKey: string) => boolean;
  now: Date;
};

export type ReconcileOutput = {
  leadPatches: LeadPatch[];
  followUpPatches: FollowUpPatch[];
  conflicts: Conflict[];
  changes: PullChange[];
  recordUpdates: Record<string, Partial<SyncRecord>>;
  dropRecords: string[];
  counts: {
    checked: number;
    applied: number;
    conflicts: number;
    kept: number;
    notices: number;
    removed: number;
  };
};

/* ——— Applying patches (shared by the pull and by conflict resolution) ——— */

export function applyLeadPatches(leads: SalesLead[], patches: LeadPatch[]): SalesLead[] {
  if (patches.length === 0) return leads;
  const byId = new Map(patches.map((p) => [p.leadId, p]));
  return leads.map((lead) => {
    const p = byId.get(lead.id);
    if (!p) return lead;
    const stage = p.stage ?? lead.stage;
    const owner = p.owner ?? lead.owner;
    return {
      ...lead,
      stage,
      owner,
      lastActivity: p.stage
        ? `Moved to ${stage} in Salesforce`
        : p.owner
          ? `Assigned to ${owner} in Salesforce`
          : lead.lastActivity,
    };
  });
}

export function dueLabelFromDate(
  date: string | undefined,
  now: Date,
): { label: string; overdue: boolean } {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!m) return { label: "Tomorrow", overdue: false };
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { label: "Today", overdue: false };
  if (days === 1) return { label: "Tomorrow", overdue: false };
  if (days === -1) return { label: "Yesterday", overdue: true };
  const label = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label, overdue: days < 0 };
}

export function applyFollowUpPatches(
  tasks: FollowUpTask[],
  patches: FollowUpPatch[],
): FollowUpTask[] {
  if (patches.length === 0) return tasks;
  const byId = new Map(patches.map((p) => [p.taskId, p]));
  return tasks.map((t) => {
    const p = byId.get(t.id);
    if (!p) return t;
    return {
      ...t,
      owner: p.owner ?? t.owner,
      status: p.status ?? t.status,
      dueLabel: p.dueLabel ?? t.dueLabel,
    };
  });
}

/** What to apply if Salesforce's side of a conflict is accepted. */
export function patchesForConflict(
  c: Conflict,
  now: Date = new Date(),
): { leadPatches: LeadPatch[]; followUpPatches: FollowUpPatch[] } {
  if (c.target === "lead") {
    return {
      leadPatches: [
        c.field === "stage"
          ? { leadId: c.targetId, stage: c.remoteValue as PipelineStage }
          : { leadId: c.targetId, owner: c.remoteValue as SalesOwner },
      ],
      followUpPatches: [],
    };
  }
  if (c.field === "owner") {
    return {
      leadPatches: [],
      followUpPatches: [{ taskId: c.targetId, owner: c.remoteValue as SalesOwner }],
    };
  }
  const done = c.remoteValue === "true";
  if (done) {
    return {
      leadPatches: [],
      followUpPatches: [{ taskId: c.targetId, status: "Done", dueLabel: "Completed" }],
    };
  }
  const due = dueLabelFromDate(c.remoteDue, now);
  return {
    leadPatches: [],
    followUpPatches: [
      { taskId: c.targetId, status: due.overdue ? "Overdue" : "Open", dueLabel: due.label },
    ],
  };
}

/* ——— The reconcile itself ——— */

type Proposal<T> = {
  value: T;
  source: Conflict["source"];
  recordKey: string;
  baseValue: T | undefined;
  /** Opportunity beats Lead when both moved: it is the more specific record. */
  rank: number;
  remoteLabel: string;
};

const isOwner = (v: string | undefined): v is SalesOwner =>
  Boolean(v) && (SALES_OWNERS as readonly string[]).includes(v as string);

type Decision = "apply" | "conflict";

function decide<T>(local: T, base: T | undefined): Decision {
  // No baseline for this field (record synced before two-way sync existed): assume EventMail
  // did not change it, so a Salesforce change is applied rather than blocked.
  return base === undefined || local === base ? "apply" : "conflict";
}

export function reconcile(input: ReconcileInput): ReconcileOutput {
  const { leads, deals, followUps, records, remote, ownerMap, policy, now } = input;
  const at = now.toISOString();
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const taskById = new Map(followUps.map((t) => [t.id, t]));

  const out: ReconcileOutput = {
    leadPatches: [],
    followUpPatches: [],
    conflicts: [],
    changes: [],
    recordUpdates: {},
    dropRecords: [],
    counts: { checked: 0, applied: 0, conflicts: 0, kept: 0, notices: 0, removed: 0 },
  };

  const stageProps = new Map<string, Proposal<PipelineStage>[]>();
  const ownerProps = new Map<string, Proposal<SalesOwner>[]>();
  const doneProps = new Map<string, Proposal<boolean>>();
  const taskOwnerProps = new Map<string, Proposal<SalesOwner>>();
  /** Every record that belongs to a lead (its Lead and its Opportunity). */
  const recordsByLead = new Map<string, string[]>();
  const processed: { rk: string; rec: SyncRecord; snap: RemoteSnap }[] = [];
  const noteRecord = (leadId: string, rk: string) =>
    recordsByLead.set(leadId, [...(recordsByLead.get(leadId) ?? []), rk]);
  const push = <T>(map: Map<string, Proposal<T>[]>, id: string, p: Proposal<T>) =>
    map.set(id, [...(map.get(id) ?? []), p]);

  const change = (c: PullChange) => out.changes.push(c);

  function ownerProposal(
    snap: RemoteSnap,
    baseSnap: RemoteSnap,
    localOwner: SalesOwner,
    label: string,
    kind: PullChange["kind"],
  ): SalesOwner | undefined {
    if ((snap.ownerId ?? "") === (baseSnap.ownerId ?? "")) return undefined;
    const mapped = ownerForSfId(ownerMap, snap.ownerId);
    if (!mapped || !isOwner(mapped)) {
      out.counts.notices += 1;
      change({
        kind,
        label,
        tone: "notice",
        message: `Owner changed to ${snap.ownerName ?? "another user"} in Salesforce. They are not mapped to an EventMail owner, so EventMail kept ${localOwner}. Add them in Owner mapping.`,
      });
      return undefined;
    }
    return mapped === localOwner ? undefined : mapped;
  }

  /* 1. Read every synced record and turn Salesforce changes into proposals. */
  for (const [rk, rec] of Object.entries(records)) {
    if (rec.status !== "synced" || !rec.sfId) continue;
    if (rec.kind !== "lead" && rec.kind !== "deal" && rec.kind !== "task") continue;
    const snap = remote[rec.sfId];
    if (!snap) {
      if (input.missing.includes(rec.sfId)) {
        out.dropRecords.push(rk);
        out.counts.removed += 1;
        change({
          kind: rec.kind,
          label: rk.slice(rk.indexOf(":") + 1),
          tone: "removed",
          message:
            "This record no longer exists in Salesforce (deleted or merged). It is marked Not synced; sync it again to recreate it.",
        });
      }
      continue;
    }
    out.counts.checked += 1;
    processed.push({ rk, rec, snap });
    const baseSnap = rec.remote;

    if (rec.kind === "lead") {
      const lead = leadById.get(rk.slice(5));
      if (!lead) continue;
      noteRecord(lead.id, rk);
      if (!baseSnap) continue;
      const statusChanged =
        (snap.status ?? "") !== (baseSnap.status ?? "") ||
        Boolean(snap.converted) !== Boolean(baseSnap.converted);
      if (statusChanged) {
        const stage = stageFromLeadStatus(snap.status ?? "", snap.converted);
        const equivalent =
          !snap.converted && leadStatusMatchesStage(snap.status ?? "", lead.stage);
        if (stage && stage !== lead.stage && !equivalent) {
          push(stageProps, lead.id, {
            value: stage,
            source: "Lead",
            recordKey: rk,
            baseValue: rec.base?.stage as PipelineStage | undefined,
            rank: 1,
            remoteLabel: snap.status ?? stage,
          });
        }
      }
      const owner = ownerProposal(snap, baseSnap, lead.owner, lead.name, "lead");
      if (owner) {
        push(ownerProps, lead.id, {
          value: owner,
          source: "Lead",
          recordKey: rk,
          baseValue: rec.base?.owner as SalesOwner | undefined,
          rank: 1,
          remoteLabel: snap.ownerName ?? owner,
        });
      }
    } else if (rec.kind === "deal") {
      const deal = dealById.get(rk.slice(5));
      const lead = deal ? leadById.get(deal.leadId) : undefined;
      if (!deal || !lead) continue;
      noteRecord(lead.id, rk);
      if (!baseSnap) continue;
      const stageChanged =
        (snap.stage ?? "") !== (baseSnap.stage ?? "") ||
        Boolean(snap.isClosed) !== Boolean(baseSnap.isClosed);
      if (stageChanged) {
        const stage = stageFromOppStage(snap.stage ?? "", snap.isClosed, snap.isWon);
        if (stage && stage !== lead.stage) {
          push(stageProps, lead.id, {
            value: stage,
            source: "Opportunity",
            recordKey: rk,
            baseValue: rec.base?.stage as PipelineStage | undefined,
            rank: 2,
            remoteLabel: snap.stage ?? stage,
          });
        }
      }
      const owner = ownerProposal(snap, baseSnap, lead.owner, `${deal.company} - ${deal.leadName}`, "deal");
      if (owner) {
        push(ownerProps, lead.id, {
          value: owner,
          source: "Opportunity",
          recordKey: rk,
          baseValue: rec.base?.owner as SalesOwner | undefined,
          rank: 2,
          remoteLabel: snap.ownerName ?? owner,
        });
      }
    } else {
      const task = taskById.get(rk.slice(5));
      if (!task || !baseSnap) continue; // logged activities have no local counterpart to update
      const remoteDone = taskDoneFor(snap.taskStatus ?? "", snap.isClosed);
      const wasDone = taskDoneFor(baseSnap.taskStatus ?? "", baseSnap.isClosed);
      if (remoteDone !== wasDone && remoteDone !== (task.status === "Done")) {
        doneProps.set(task.id, {
          value: remoteDone,
          source: "Task",
          recordKey: rk,
          baseValue: rec.base?.done,
          rank: 1,
          remoteLabel: snap.taskStatus ?? (remoteDone ? "Completed" : "Open"),
        });
      }
      const owner = ownerProposal(snap, baseSnap, task.owner, `${task.channel}: ${task.leadName}`, "task");
      if (owner) {
        taskOwnerProps.set(task.id, {
          value: owner,
          source: "Task",
          recordKey: rk,
          baseValue: rec.base?.owner as SalesOwner | undefined,
          rank: 1,
          remoteLabel: snap.ownerName ?? owner,
        });
      }
    }
  }

  /* 2. Settle each proposal: apply, keep, or raise a conflict. */
  const leadPatchById = new Map<string, LeadPatch>();
  const taskPatchById = new Map<string, FollowUpPatch>();
  /** Per record: new base values and whether a pull changed its EventMail data. */
  const baseUpdates = new Map<string, { stage?: string; owner?: string; done?: boolean }>();
  const touched = new Set<string>();
  const pendingByRecord = new Map<string, Set<string>>();
  const notesByRecord = new Map<string, string[]>();
  const addNote = (rks: string[], text: string) => {
    for (const rk of rks) notesByRecord.set(rk, [...(notesByRecord.get(rk) ?? []), text]);
  };

  const setBase = (rks: string[], patch: { stage?: string; owner?: string; done?: boolean }) => {
    for (const rk of rks) baseUpdates.set(rk, { ...baseUpdates.get(rk), ...patch });
  };

  function settle<T extends string | boolean>(args: {
    proposals: Proposal<T>[];
    local: T;
    target: Conflict["target"];
    targetId: string;
    field: ConflictField;
    label: string;
    kind: PullChange["kind"];
    related: string[];
    show: (v: T) => string;
    raw: (p: Proposal<T>) => string;
    remoteDue?: string;
    onApply: (value: T) => void;
    setBaseValue: (value: T) => { stage?: string; owner?: string; done?: boolean };
    noun: string;
  }) {
    const top = [...args.proposals].sort((a, b) => b.rank - a.rank)[0];
    if (!top || top.value === args.local) return;
    const verdict = decide(args.local, top.baseValue);
    const where = top.source === "Lead" ? "Salesforce lead" : top.source === "Opportunity" ? "Salesforce opportunity" : "Salesforce task";
    const summary = `${args.noun}: ${args.show(args.local)} → ${args.show(top.value)}`;

    if (verdict === "apply") {
      args.onApply(top.value);
      setBase(args.related, args.setBaseValue(top.value));
      for (const rk of args.related) touched.add(rk);
      out.counts.applied += 1;
      change({ kind: args.kind, label: args.label, tone: "applied", message: `${summary} (changed in ${where})` });
      addNote(args.related, summary);
      return;
    }

    // Both sides changed this field.
    if (policy === "salesforce") {
      args.onApply(top.value);
      setBase(args.related, args.setBaseValue(top.value));
      for (const rk of args.related) touched.add(rk);
      out.counts.applied += 1;
      change({
        kind: args.kind,
        label: args.label,
        tone: "applied",
        message: `${summary}. Changed on both sides, Salesforce won.`,
      });
      addNote(args.related, `${summary} (Salesforce won)`);
    } else if (policy === "eventmail") {
      setBase(args.related, args.setBaseValue(args.local));
      out.counts.kept += 1;
      change({
        kind: args.kind,
        label: args.label,
        tone: "kept",
        message: `${args.noun}: kept ${args.show(args.local)}. Salesforce changed it to ${args.show(top.value)}, EventMail wins.`,
      });
    } else {
      const id = `${args.target}:${args.targetId}:${args.field}`;
      out.conflicts.push({
        id,
        target: args.target,
        targetId: args.targetId,
        field: args.field,
        label: args.label,
        source: top.source,
        local: args.show(args.local),
        remote: args.field === "owner" ? top.remoteLabel : args.show(top.value),
        remoteValue: args.raw(top),
        remoteDue: args.remoteDue,
        recordKeys: args.related,
        at,
      });
      for (const rk of args.related) {
        pendingByRecord.set(rk, (pendingByRecord.get(rk) ?? new Set()).add(args.field));
      }
      out.counts.conflicts += 1;
      change({
        kind: args.kind,
        label: args.label,
        tone: "conflict",
        message: `${args.noun}: EventMail has ${args.show(args.local)}, Salesforce has ${args.show(top.value)}. Needs your decision.`,
      });
    }
  }

  for (const lead of leads) {
    const related = recordsByLead.get(lead.id) ?? [];
    const stages = stageProps.get(lead.id);
    if (stages) {
      settle<PipelineStage>({
        proposals: stages,
        local: lead.stage,
        target: "lead",
        targetId: lead.id,
        field: "stage",
        label: lead.name,
        kind: "lead",
        related,
        show: (v) => v,
        raw: (p) => p.value,
        noun: "Stage",
        onApply: (v) => {
          leadPatchById.set(lead.id, { ...leadPatchById.get(lead.id), leadId: lead.id, stage: v });
        },
        setBaseValue: (v) => ({ stage: v }),
      });
    }
    const owners = ownerProps.get(lead.id);
    if (owners) {
      settle<SalesOwner>({
        proposals: owners,
        local: lead.owner,
        target: "lead",
        targetId: lead.id,
        field: "owner",
        label: lead.name,
        kind: "lead",
        related,
        show: (v) => v,
        raw: (p) => p.value,
        noun: "Owner",
        onApply: (v) => {
          leadPatchById.set(lead.id, { ...leadPatchById.get(lead.id), leadId: lead.id, owner: v });
        },
        setBaseValue: (v) => ({ owner: v }),
      });
    }
  }

  for (const task of followUps) {
    const done = doneProps.get(task.id);
    const label = `${task.channel}: ${task.leadName}`;
    if (done) {
      const snap = remote[records[done.recordKey]?.sfId ?? ""];
      settle<boolean>({
        proposals: [done],
        local: task.status === "Done",
        target: "task",
        targetId: task.id,
        field: "done",
        label,
        kind: "task",
        related: [done.recordKey],
        show: (v) => (v ? "Done" : "Open"),
        raw: (p) => String(p.value),
        remoteDue: snap?.dueDate,
        noun: "Status",
        onApply: (v) => {
          const patch = patchesForConflict(
            {
              id: "",
              target: "task",
              targetId: task.id,
              field: "done",
              label,
              source: "Task",
              local: "",
              remote: "",
              remoteValue: String(v),
              remoteDue: snap?.dueDate,
              recordKeys: [],
              at,
            },
            now,
          ).followUpPatches[0];
          taskPatchById.set(task.id, { ...taskPatchById.get(task.id), ...patch });
        },
        setBaseValue: (v) => ({ done: v }),
      });
    }
    const owner = taskOwnerProps.get(task.id);
    if (owner) {
      settle<SalesOwner>({
        proposals: [owner],
        local: task.owner,
        target: "task",
        targetId: task.id,
        field: "owner",
        label,
        kind: "task",
        related: [owner.recordKey],
        show: (v) => v,
        raw: (p) => p.value,
        noun: "Owner",
        onApply: (v) => {
          taskPatchById.set(task.id, { ...taskPatchById.get(task.id), taskId: task.id, owner: v });
        },
        setBaseValue: (v) => ({ owner: v }),
      });
    }
  }

  out.leadPatches = [...leadPatchById.values()];
  out.followUpPatches = [...taskPatchById.values()];

  /* 3. New baselines for every record we looked at. */
  for (const { rk, rec, snap } of processed) {
    const update: Partial<SyncRecord> = { remote: snap };
    const lead =
      rec.kind === "lead"
        ? leadById.get(rk.slice(5))
        : rec.kind === "deal"
          ? leadById.get(dealById.get(rk.slice(5))?.leadId ?? "")
          : undefined;
    const task = rec.kind === "task" ? taskById.get(rk.slice(5)) : undefined;

    // First time we see this record with a baseline-less history: start from today's values.
    const startBase = rec.base ?? {
      ...(lead ? { stage: lead.stage, owner: lead.owner } : {}),
      ...(task ? { done: task.status === "Done", owner: task.owner } : {}),
    };
    const pending = pendingByRecord.get(rk);
    const moved = baseUpdates.get(rk) ?? {};
    // A field with an open conflict keeps its old baseline until the conflict is settled.
    const nextBase = { ...startBase, ...moved };
    if (pending?.has("stage")) nextBase.stage = startBase.stage;
    if (pending?.has("owner")) nextBase.owner = startBase.owner;
    if (pending?.has("done")) nextBase.done = startBase.done;
    update.base = nextBase;

    if (touched.has(rk)) {
      update.pulledAt = at;
      update.pullNote = (notesByRecord.get(rk) ?? []).join(" · ");
      if (input.isInSync(rk)) update.adopt = true;
    }
    out.recordUpdates[rk] = update;
  }

  return out;
}
