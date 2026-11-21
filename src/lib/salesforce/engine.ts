/**
 * Turns EventMail records into "what to send" for a push: the payload for the server plus the
 * bookkeeping entry (hash + the EventMail values we are agreeing on). This is where the
 * two-way rules live: owners are mapped, and a field is only marked for writing if it changed
 * in EventMail since the last sync. Pure: no I/O, so the hook and the tests share it.
 */
import type { Deal, FollowUpTask, PipelineStage, SalesActivity, SalesLead } from "../types";
import type { DealPayload, LeadPayload, TaskPayload } from "./mapping";
import { ownerSfIdFor, type OwnerMap } from "./ownerMap";
import {
  activityHash,
  activityToPayload,
  dealBase,
  dealHash,
  dealToPayload,
  followUpHash,
  followUpToPayload,
  leadBase,
  leadHash,
  leadToPayload,
  ownerFlags,
  stageFlags,
  statusFlags,
  taskBase,
} from "./payloads";
import {
  patchesForConflict,
  type Conflict,
  type FollowUpPatch,
  type LeadPatch,
  type ReconcileOutput,
} from "./reconcile";
import type { SyncEntry } from "./records";
import { recordKey, type SyncRecord } from "./syncStore";

export type PrepContext = {
  records: Record<string, SyncRecord>;
  ownerMap: OwnerMap;
  /** The Salesforce user EventMail is connected as. */
  integrationUserId?: string | null;
  /** Open conflicts: those fields are never overwritten until a person decides. */
  conflicts: Conflict[];
};

type Prepared<P> = { payload: P; entry: SyncEntry };

const held = (c: PrepContext, target: Conflict["target"], id: string, field: Conflict["field"]) =>
  c.conflicts.some((x) => x.target === target && x.targetId === id && x.field === field);

export function prepareLeads(leads: SalesLead[], ctx: PrepContext): Prepared<LeadPayload>[] {
  return leads.map((l) => {
    const rec = ctx.records[recordKey("lead", l.id)];
    const flags = ownerFlags(rec, l.owner, ownerSfIdFor(ctx.ownerMap, l.owner), ctx.integrationUserId ?? undefined);
    // An open owner conflict on this lead blocks writing the owner.
    if (held(ctx, "lead", l.id, "owner")) flags.writeOwner = false;
    return {
      payload: leadToPayload(l, flags),
      entry: { key: l.id, label: l.name, hash: leadHash(l), base: leadBase(l) },
    };
  });
}

export function prepareDeals(
  deals: Deal[],
  leads: SalesLead[],
  ctx: PrepContext,
): Prepared<DealPayload>[] {
  const emailOf = new Map(leads.map((l) => [l.id, l.email]));
  return deals.map((d) => {
    const rec = ctx.records[recordKey("deal", d.id)];
    const flags = {
      ...ownerFlags(rec, d.owner, ownerSfIdFor(ctx.ownerMap, d.owner), ctx.integrationUserId ?? undefined),
      ...stageFlags(rec, d.stage, held(ctx, "lead", d.leadId, "stage")),
    };
    if (held(ctx, "lead", d.leadId, "owner")) flags.writeOwner = false;
    return {
      payload: dealToPayload(d, emailOf.get(d.leadId) ?? "", flags),
      entry: {
        key: d.id,
        label: `${d.company} - ${d.leadName}`,
        hash: dealHash(d),
        base: dealBase(d),
      },
    };
  });
}

export function prepareTasks(
  args: {
    followUps: FollowUpTask[];
    activities: SalesActivity[];
    leads: SalesLead[];
    /** Salesforce lead id by EventMail lead id, when already known. */
    leadSfIds: Map<string, string>;
  },
  ctx: PrepContext,
): Prepared<TaskPayload>[] {
  const leadById = new Map(args.leads.map((l) => [l.id, l]));
  const items: Prepared<TaskPayload>[] = [];
  const integration = ctx.integrationUserId ?? undefined;

  for (const t of args.followUps) {
    const lead = leadById.get(t.leadId);
    if (!lead) continue;
    const rec = ctx.records[recordKey("task", t.id)];
    const flags = {
      ...ownerFlags(rec, t.owner, ownerSfIdFor(ctx.ownerMap, t.owner), integration),
      ...statusFlags(rec, t.status === "Done", held(ctx, "task", t.id, "done")),
    };
    if (held(ctx, "task", t.id, "owner")) flags.writeOwner = false;
    items.push({
      payload: followUpToPayload(t, lead, args.leadSfIds.get(lead.id), flags),
      entry: {
        key: t.id,
        label: `${t.channel}: ${t.leadName}`,
        hash: followUpHash(t),
        base: taskBase(t),
      },
    });
  }
  for (const a of args.activities) {
    const lead = leadById.get(a.leadId);
    if (!lead) continue;
    const rec = ctx.records[recordKey("task", a.id)];
    items.push({
      payload: activityToPayload(
        a,
        lead,
        args.leadSfIds.get(lead.id),
        ownerFlags(rec, a.owner, ownerSfIdFor(ctx.ownerMap, a.owner), integration),
      ),
      entry: {
        key: a.id,
        label: `${a.kind}: ${a.leadName}`,
        hash: activityHash(a),
        base: rec?.base,
      },
    });
  }
  return items;
}

/* ——— Pull: commit a reconcile result ——— */

