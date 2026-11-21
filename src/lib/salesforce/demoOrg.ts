/**
 * Demo mode's pretend Salesforce org.
 *
 * Demo mode never talks to Salesforce, but to show two-way sync without a real org it needs
 * somewhere to keep "what Salesforce holds" so a rep's change can be simulated and then
 * pulled back. This is that: an in-memory table keyed by the fake Salesforce id, plus a
 * list of fake Salesforce users for owner mapping. It follows the same write rules as the
 * live sync (a rep's change is never overwritten). Framework-free.
 */
import {
  DEFAULT_SCHEMA,
  hashOf,
  leadStatusFor,
  oppStageFor,
  sameSfId,
  taskStatusFor,
  heldMessage,
  type DealPayload,
  type HeldField,
  type LeadPayload,
  type RemoteSnap,
  type SyncResult,
  type TaskPayload,
} from "./mapping";
import type { HealthReport, RemoteKind, RemoteRequest, SfUser } from "./remote";

export const DEMO_USERS: SfUser[] = [
  { id: "005DEMOUSER0001", name: "Madhav Singhal", email: "madhav.singhal@demo-org.example" },
  { id: "005DEMOUSER0002", name: "Priya Nair", email: "priya.nair@demo-org.example" },
  { id: "005DEMOUSER0003", name: "Alex Rivera", email: "alex.rivera@demo-org.example" },
  { id: "005DEMOUSER0004", name: "Jordan Lee", email: "jordan.lee@demo-org.example" },
  { id: "005DEMOUSER0005", name: "Sam Carter", email: "sam.carter@demo-org.example" },
];

/** The pretend "connected user": records nobody has been assigned to belong to this user. */
export const DEMO_API_USER = "005DEMOAPIUSER1";

const userName = (id: string | undefined) =>
  id?.slice(0, 15) === DEMO_API_USER
    ? "Integration user"
    : DEMO_USERS.find((u) => u.id.slice(0, 15) === (id ?? "").slice(0, 15))?.name;

type Stored = RemoteSnap & { kind: RemoteKind };
type Store = Map<string, Stored>;
const g = globalThis as unknown as { __sfDemoOrg?: Store };
const org = (): Store => (g.__sfDemoOrg ??= new Map());

/** Tests start from an empty org. */
export function resetDemoOrg(): void {
  org().clear();
}

export const demoId = (kind: string, key: string) => `demo-${kind}-${hashOf([key])}`;

const NOTE = "Demo mode: nothing was sent to Salesforce.";

type Wrote = NonNullable<SyncResult["wrote"]>;

/** Owner rule shared by all three kinds: written on create, or when allowed and not reassigned. */
function nextOwner(
  have: Stored | undefined,
  p: { ownerSfId?: string; writeOwner?: boolean; baselineOwnerId?: string },
): { ownerId: string; wrote: boolean } {
  if (!have) return { ownerId: p.ownerSfId ?? DEMO_API_USER, wrote: true };
  const allowed =
    Boolean(p.ownerSfId) &&
    Boolean(p.writeOwner) &&
    (p.baselineOwnerId === undefined || sameSfId(have.ownerId, p.baselineOwnerId));
  return allowed
    ? { ownerId: p.ownerSfId!, wrote: true }
    : { ownerId: have.ownerId ?? DEMO_API_USER, wrote: false };
}

function finish(
  kind: RemoteKind,
  key: string,
  sfId: string,
  had: boolean,
  snap: RemoteSnap,
  wrote: Wrote,
  heldFields: HeldField[] = [],
): SyncResult {
  const full: RemoteSnap = { ...snap, ownerName: userName(snap.ownerId), modified: new Date().toISOString() };
  org().set(sfId, { ...full, kind });
  return {
    key,
    ok: true,
    sfId,
    action: had ? "updated" : "created",
    note: NOTE,
    remote: full,
    wrote: had ? wrote : undefined,
    held: had ? heldMessage(heldFields) : undefined,
    heldFields: had ? heldFields : undefined,
  };
}

/* ——— Pushes (what a real sync would have written) ——— */

export function demoLeads(leads: LeadPayload[]): SyncResult[] {
  return leads.map((p) => {
    const sfId = demoId("lead", p.key);
    const have = org().get(sfId);
    const wrote: Wrote = [];
    const untouched = leadStatusFor("New", DEFAULT_SCHEMA);
    // Same rule as the live sync: the status only moves while the lead is untouched.
    const status =
      !have || have.status === untouched ? leadStatusFor(p.stage, DEFAULT_SCHEMA) : have.status;
    if (!have || status !== have.status) wrote.push("status");
    const owner = nextOwner(have, p);
    if (owner.wrote) wrote.push("owner");
    const held: HeldField[] =
      have && p.ownerSfId && p.writeOwner && !owner.wrote ? ["owner"] : [];
    return finish("lead", p.key, sfId, Boolean(have), {
      sfId,
      status,
      converted: have?.converted ?? false,
      ownerId: owner.ownerId,
    }, wrote, held);
  });
}

