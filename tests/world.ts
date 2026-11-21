/**
 * A tiny "EventMail + Salesforce" world for tests. It drives the real production code
 * (payload preparation, server-side sync, pull, reconcile, commit) against the mock
 * Salesforce, in the same order the browser hook does, so the tests exercise the real rules.
 */
import { MOCK_EVENTS } from "../src/data/mock";
import { buildActivities, buildDeals, buildFollowUps, buildLeadsFromEvents } from "../src/lib/sales";
import type { Deal, FollowUpTask, SalesActivity, SalesLead } from "../src/lib/types";
import { createRest, type SfRest } from "../src/lib/salesforce/rest";
import { loadSchema, clearSchemaCache, syncDeals, syncLeads, syncTasks } from "../src/lib/salesforce/sync";
import { attachSnapshots, fetchRemote, type RemoteKind } from "../src/lib/salesforce/remote";
import { mergeResults, type Stats } from "../src/lib/salesforce/records";
import { adoptHashes, commitPull, prepareDeals, prepareLeads, prepareTasks, resolveConflict, type PrepContext, type Resolution } from "../src/lib/salesforce/engine";
import { applyFollowUpPatches, applyLeadPatches, reconcile, type Conflict, type PullPolicy, type ReconcileOutput } from "../src/lib/salesforce/reconcile";
import { recordKey, type SyncRecord } from "../src/lib/salesforce/syncStore";
import type { OwnerMap } from "../src/lib/salesforce/ownerMap";
import { createMockSalesforce } from "./mockSalesforce";

export const INSTANCE = "https://mock.my.salesforce.com";

