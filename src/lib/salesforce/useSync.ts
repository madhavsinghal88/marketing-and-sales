"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SALES_OWNERS } from "../types";
import type {
  Deal,
  EventItem,
  FollowUpTask,
  SalesActivity,
  SalesLead,
} from "../types";
import type { RemoteSnap, SyncResult } from "./mapping";
import type { CampaignResult } from "./sync";
import {
  adoptHashes,
  commitPull,
  isInSync,
  prepareDeals,
  prepareLeads,
  prepareTasks,
  resolveConflict as resolveOne,
  type PrepContext,
  type Resolution,
} from "./engine";
import { eventHash, eventToPayload, followUpHash, dealHash, leadHash } from "./payloads";
import {
  autoMatchOwners as autoMatch,
  type OwnerLink,
  type OwnerMap,
} from "./ownerMap";
import {
  reconcile,
  type Conflict,
  type FollowUpPatch,
  type LeadPatch,
  type PullPolicy,
  type ReconcileOutput,
} from "./reconcile";
import {
  emptyStats,
  mergeResults,
  mergeStats,
  type Stats,
  type SyncEntry,
} from "./records";
import type { SfUser } from "./remote";
import {
  getSettingsServerSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
  updateSettings,
  type AutoPullMinutes,
  type SfSettings,
} from "./settingsStore";
import {
  getSyncServerSnapshot,
  getSyncSnapshot,
  MAX_LOG,
  recordKey,
  subscribeSync,
  updateSyncStore,
  type SyncKind,
  type SyncLogEntry,
  type SyncRecord,
  type SyncStoreState,
} from "./syncStore";

export type SyncState = "none" | "synced" | "stale" | "failed";
export type SyncView = { state: SyncState; record?: SyncRecord };

export type SyncSummary = {
  leads: number;
  deals: number;
  tasks: number;
  events: number;
  failed: number;
  stale: number;
  conflicts: number;
};

export type DemoChange = {
  status?: string;
  stage?: string;
  taskStatus?: string;
  ownerId?: string;
  remove?: boolean;
};

export type SalesforceSyncApi = {
  connected: boolean;
  mode: "demo" | "live" | null;
  busy: string | null;
  summary: SyncSummary;
  log: SyncLogEntry[];
  /** Changes made on both sides that wait for a decision. */
  conflicts: Conflict[];
  lastPullAt: string | null;
  settings: SfSettings;
  /** EventMail owner -> Salesforce user, for the connected org. */
  ownerMap: OwnerMap;
  /** Link that opens the record in Salesforce (null in demo mode). */
  linkFor: (record?: SyncRecord) => string | null;
  requestConnect: () => void;
  leadState: (lead: SalesLead) => SyncView;
  dealState: (deal: Deal) => SyncView;
  taskState: (task: FollowUpTask) => SyncView;
  eventState: (event: EventItem) => SyncView;
  /** The open conflict on a lead or follow-up, if any. */
  conflictFor: (target: Conflict["target"], id: string) => Conflict | undefined;
  syncLeads: (leads: SalesLead[], label?: string) => Promise<void>;
  syncDeals: (deals?: Deal[]) => Promise<void>;
  syncFollowUps: () => Promise<void>;
  syncEvent: (event: EventItem) => Promise<void>;
  syncEverything: () => Promise<void>;
  /** Re-send only the records whose last sync failed. */
  retryFailed: () => Promise<void>;
  /** Bring changes made in Salesforce back into EventMail. */
  pull: (silent?: boolean) => Promise<void>;
  resolveConflict: (id: string, choice: Resolution) => void;
  resolveAllConflicts: (choice: Resolution) => void;
  setPolicy: (policy: PullPolicy) => void;
  setAutoPull: (minutes: AutoPullMinutes) => void;
  setOwnerLink: (owner: string, user: SfUser | null) => void;
  autoMatchOwners: (users: SfUser[]) => { matched: string[]; unmatched: string[] };
  clearLog: () => void;
  /** Demo mode only: wipe the pretend Salesforce and EventMail's sync records and edits. */
  resetDemo: () => Promise<void>;
  /** Demo mode only: act as a Salesforce rep. Returns an error message or null. */
  simulateRemote: (
    kind: "lead" | "deal" | "task",
    key: string,
    change: DemoChange,
  ) => Promise<string | null>;
};