export function demoDeals(deals: DealPayload[]): SyncResult[] {
  return deals.map((p) => {
    const sfId = demoId("opportunity", p.key);
    const have = org().get(sfId);
    const wrote: Wrote = [];
    const wantStage = oppStageFor(p.stage, DEFAULT_SCHEMA);
    const writeStage =
      !have ||
      (p.writeStage !== false &&
        (p.baselineStage === undefined || have.stage === p.baselineStage));
    const stage = writeStage ? wantStage : have!.stage;
    if (writeStage) wrote.push("stage");
    const owner = nextOwner(have, p);
    if (owner.wrote) wrote.push("owner");
    const held: HeldField[] = [];
    if (have && p.writeStage !== false && !writeStage) held.push("stage");
    if (have && p.ownerSfId && p.writeOwner && !owner.wrote) held.push("owner");
    return finish("deal", p.key, sfId, Boolean(have), {
      sfId,
      stage,
      isClosed: stage === "Closed Won" || stage === "Closed Lost",
      isWon: stage === "Closed Won",
      ownerId: owner.ownerId,
    }, wrote, held);
  });
}

export function demoTasks(tasks: TaskPayload[]): SyncResult[] {
  return tasks.map((p) => {
    const sfId = demoId("task", p.key);
    const have = org().get(sfId);
    const wrote: Wrote = [];
    const writeStatus =
      !have ||
      (p.writeStatus !== false &&
        (p.baselineStatus === undefined || have.taskStatus === p.baselineStatus));
    const status = writeStatus ? taskStatusFor(p.done) : (have!.taskStatus ?? "");
    if (writeStatus) wrote.push("taskStatus");
    const owner = nextOwner(have, p);
    if (owner.wrote) wrote.push("owner");
    const held: HeldField[] = [];
    if (have && p.writeStatus !== false && !writeStatus) held.push("done");
    if (have && p.ownerSfId && p.writeOwner && !owner.wrote) held.push("owner");
    return finish("task", p.key, sfId, Boolean(have), {
      sfId,
      taskStatus: status,
      isClosed: status === "Completed",
      dueDate: have?.dueDate,
      ownerId: owner.ownerId,
    }, wrote, held);
  });
}

/* ——— Pulls ——— */

export type DemoPullItem = RemoteRequest & { baseline?: RemoteSnap };

/**
 * Read the pretend org. After a server restart the org is empty, so fall back to the
 * baseline the browser remembers (= "nothing changed") instead of reporting records as gone.
 */
export function demoFetch(items: DemoPullItem[]): { snapshots: Record<string, RemoteSnap>; missing: string[] } {
  const snapshots: Record<string, RemoteSnap> = {};
  const missing: string[] = [];
  for (const it of items) {
    const have = org().get(it.sfId);
    if (have) {
      snapshots[it.sfId] = { ...have };
    } else if (it.baseline) {
      org().set(it.sfId, { ...it.baseline, kind: it.kind });
      snapshots[it.sfId] = it.baseline;
    } else {
      missing.push(it.sfId);
    }
  }
  return { snapshots, missing };
}

/* ——— "Act as a Salesforce rep" ——— */

export type DemoChange = {
  kind: RemoteKind;
  sfId: string;
  /** Lead.Status */
  status?: string;
  /** Opportunity.StageName */
  stage?: string;
  /** Task.Status */
  taskStatus?: string;
  ownerId?: string;
  /** Simulate the record being deleted in Salesforce. */
  remove?: boolean;
};

export function demoSimulate(change: DemoChange, fallback?: RemoteSnap): RemoteSnap | null {
  if (change.remove) {
    org().delete(change.sfId);
    return null;
  }
  const have = org().get(change.sfId) ?? (fallback ? { ...fallback, kind: change.kind } : undefined);
  if (!have) throw new Error("That record is not in the demo org. Sync it first.");
  const next = { ...have };
  if (change.status !== undefined) {
    next.status = change.status;
    next.converted = change.status.toLowerCase() === "closed - converted";
  }
  if (change.stage !== undefined) {
    next.stage = change.stage;
    next.isClosed = change.stage === "Closed Won" || change.stage === "Closed Lost";
    next.isWon = change.stage === "Closed Won";
  }
  if (change.taskStatus !== undefined) {
    next.taskStatus = change.taskStatus;
    next.isClosed = change.taskStatus === "Completed";
  }
  if (change.ownerId !== undefined) {
    next.ownerId = change.ownerId;
    next.ownerName = userName(change.ownerId);
  }
  next.modified = new Date().toISOString();
  org().set(change.sfId, next);
  return next;
}

/** Health report for demo mode: everything "works", clearly labelled as simulated. */
export function demoHealth(): HealthReport {
  const pass = (id: string, label: string, detail: string) => ({
    id,
    label,
    status: "pass" as const,
    detail,
  });
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    checks: [
      pass("api", "API access and login", "Demo mode: simulated connection, no real Salesforce org."),
      pass("obj-Lead", "Leads", "Demo mode: can create and edit Lead records."),
      pass("obj-Opportunity", "Opportunities", "Demo mode: can create and edit Opportunity records."),
      pass("obj-Task", "Tasks (follow-ups)", "Demo mode: can create and edit Task records."),
      pass("obj-Campaign", "Campaigns (events)", "Demo mode: can create Campaigns."),
      pass("users", "Salesforce users for owner mapping", `${DEMO_USERS.length} demo users available.`),
    ],
    apiUsage: { used: 42, max: 15000 },
  };
}