export function createWorld(opts: { leadCount?: number } = {}) {
  const sf = createMockSalesforce();
  const slept: number[] = [];
  const rest: SfRest = createRest({
    instanceUrl: INSTANCE,
    accessToken: sf.state.token,
    apiVersion: "v62.0",
    fetchImpl: sf.fetchImpl,
    sleep: async (ms) => void slept.push(ms),
    refresh: async () => sf.state.token,
  });
  clearSchemaCache();

  const allLeads = buildLeadsFromEvents(MOCK_EVENTS).slice(0, opts.leadCount ?? 12);
  const w = {
    sf,
    rest,
    slept,
    leads: allLeads as SalesLead[],
    followUps: [] as FollowUpTask[],
    activities: [] as SalesActivity[],
    records: {} as Record<string, SyncRecord>,
    conflicts: [] as Conflict[],
    ownerMap: {} as OwnerMap,
    policy: "ask" as PullPolicy,
    integrationUserId: sf.apiUser as string | undefined,
    lastPull: null as ReconcileOutput | null,

    get deals(): Deal[] {
      return buildDeals(w.leads);
    },

    ctx(): PrepContext {
      return {
        records: w.records,
        ownerMap: w.ownerMap,
        integrationUserId: w.integrationUserId,
        conflicts: w.conflicts,
      };
    },

    /** Mirror the Owner mapping screen: link EventMail owners to Salesforce users by name. */
    linkOwners(names: string[]) {
      for (const name of names) {
        const id = sf.addUser(name, `${name.replace(/\s+/g, ".").toLowerCase()}@example.com`);
        w.ownerMap[name] = { sfUserId: id, sfName: name };
      }
    },

    record(kind: "lead" | "deal" | "task" | "event", key: string) {
      return w.records[recordKey(kind, key)];
    },

    commit(kind: "lead" | "deal" | "task", entries: Parameters<typeof mergeResults>[2], results: Parameters<typeof mergeResults>[3]): Stats {
      const merged = mergeResults(w.records, kind, entries, results, new Date().toISOString(), false);
      w.records = merged.records;
      return merged.stats;
    },

    async pushLeads(list: SalesLead[] = w.leads) {
      const prepared = prepareLeads(list, w.ctx());
      const schema = await loadSchema(rest, INSTANCE);
      const results = await attachSnapshots(rest, "lead", await syncLeads(rest, schema, prepared.map((p) => p.payload)));
      return w.commit("lead", prepared.map((p) => p.entry), results);
    },

    async pushDeals(list: Deal[] = w.deals) {
      const prepared = prepareDeals(list, w.leads, w.ctx());
      const schema = await loadSchema(rest, INSTANCE);
      const results = await attachSnapshots(rest, "deal", await syncDeals(rest, schema, prepared.map((p) => p.payload)));
      return w.commit("deal", prepared.map((p) => p.entry), results);
    },

    async pushTasks() {
      const leadSfIds = new Map<string, string>();
      for (const l of w.leads) {
        const r = w.record("lead", l.id);
        if (r?.sfId) leadSfIds.set(l.id, r.sfId);
      }
      const prepared = prepareTasks(
        { followUps: w.followUps, activities: w.activities, leads: w.leads, leadSfIds },
        w.ctx(),
      );
      const schema = await loadSchema(rest, INSTANCE);
      const results = await attachSnapshots(rest, "task", await syncTasks(rest, schema, prepared.map((p) => p.payload)));
      return w.commit("task", prepared.map((p) => p.entry), results);
    },

    /** Everything, in the order "Sync everything" uses. */
    async pushAll() {
      await w.pushLeads();
      await w.pushDeals();
      await w.pushTasks();
    },

    /** "Pull from Salesforce": fetch, reconcile, apply, commit. Returns the reconcile output. */
    async pull(now = new Date()): Promise<ReconcileOutput> {
      const requests = Object.entries(w.records)
        .filter(([, r]) => r.status === "synced" && r.sfId && (r.kind === "lead" || r.kind === "deal" || r.kind === "task"))
        .map(([rk, r]) => ({ kind: r.kind as RemoteKind, key: rk.slice(rk.indexOf(":") + 1), sfId: r.sfId! }));
      const remote = await fetchRemote(rest, requests);
      const out = reconcile({
        leads: w.leads,
        deals: w.deals,
        followUps: w.followUps,
        records: w.records,
        remote: remote.snapshots,
        missing: remote.missing,
        ownerMap: w.ownerMap,
        policy: w.policy,
        isInSync: () => true,
        now,
      });
      w.leads = applyLeadPatches(w.leads, out.leadPatches);
      w.followUps = applyFollowUpPatches(w.followUps, out.followUpPatches);
      const committed = commitPull(w.records, w.conflicts, out, now.toISOString());
      w.records = adoptHashes(committed.records, { leads: w.leads, deals: w.deals, followUps: w.followUps });
      w.conflicts = committed.conflicts;
      w.lastPull = out;
      return out;
    },

    resolve(id: string, choice: Resolution) {
      const r = resolveConflict(w.records, w.conflicts, id, choice, { leads: w.leads, followUps: w.followUps });
      if (!r) throw new Error(`no conflict ${id}`);
      w.leads = applyLeadPatches(w.leads, r.leadPatches);
      w.followUps = applyFollowUpPatches(w.followUps, r.followUpPatches);
      w.records = adoptHashes(r.records, { leads: w.leads, deals: w.deals, followUps: w.followUps });
      w.conflicts = r.conflicts;
    },

    /** The Salesforce record behind an EventMail record. */
    sfRecord(kind: "lead" | "deal" | "task", key: string) {
      const table = kind === "lead" ? "Lead" : kind === "deal" ? "Opportunity" : "Task";
      const id = w.record(kind, key)?.sfId;
      return id ? sf.tables[table].find((r) => r.Id === id) : undefined;
    },

    /** Local edits (what a user does in the EventMail UI). */
    setStage(leadId: string, stage: SalesLead["stage"]) {
      w.leads = w.leads.map((l) => (l.id === leadId ? { ...l, stage, lastActivity: `Moved to ${stage}` } : l));
    },
    setOwner(leadId: string, owner: SalesLead["owner"]) {
      w.leads = w.leads.map((l) => (l.id === leadId ? { ...l, owner } : l));
    },
    setFollowUp(taskId: string, patch: Partial<FollowUpTask>) {
      w.followUps = w.followUps.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
    },
  };

  w.followUps = buildFollowUps(w.leads);
  w.activities = buildActivities(w.leads);
  return w;
}

export type World = ReturnType<typeof createWorld>;

/** First lead whose stage lets it have an Opportunity (so it has a deal). */
export function dealLead(w: World): SalesLead {
  const deal = w.deals.find((d) => !["Won", "Lost"].includes(d.stage));
  if (!deal) throw new Error("fixture has no open deal");
  return w.leads.find((l) => l.id === deal.leadId)!;
}
