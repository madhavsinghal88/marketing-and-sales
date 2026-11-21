/**
 * Two-way sync settings, kept in localStorage and exposed as an external store (same pattern
 * as syncStore): which side wins a conflict, how often to pull automatically, and the owner
 * mapping (one per Salesforce org, because user ids differ between orgs).
 */
import type { OwnerMap } from "./ownerMap";
import type { PullPolicy } from "./reconcile";

export type AutoPullMinutes = 0 | 1 | 5 | 15;

export type SfSettings = {
  policy: PullPolicy;
  /** 0 = only when the "Pull from Salesforce" button is clicked. */
  autoPullMinutes: AutoPullMinutes;
  /** Org key ("demo" or the instance URL) -> owner mapping. */
  ownerMaps: Record<string, OwnerMap>;
};

export const SETTINGS_STORAGE_KEY = "eventmail.salesforceSettings.v1";

export const DEFAULT_SETTINGS: SfSettings = Object.freeze({
  policy: "ask",
  autoPullMinutes: 0,
  ownerMaps: {},
}) as SfSettings;

let cache: SfSettings | null = null;
const listeners = new Set<() => void>();

function read(): SfSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<SfSettings>;
    const policy: PullPolicy =
      p.policy === "salesforce" || p.policy === "eventmail" || p.policy === "ask" ? p.policy : "ask";
    const minutes = [0, 1, 5, 15].includes(p.autoPullMinutes as number)
      ? (p.autoPullMinutes as AutoPullMinutes)
      : 0;
    return {
      policy,
      autoPullMinutes: minutes,
      ownerMaps: p.ownerMaps && typeof p.ownerMaps === "object" ? p.ownerMaps : {},
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getSettingsSnapshot(): SfSettings {
  if (cache === null) cache = read();
  return cache;
}

export function getSettingsServerSnapshot(): SfSettings {
  return DEFAULT_SETTINGS;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSettings(fn: (current: SfSettings) => SfSettings): void {
  cache = fn(getSettingsSnapshot());
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // storage full/blocked: the setting still applies for this session
    }
  }
  listeners.forEach((l) => l());
}