type Options = {
  connected: boolean;
  mode: "demo" | "live" | null;
  instanceUrl: string | null;
  /** The Salesforce user EventMail is connected as. */
  userId: string | null;
  leads: SalesLead[];
  deals: Deal[];
  followUps: FollowUpTask[];
  activities: SalesActivity[];
  events: EventItem[];
  onToast: (message: string) => void;
  onAuthLost: () => void;
  onNeedConnect: () => void;
  /** Demo reset: put leads and follow-ups back to their starting data. */
  onResetData: () => void;
  /** Apply changes pulled from Salesforce to the lead / follow-up lists. */
  onApplyPull: (patches: { leadPatches: LeadPatch[]; followUpPatches: FollowUpPatch[] }) => void;
};

class SyncError extends Error {}

const EMPTY_RECORDS: Record<string, SyncRecord> = {};
const EMPTY_CONFLICTS: Conflict[] = [];
const EMPTY_OWNERS: OwnerMap = {};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function describe(noun: string, nounPlural: string, s: Stats): string {
  if (s.total === 0) return `Nothing to sync for ${nounPlural}.`;
  const parts = [
    s.created ? `${s.created} created` : "",
    s.updated ? `${s.updated} updated` : "",
    s.skipped ? `${s.skipped} skipped` : "",
    s.held ? `${s.held} left alone because a rep changed it in Salesforce` : "",
  ].filter(Boolean);
  const head = `${plural(s.ok, noun, nounPlural)} synced to Salesforce${parts.length ? ` (${parts.join(", ")})` : ""}`;
  if (s.failed === 0) return `${head}.`;
  const why = s.firstError ? ` ${s.firstError.slice(0, 140)}` : "";
  return `${head}, ${s.failed} failed.${why}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function pullMessage(out: ReconcileOutput): string {
  const c = out.counts;
  if (c.checked === 0 && c.removed === 0) {
    return "Nothing to pull yet. Sync some records to Salesforce first.";
  }
  const parts = [
    c.applied ? `${plural(c.applied, "change")} brought into EventMail` : "",
    c.conflicts ? `${plural(c.conflicts, "conflict")} need${c.conflicts === 1 ? "s" : ""} your decision` : "",
    c.kept ? `${c.kept} kept as in EventMail` : "",
    c.notices ? plural(c.notices, "owner notice") : "",
    c.removed ? `${c.removed} no longer in Salesforce` : "",
  ].filter(Boolean);
  if (parts.length === 0) return `Already up to date. ${plural(c.checked, "record")} checked in Salesforce.`;
  return `Pulled from Salesforce (${plural(c.checked, "record")} checked): ${parts.join(", ")}.`;
}

export function useSalesforceSync(opts: Options): SalesforceSyncApi {
  const { connected, mode, instanceUrl, userId, leads, deals, followUps, activities, events } = opts;
  const { onToast, onAuthLost, onNeedConnect, onApplyPull, onResetData } = opts;

  const store = useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncServerSnapshot);
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getSettingsServerSnapshot,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const retriesRef = useRef(0);

  const org = !connected ? "" : mode === "demo" ? "demo" : (instanceUrl ?? "");
  const records = org && store.org === org ? store.records : EMPTY_RECORDS;
  const conflicts = org && store.org === org ? store.conflicts : EMPTY_CONFLICTS;
  const ownerMap = (org && settings.ownerMaps[org]) || EMPTY_OWNERS;

  /* ——— always-fresh reads (the store can change between awaits) ——— */

  const snapRecords = () => {
    const s = getSyncSnapshot();
    return s.org === org ? s.records : EMPTY_RECORDS;
  };
  const snapConflicts = () => {
    const s = getSyncSnapshot();
    return s.org === org ? s.conflicts : EMPTY_CONFLICTS;
  };
  const snapOwnerMap = () => (org && getSettingsSnapshot().ownerMaps[org]) || EMPTY_OWNERS;
  const prepCtx = (): PrepContext => ({
    records: snapRecords(),
    ownerMap: snapOwnerMap(),
    integrationUserId: userId,
    conflicts: snapConflicts(),
  });

  /** Update the store, starting from a clean slate when the connected org changed. */
  function mutate(fn: (base: SyncStoreState) => SyncStoreState) {
    updateSyncStore((s) =>
      fn(s.org === org ? s : { org, records: {}, log: [], conflicts: [], lastPullAt: undefined }),
    );
  }

  function view(kind: SyncKind, key: string, hash: string): SyncView {
    const record = records[recordKey(kind, key)];
    if (!record) return { state: "none" };
    if (record.status === "failed") return { state: "failed", record };
    return { state: record.hash === hash ? "synced" : "stale", record };
  }

  // After a pull changed EventMail data, records that were up to date re-take their hash so
  // they don't show "Changed" for a change that came from Salesforce itself.
  useEffect(() => {
    if (!org) return;
    updateSyncStore((s) => {
      if (s.org !== org) return s;
      const next = adoptHashes(s.records, { leads, deals, followUps });
      return next === s.records ? s : { ...s, records: next };
    });
  }, [store, leads, deals, followUps, org]);

  /* ——— talking to the server ——— */

  async function post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new SyncError("Network error while talking to Salesforce.");
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; retries?: number };
    if (res.status === 401) {
      onAuthLost();
      throw new SyncError(data.error ?? "Salesforce session expired. Reconnect Salesforce.");
    }
    if (!res.ok) throw new SyncError(data.error ?? `Salesforce sync failed (${res.status}).`);
    retriesRef.current += data.retries ?? 0;
    return data;
  }

  /** Writes results into the store + log, returns counts. */
  function applyResults(
    kind: SyncKind,
    entries: SyncEntry[],
    results: SyncResult[],
    demo: boolean,
  ): Stats {
    const nowIso = new Date().toISOString();
    let stats = emptyStats();
    mutate((base) => {
      const merged = mergeResults(base.records, kind, entries, results, nowIso, demo);
      stats = merged.stats;
      return {
        ...base,
        records: merged.records,
        log: [...merged.log.reverse(), ...base.log].slice(0, MAX_LOG),
      };
    });
    return stats;
  }

  /* ——— the actual pushes ——— */

  async function pushLeads(list: SalesLead[]): Promise<Stats> {
    let total = emptyStats();
    for (const part of chunk(list, 25)) {
      const prepared = prepareLeads(part, prepCtx());
      const data = await post<{ mode: string; results: SyncResult[] }>(
        "/api/salesforce/sync/leads",
        { leads: prepared.map((p) => p.payload) },
      );
      total = mergeStats(
        total,
        applyResults("lead", prepared.map((p) => p.entry), data.results, data.mode === "demo"),
      );
    }
    return total;
  }

  /** Make sure these leads exist in Salesforce (deals/tasks/campaigns hang off them). */
  async function ensureLeads(list: SalesLead[]): Promise<Map<string, string>> {
    const missing = list.filter((l) => {
      const r = snapRecords()[recordKey("lead", l.id)];
      return !r || r.status !== "synced" || !r.sfId;
    });
    if (missing.length > 0) await pushLeads(missing);
    const out = new Map<string, string>();
    for (const l of list) {
      const r = snapRecords()[recordKey("lead", l.id)];
      if (r?.status === "synced" && r.sfId) out.set(l.id, r.sfId);
    }
    return out;
  }

  async function pushDeals(list: Deal[]): Promise<Stats> {
    let total = emptyStats();
    for (const part of chunk(list, 25)) {
      const prepared = prepareDeals(part, leads, prepCtx());
      const data = await post<{ mode: string; results: SyncResult[] }>(
        "/api/salesforce/sync/deals",
        { deals: prepared.map((p) => p.payload) },
      );
      total = mergeStats(
        total,
        applyResults("deal", prepared.map((p) => p.entry), data.results, data.mode === "demo"),
      );
    }
    return total;
  }

  /** `only` limits the push to those follow-up / activity ids (used by "Retry failed"). */
  async function pushFollowUps(only?: Set<string>): Promise<Stats> {
    const fu = only ? followUps.filter((t) => only.has(t.id)) : followUps;
    const act = only ? activities.filter((a) => only.has(a.id)) : activities;
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const needed = new Set([...fu.map((t) => t.leadId), ...act.map((a) => a.leadId)]);
    const leadSfIds = await ensureLeads(
      [...needed].map((id) => leadById.get(id)).filter((l): l is SalesLead => Boolean(l)),
    );

    const items = prepareTasks({ followUps: fu, activities: act, leads, leadSfIds }, prepCtx());
    let total = emptyStats();
    for (const part of chunk(items, 50)) {
      const data = await post<{ mode: string; results: SyncResult[] }>(
        "/api/salesforce/sync/tasks",
        { tasks: part.map((i) => i.payload) },
      );
      total = mergeStats(
        total,
        applyResults("task", part.map((i) => i.entry), data.results, data.mode === "demo"),
      );
    }
    return total;
  }

  async function pushEvent(event: EventItem): Promise<Stats> {
    const eventLeads = leads.filter((l) => l.eventId === event.id);
    const sfIds = await ensureLeads(eventLeads);
    const data = await post<{ mode: string; result: CampaignResult }>(
      "/api/salesforce/sync/campaign",
      { event: eventToPayload(event, eventLeads, (id) => sfIds.get(id)) },
    );
    const stats = applyResults(
      "event",
      [{ key: event.id, label: event.name, hash: eventHash(event, eventLeads.length) }],
      [data.result],
      data.mode === "demo",
    );
    if (data.result.ok && data.result.note) stats.firstError = undefined;
    return stats;
  }

  /* ——— pull: Salesforce -> EventMail ——— */

  async function pullNow(silent: boolean): Promise<string | null> {
    const recs = snapRecords();
    const items = Object.entries(recs)
      .filter(
        ([, r]) =>
          r.status === "synced" &&
          r.sfId &&
          (r.kind === "lead" || r.kind === "deal" || r.kind === "task"),
      )
      .map(([rk, r]) => ({
        kind: r.kind as "lead" | "deal" | "task",
        key: rk.slice(rk.indexOf(":") + 1),
        sfId: r.sfId as string,
        // Only the demo org needs the baseline (it forgets everything on a server restart).
        baseline: mode === "demo" ? (r.remote as RemoteSnap | undefined) : undefined,
      }));
    if (items.length === 0) return "Nothing to pull yet. Sync some records to Salesforce first.";

    const data = await post<{
      pulledAt?: string;
      snapshots: Record<string, RemoteSnap>;
      missing: string[];
    }>("/api/salesforce/pull", { items });

    const now = new Date();
    const nowIso = now.toISOString();
    const out = reconcile({
      leads,
      deals,
      followUps,
      records: recs,
      remote: data.snapshots,
      missing: data.missing,
      ownerMap: snapOwnerMap(),
      policy: getSettingsSnapshot().policy,
      isInSync: isInSync(recs, { leads, deals, followUps }),
      now,
    });

    if (out.leadPatches.length || out.followUpPatches.length) {
      onApplyPull({ leadPatches: out.leadPatches, followUpPatches: out.followUpPatches });
    }

    const message = pullMessage(out);
    const entries: SyncLogEntry[] = [
      {
        id: `${nowIso}-pull`,
        at: nowIso,
        kind: "pull",
        label: silent ? "Automatic pull" : "Pull from Salesforce",
        ok: out.counts.conflicts === 0,
        message,
        direction: "pull",
      },
      ...out.changes.map((c, i): SyncLogEntry => ({
        id: `${nowIso}-pull-${i}`,
        at: nowIso,
        kind: c.kind,
        label: c.label,
        ok: c.tone !== "conflict",
        message: c.message,
        direction: "pull",
        tone: c.tone,
      })),
    ];
    mutate((base) => {
      const c = commitPull(base.records, base.conflicts, out, nowIso);
      return {
        ...base,
        records: c.records,
        conflicts: c.conflicts,
        lastPullAt: data.pulledAt ?? nowIso,
        // newest first; a quiet pull (nothing changed) is recorded as one line only
        log: [...(out.changes.length ? entries : entries.slice(0, 1)), ...base.log].slice(0, MAX_LOG),
      };
    });

    const quiet =
      out.counts.applied + out.counts.conflicts + out.counts.kept + out.counts.notices + out.counts.removed === 0;
    return silent && quiet ? null : message;
  }

  /* ——— conflict resolution ——— */

  function settle(ids: string[], choice: Resolution) {
    let recs = snapRecords();
    let open = snapConflicts();
    const leadPatches: LeadPatch[] = [];
    const followUpPatches: FollowUpPatch[] = [];
    const nowIso = new Date().toISOString();
    const entries: SyncLogEntry[] = [];

    for (const id of ids) {
      const c = open.find((x) => x.id === id);
      const r = resolveOne(recs, open, id, choice, { leads, followUps });
      if (!c || !r) continue;
      recs = r.records;
      open = r.conflicts;
      leadPatches.push(...r.leadPatches);
      followUpPatches.push(...r.followUpPatches);
      entries.push({
        id: `${nowIso}-resolve-${id}`,
        at: nowIso,
        kind: c.target === "lead" ? "lead" : "task",
        label: c.label,
        ok: true,
        direction: "pull",
        tone: choice === "salesforce" ? "applied" : "kept",
        message:
          choice === "salesforce"
            ? `${c.field === "done" ? "Status" : c.field === "owner" ? "Owner" : "Stage"} set to ${c.remote} (Salesforce value kept)`
            : `Kept EventMail's ${c.field === "done" ? "status" : c.field} (${c.local}); Salesforce left as is`,
      });
    }
    if (entries.length === 0) return;
    if (leadPatches.length || followUpPatches.length) onApplyPull({ leadPatches, followUpPatches });
    mutate((base) => ({
      ...base,
      records: recs,
      conflicts: open,
      log: [...entries.reverse(), ...base.log].slice(0, MAX_LOG),
    }));
    onToast(
      entries.length === 1
        ? entries[0].message
        : `${entries.length} conflicts settled (${choice === "salesforce" ? "Salesforce values used" : "EventMail values kept"}).`,
    );
  }

  /* ——— guarded entry points used by the UI ——— */

  async function run(label: string, job: () => Promise<string | null>): Promise<void> {
    if (!connected) {
      onNeedConnect();
      return;
    }
    if (busyRef.current) {
      onToast("A Salesforce sync is already running.");
      return;
    }
    busyRef.current = label;
    retriesRef.current = 0;
    setBusy(label);
    try {
      const message = await job();
      if (message) {
        const retried = retriesRef.current;
        onToast(
          retried > 0
            ? `${message} (Salesforce was busy, ${plural(retried, "request")} retried automatically.)`
            : message,
        );
      }
    } catch (e) {
      onToast(e instanceof SyncError ? e.message : "Salesforce sync failed unexpectedly.");
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }

  const confirmBulk = (what: string) =>
    typeof window === "undefined" ||
    window.confirm(`${what}\n\nThis creates or updates records in ${mode === "demo" ? "the demo (simulated) org" : "your Salesforce org"}. Continue?`);

  // The interval must call the latest closure (fresh leads / followUps), so it goes through a ref.
  const pullRef = useRef<(silent: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    pullRef.current = (silent) =>
      run(silent ? "Checking Salesforce…" : "Pulling from Salesforce…", () => pullNow(silent));
  });
  useEffect(() => {
    if (!connected || settings.autoPullMinutes === 0) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busyRef.current) void pullRef.current(true);
    }, settings.autoPullMinutes * 60_000);
    return () => window.clearInterval(id);
  }, [connected, settings.autoPullMinutes, org]);

  const failedKeys = (kind: SyncKind) =>
    Object.entries(records)
      .filter(([, r]) => r.kind === kind && r.status === "failed")
      .map(([rk]) => rk.slice(rk.indexOf(":") + 1));

  return {
    connected,
    mode,
    busy,
    log: store.org === org ? store.log : [],
    conflicts,
    lastPullAt: store.org === org ? (store.lastPullAt ?? null) : null,
    settings,
    ownerMap,
    summary: (() => {
      const s: SyncSummary = { leads: 0, deals: 0, tasks: 0, events: 0, failed: 0, stale: 0, conflicts: conflicts.length };
      for (const r of Object.values(records)) {
        if (r.status === "failed") s.failed += 1;
        else if (r.kind === "lead") s.leads += 1;
        else if (r.kind === "deal") s.deals += 1;
        else if (r.kind === "task") s.tasks += 1;
        else s.events += 1;
      }
      return s;
    })(),
    linkFor: (record) =>
      record?.sfId && !record.demo && instanceUrl ? `${instanceUrl.replace(/\/+$/, "")}/${record.sfId}` : null,
    requestConnect: onNeedConnect,

    leadState: (l) => view("lead", l.id, leadHash(l)),
    dealState: (d) => view("deal", d.id, dealHash(d)),
    taskState: (t) => view("task", t.id, followUpHash(t)),
    eventState: (e) =>
      view("event", e.id, eventHash(e, leads.filter((l) => l.eventId === e.id).length)),
    conflictFor: (target, id) => conflicts.find((c) => c.target === target && c.targetId === id),

    syncLeads: (list, label) => {
      if (list.length > 1 && connected && !confirmBulk(`Sync ${plural(list.length, "lead")}${label ? ` (${label})` : ""}?`)) {
        return Promise.resolve();
      }
      return run("Syncing leads…", async () => {
        const stats = await pushLeads(list);
        return list.length === 1 && stats.failed
          ? `Could not sync ${list[0].name}: ${stats.firstError?.split(": ").slice(1).join(": ")}`
          : describe("lead", "leads", stats);
      });
    },

    syncDeals: (list) => {
      const target = list ?? deals;
      if (target.length > 1 && connected && !confirmBulk(`Sync ${plural(target.length, "deal")} as Salesforce Opportunities?`)) {
        return Promise.resolve();
      }
      return run("Syncing deals…", async () => describe("deal", "deals", await pushDeals(target)));
    },

    syncFollowUps: () => {
      if (connected && !confirmBulk(`Sync ${plural(followUps.length, "follow-up")} and ${plural(activities.length, "activity", "activities")} as Salesforce Tasks? Their leads are synced first if needed.`)) {
        return Promise.resolve();
      }
      return run("Syncing tasks…", async () => describe("task", "tasks", await pushFollowUps()));
    },

    syncEvent: (event) => {
      const n = leads.filter((l) => l.eventId === event.id).length;
      if (connected && !confirmBulk(`Sync "${event.name}" as a Salesforce Campaign with its ${plural(n, "lead")}? Leads not yet in Salesforce are created first.`)) {
        return Promise.resolve();
      }
      return run(`Syncing ${event.name}…`, async () => {
        const stats = await pushEvent(event);
        if (stats.failed) return `Campaign sync failed. ${stats.firstError ?? ""}`.trim();
        const rec = getSyncSnapshot().records[recordKey("event", event.id)];
        return `Campaign "${event.name}" synced${rec?.note ? `: ${rec.note}` : ""}.`;
      });
    },

    syncEverything: () => {
      const eventsWithLeads = events.filter((e) => leads.some((l) => l.eventId === e.id));
      if (
        connected &&
        !confirmBulk(
          `Sync everything?\n• ${plural(leads.length, "lead")}\n• ${plural(deals.length, "deal")}\n• ${plural(followUps.length + activities.length, "task")}\n• ${plural(eventsWithLeads.length, "campaign")}`,
        )
      ) {
        return Promise.resolve();
      }
      return run("Syncing leads…", async () => {
        const step = (label: string) => {
          busyRef.current = label;
          setBusy(label);
        };
        const l = await pushLeads(leads);
        step("Syncing deals…");
        const d = await pushDeals(deals);
        step("Syncing tasks…");
        const t = await pushFollowUps();
        let c = emptyStats();
        for (const e of eventsWithLeads) {
          step(`Syncing ${e.name}…`);
          c = mergeStats(c, await pushEvent(e));
        }
        const failed = l.failed + d.failed + t.failed + c.failed;
        const held = l.held + d.held + t.held;
        return `Synced ${l.ok} leads, ${d.ok} deals, ${t.ok} tasks, ${c.ok} campaigns${held ? `. ${held} fields left alone because a rep changed them in Salesforce (pull to review)` : ""}${failed ? `, ${failed} failed (see Sync log)` : ""}.`;
      });
    },

    retryFailed: () =>
      run("Retrying failed…", async () => {
        const failedLeads = new Set(failedKeys("lead"));
        const failedDeals = new Set(failedKeys("deal"));
        const failedTasks = new Set(failedKeys("task"));
        const failedEvents = new Set(failedKeys("event"));
        const total = failedLeads.size + failedDeals.size + failedTasks.size + failedEvents.size;
        if (total === 0) return "Nothing failed. Everything synced so far is fine.";

        let ok = 0;
        let failed = 0;
        const add = (s: Stats) => {
          ok += s.ok;
          failed += s.failed;
        };
        if (failedLeads.size) add(await pushLeads(leads.filter((l) => failedLeads.has(l.id))));
        if (failedDeals.size) add(await pushDeals(deals.filter((d) => failedDeals.has(d.id))));
        if (failedTasks.size) add(await pushFollowUps(failedTasks));
        for (const e of events.filter((x) => failedEvents.has(x.id))) add(await pushEvent(e));
        return failed
          ? `Retried ${total}: ${ok} now synced, ${failed} still failing (see Sync log).`
          : `Retried ${total}: all synced.`;
      }),

    pull: (silent = false) => {
      if (!connected) {
        onNeedConnect();
        return Promise.resolve();
      }
      if (silent && busyRef.current) return Promise.resolve();
      return run(silent ? "Checking Salesforce…" : "Pulling from Salesforce…", () => pullNow(silent));
    },

    resolveConflict: (id, choice) => settle([id], choice),
    resolveAllConflicts: (choice) => settle(snapConflicts().map((c) => c.id), choice),

    setPolicy: (policy) => updateSettings((s) => ({ ...s, policy })),
    setAutoPull: (autoPullMinutes) => updateSettings((s) => ({ ...s, autoPullMinutes })),

    setOwnerLink: (owner, user) => {
      if (!org) return;
      updateSettings((s) => {
        const map: OwnerMap = { ...(s.ownerMaps[org] ?? {}) };
        if (user) {
          const link: OwnerLink = { sfUserId: user.id, sfName: user.name, sfEmail: user.email || undefined };
          map[owner] = link;
        } else {
          delete map[owner];
        }
        return { ...s, ownerMaps: { ...s.ownerMaps, [org]: map } };
      });
    },

    autoMatchOwners: (users) => {
      const result = autoMatch(SALES_OWNERS, users, snapOwnerMap());
      if (org && result.matched.length > 0) {
        updateSettings((s) => ({ ...s, ownerMaps: { ...s.ownerMaps, [org]: result.map } }));
      }
      return { matched: result.matched, unmatched: result.unmatched };
    },

    clearLog: () => mutate((base) => ({ ...base, log: [] })),

    resetDemo: async () => {
      if (mode !== "demo") return;
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          "Reset the demo? This clears the pretend Salesforce, the sync records and log, and any stage / owner edits made in EventMail, so you can start the walkthrough from scratch.",
        )
      ) {
        return;
      }
      try {
        const res = await fetch("/api/salesforce/demo/reset", { method: "POST" });
        if (!res.ok) throw new Error("reset failed");
      } catch {
        onToast("Could not reset the demo.");
        return;
      }
      updateSyncStore(() => ({ org, records: {}, log: [], conflicts: [], lastPullAt: undefined }));
      updateSettings((s) => {
        const maps = { ...s.ownerMaps };
        delete maps[org];
        return { ...s, ownerMaps: maps };
      });
      onResetData();
      onToast("Demo reset. Nothing is synced yet.");
    },

    simulateRemote: async (kind, key, change) => {
      const rec = snapRecords()[recordKey(kind, key)];
      if (!rec?.sfId) return "Sync this record to Salesforce first.";
      try {
        const res = await fetch("/api/salesforce/demo/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ change: { kind, sfId: rec.sfId, ...change }, fallback: rec.remote }),
        });
        if (res.ok) return null;
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return data.error ?? "Could not change the demo record.";
      } catch {
        return "Network error.";
      }
    },
  };
}
