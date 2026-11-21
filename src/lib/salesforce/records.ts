/**
 * Pure bookkeeping for sync results: turns what the server answered into the records EventMail
 * remembers (which Salesforce record is which, and the baselines used to detect later changes).
 */
import type { RemoteSnap, SyncResult } from "./mapping";
import { recordKey, type SyncKind, type SyncLogEntry, type SyncRecord } from "./syncStore";

export type Stats = {
  total: number;
  ok: number;
  failed: number;
  created: number;
  updated: number;
  skipped: number;
  /** Writes skipped on purpose because a rep had changed that field in Salesforce. */
  held: number;
  firstError?: string;
};

export const emptyStats = (): Stats => ({
  total: 0,
  ok: 0,
  failed: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  held: 0,
});

export function mergeStats(a: Stats, b: Stats): Stats {
  return {
    total: a.total + b.total,
    ok: a.ok + b.ok,
    failed: a.failed + b.failed,
    created: a.created + b.created,
    updated: a.updated + b.updated,
    skipped: a.skipped + b.skipped,
    held: a.held + b.held,
    firstError: a.firstError ?? b.firstError,
  };
}

export type SyncEntry = {
  key: string;
  label: string;
  /** Fingerprint of the EventMail data that was sent. */
  hash: string;
  /** EventMail-side values that were sent (the "we agreed on this" side of the baseline). */
  base?: SyncRecord["base"];
};

/**
 * The Salesforce-side baseline after a push. A field EventMail did NOT write keeps its old
 * baseline: if a rep changed it, the next pull must still see that as a change instead of
 * having it silently absorbed by the push.
 */
export function mergeBaseline(
  prev: RemoteSnap | undefined,
  snap: RemoteSnap | undefined,
  result: Pick<SyncResult, "wrote" | "action">,
): RemoteSnap | undefined {
  if (!snap) return prev;
  if (!prev || result.action === "created" || result.wrote === undefined) return snap;

  const next: RemoteSnap = { ...prev, sfId: snap.sfId, modified: snap.modified };
  for (const field of result.wrote) {
    if (field === "status") {
      next.status = snap.status;
      next.converted = snap.converted;
    } else if (field === "stage") {
      next.stage = snap.stage;
      next.isClosed = snap.isClosed;
      next.isWon = snap.isWon;
    } else if (field === "taskStatus") {
      next.taskStatus = snap.taskStatus;
      next.isClosed = snap.isClosed;
    } else if (field === "owner") {
      next.ownerId = snap.ownerId;
      next.ownerName = snap.ownerName;
    }
  }
  return next;
}

/**
 * EventMail-side baseline after a push. A field whose write was held back (a rep changed it in
 * Salesforce first) keeps its old baseline: EventMail's value was NOT agreed with Salesforce,
 * so a later pull has to see it as a conflict rather than quietly adopting either side.
 */
export function mergeBase(
  prev: SyncRecord["base"],
  sent: SyncRecord["base"],
  heldFields: ("stage" | "owner" | "done")[] = [],
): SyncRecord["base"] {
  if (!sent) return prev;
  const next = { ...sent };
  for (const f of heldFields) {
    if (prev && prev[f] !== undefined) (next as Record<string, unknown>)[f] = prev[f];
  }
  return next;
}

export function mergeResults(
  prev: Record<string, SyncRecord>,
  kind: SyncKind,
  entries: SyncEntry[],
  results: SyncResult[],
  nowIso: string,
  demo: boolean,
): { records: Record<string, SyncRecord>; stats: Stats; log: SyncLogEntry[] } {
  const stats = emptyStats();
  const records = { ...prev };
  const log: SyncLogEntry[] = [];
  const byKey = new Map(results.map((r) => [r.key, r]));

  for (const entry of entries) {
    const r = byKey.get(entry.key);
    const k = recordKey(kind, entry.key);
    const before = prev[k];
    stats.total += 1;

    if (r?.ok) {
      stats.ok += 1;
      if (r.action === "created") stats.created += 1;
      else if (r.action === "updated") stats.updated += 1;
      else if (r.action === "skipped") stats.skipped += 1;
      if (r.held) stats.held += 1;
      records[k] = {
        kind,
        status: "synced",
        sfId: r.sfId,
        action: r.action,
        at: nowIso,
        hash: entry.hash,
        note: [r.note, r.held].filter(Boolean).join(" · ") || undefined,
        demo,
        base: mergeBase(before?.base, entry.base, r.heldFields),
        remote: mergeBaseline(before?.remote, r.remote, r),
        pulledAt: before?.pulledAt,
        // the "updated from Salesforce" chip disappears once EventMail has pushed again
        pullNote: undefined,
      };
    } else {
      stats.failed += 1;
      const error = r?.error ?? "No result returned for this record.";
      stats.firstError ??= `${entry.label}: ${error}`;
      records[k] = {
        kind,
        status: "failed",
        sfId: before?.sfId,
        at: nowIso,
        hash: entry.hash,
        error,
        demo,
        base: before?.base,
        remote: before?.remote,
        pulledAt: before?.pulledAt,
        pullNote: before?.pullNote,
      };
    }

    log.push({
      id: `${nowIso}-${k}`,
      at: nowIso,
      kind,
      label: entry.label,
      ok: Boolean(r?.ok),
      direction: "push",
      message: r?.ok
        ? `${r.action ?? "synced"}${r.note ? `: ${r.note}` : ""}${r.held ? ` · ${r.held}` : ""}`
        : (r?.error ?? "Failed"),
    });
  }
  return { records, stats, log };
}