/** Fold a reconcile result into the stored records and the open-conflict list. */
export function commitPull(
  records: Record<string, SyncRecord>,
  conflicts: Conflict[],
  out: ReconcileOutput,
  nowIso: string,
): { records: Record<string, SyncRecord>; conflicts: Conflict[] } {
  const next = { ...records };
  for (const rk of out.dropRecords) delete next[rk];
  for (const [rk, update] of Object.entries(out.recordUpdates)) {
    if (next[rk]) next[rk] = { ...next[rk], ...update, at: next[rk].at };
  }
  const fresh = new Map(out.conflicts.map((c) => [c.id, c]));
  const kept = conflicts.filter((c) => !fresh.has(c.id));
  void nowIso;
  return { records: next, conflicts: [...out.conflicts, ...kept] };
}

type Data = { leads: SalesLead[]; deals: Deal[]; followUps: FollowUpTask[] };

/** The current fingerprint of the EventMail record behind a sync record (undefined = gone). */
function hashLookup(data: Data) {
  const leadById = new Map(data.leads.map((l) => [l.id, l]));
  const dealById = new Map(data.deals.map((d) => [d.id, d]));
  const taskById = new Map(data.followUps.map((t) => [t.id, t]));
  return (kind: SyncRecord["kind"], id: string): string | undefined => {
    if (kind === "lead") {
      const l = leadById.get(id);
      return l && leadHash(l);
    }
    if (kind === "deal") {
      const d = dealById.get(id);
      return d && dealHash(d);
    }
    if (kind === "task") {
      const t = taskById.get(id);
      return t && followUpHash(t);
    }
    return undefined;
  };
}

/** True when the EventMail data behind a record still matches what was last synced. */
export function isInSync(
  records: Record<string, SyncRecord>,
  data: Data,
): (recordKey: string) => boolean {
  const current = hashLookup(data);
  return (rk) => {
    const rec = records[rk];
    if (!rec) return false;
    const hash = current(rec.kind, rk.slice(rk.indexOf(":") + 1));
    return hash !== undefined && hash === rec.hash;
  };
}

/**
 * After a pull changed EventMail data, records that were up to date must be told so: their
 * stored hash is re-taken from the new data, otherwise they would show "Changed" for a
 * change that came from Salesforce itself.
 */
export function adoptHashes(
  records: Record<string, SyncRecord>,
  data: Data,
): Record<string, SyncRecord> {
  let changed = false;
  const next = { ...records };
  const current = hashLookup(data);
  for (const [rk, rec] of Object.entries(records)) {
    if (!rec.adopt) continue;
    const hash = current(rec.kind, rk.slice(rk.indexOf(":") + 1));
    // A deal that disappeared (its lead moved out of the pipeline) keeps the flag for later.
    if (hash === undefined && rec.kind === "deal") continue;
    next[rk] = { ...rec, adopt: undefined, ...(hash !== undefined ? { hash } : {}) };
    changed = true;
  }
  return changed ? next : records;
}

export type Resolution = "salesforce" | "eventmail";

/**
 * Settle one open conflict. "salesforce" applies Salesforce's value to EventMail; "eventmail"
 * keeps EventMail's value (Salesforce is left as it is). Either way both sides now count as
 * agreed, so the same difference is not raised again.
 */
export function resolveConflict(
  records: Record<string, SyncRecord>,
  conflicts: Conflict[],
  id: string,
  choice: Resolution,
  local: { leads: SalesLead[]; followUps: FollowUpTask[] },
  now: Date = new Date(),
): {
  records: Record<string, SyncRecord>;
  conflicts: Conflict[];
  leadPatches: LeadPatch[];
  followUpPatches: FollowUpPatch[];
} | null {
  const c = conflicts.find((x) => x.id === id);
  if (!c) return null;

  const patches =
    choice === "salesforce"
      ? patchesForConflict(c, now)
      : { leadPatches: [] as LeadPatch[], followUpPatches: [] as FollowUpPatch[] };

  // The value both sides now agree on.
  let agreed: { stage?: string; owner?: string; done?: boolean };
  if (c.target === "lead") {
    const lead = local.leads.find((l) => l.id === c.targetId);
    agreed =
      c.field === "stage"
        ? { stage: choice === "salesforce" ? (c.remoteValue as PipelineStage) : lead?.stage }
        : { owner: choice === "salesforce" ? c.remoteValue : lead?.owner };
  } else {
    const task = local.followUps.find((t) => t.id === c.targetId);
    agreed =
      c.field === "done"
        ? { done: choice === "salesforce" ? c.remoteValue === "true" : task?.status === "Done" }
        : { owner: choice === "salesforce" ? c.remoteValue : task?.owner };
  }

  const next = { ...records };
  for (const rk of c.recordKeys) {
    const rec = next[rk];
    if (!rec) continue;
    const base = { ...rec.base };
    if (agreed.stage !== undefined) base.stage = agreed.stage;
    if (agreed.owner !== undefined) base.owner = agreed.owner;
    if (agreed.done !== undefined) base.done = agreed.done;
    next[rk] = {
      ...rec,
      base,
      // Salesforce won: the change came from there, so the record is up to date once adopted.
      ...(choice === "salesforce" ? { adopt: true, pulledAt: now.toISOString() } : {}),
    };
  }
  return {
    records: next,
    conflicts: conflicts.filter((x) => x.id !== id),
    ...patches,
  };
}
