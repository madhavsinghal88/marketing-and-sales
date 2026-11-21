import type { RemoteSnap } from "./mapping";
import type { Conflict } from "./reconcile";

/**
 * Remembers what has been pushed to Salesforce (which EventMail record is which
 * Salesforce record, and whether it is up to date). Lives in localStorage and is exposed
 * as an external store so React can subscribe without effects.
 */

export type SyncKind = "lead" | "deal" | "task" | "event";

export type SyncRecord = {
  kind: SyncKind;
  status: "synced" | "failed";
  sfId?: string;
  action?: string;
  at: string; // ISO
  hash: string; // fingerprint of the EventMail data at sync time
  note?: string;
  error?: string;
  demo?: boolean;
  /** EventMail-side values at the last time EventMail and Salesforce agreed. */
  base?: { stage?: string; owner?: string; done?: boolean };
  /** Salesforce-side values at the last time EventMail and Salesforce agreed. */
  remote?: RemoteSnap;
  /** Last time a Salesforce change was brought into EventMail for this record. */
  pulledAt?: string;
  pullNote?: string;
  /** The hash must be re-taken from the current EventMail data (after a pull changed it). */
  adopt?: boolean;
};

export type SyncLogEntry = {
  id: string;
  at: string; // ISO
  /** "pull" = a summary line for a Pull from Salesforce run. */
  kind: SyncKind | "pull";
  label: string;
  ok: boolean;
  message: string;
  /** Which way the data moved. Missing = a push (older log entries). */
  direction?: "push" | "pull";
  /** For pulls: what happened to the change. */
  tone?: "applied" | "conflict" | "kept" | "notice" | "removed";
};

export type SyncStoreState = {
  /** Which Salesforce org these records belong to ("demo" or the instance URL). */
  org: string;
  records: Record<string, SyncRecord>;
  log: SyncLogEntry[];
  /** Changes made on both sides that wait for a person to decide. */
  conflicts: Conflict[];
  lastPullAt?: string;
};

export const SYNC_STORAGE_KEY = "eventmail.salesforceSync.v1";
export const MAX_LOG = 200;

export const EMPTY_SYNC_STATE: SyncStoreState = Object.freeze({
  org: "",
  records: {},
  log: [],
  conflicts: [],
}) as SyncStoreState;

let cache: SyncStoreState | null = null;
const listeners = new Set<() => void>();

function read(): SyncStoreState {
  if (typeof window === "undefined") return EMPTY_SYNC_STATE;
  try {
    const raw = window.localStorage.getItem(SYNC_STORAGE_KEY);
    if (!raw) return EMPTY_SYNC_STATE;
    const parsed = JSON.parse(raw) as Partial<SyncStoreState>;
    if (
      parsed &&
      typeof parsed.org === "string" &&
      parsed.records &&
      typeof parsed.records === "object" &&
      Array.isArray(parsed.log)
    ) {
      return {
        org: parsed.org,
        records: parsed.records,
        log: parsed.log,
        conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
        lastPullAt: typeof parsed.lastPullAt === "string" ? parsed.lastPullAt : undefined,
      };
    }
  } catch {
    // corrupted storage: start clean
  }
  return EMPTY_SYNC_STATE;
}

export function getSyncSnapshot(): SyncStoreState {
  if (cache === null) cache = read();
  return cache;
}

export function getSyncServerSnapshot(): SyncStoreState {
  return EMPTY_SYNC_STATE;
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSyncStore(fn: (current: SyncStoreState) => SyncStoreState): void {
  cache = fn(getSyncSnapshot());
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // storage full/blocked: still works for this session
    }
  }
  listeners.forEach((l) => l());
}

export const recordKey = (kind: SyncKind, key: string) => `${kind}:${key}`;

/** Test helper: forget the in-memory copy so the next read hits storage again. */
export function resetSyncStoreCache(): void {
  cache = null;
}
