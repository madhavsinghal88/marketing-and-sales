/**
 * Remembers the edits a user (or a Salesforce pull) made to leads and follow-ups, because the
 * lists themselves are rebuilt from sample data on every page load. Without this, a stage
 * pulled from Salesforce would silently revert on refresh while the sync bookkeeping still
 * believed EventMail agreed with Salesforce.
 */
import type { FollowUpTask, SalesLead } from "./types";

export const LEAD_OVERRIDES_KEY = "eventmail.leadOverrides.v1";
export const FOLLOWUP_OVERRIDES_KEY = "eventmail.followUpOverrides.v1";

export type LeadOverride = Pick<SalesLead, "stage" | "owner" | "lastActivity">;
export type FollowUpOverride = Pick<FollowUpTask, "status" | "dueLabel" | "owner">;

/** Only what differs from the freshly built list is stored. Leads with no baseline are kept whole. */
export function diffLeads(base: SalesLead[], current: SalesLead[]): Record<string, LeadOverride> {
  const baseById = new Map(base.map((l) => [l.id, l]));
  const out: Record<string, LeadOverride> = {};
  for (const l of current) {
    const b = baseById.get(l.id);
    if (!b || b.stage !== l.stage || b.owner !== l.owner || b.lastActivity !== l.lastActivity) {
      out[l.id] = { stage: l.stage, owner: l.owner, lastActivity: l.lastActivity };
    }
  }
  return out;
}

export function applyLeadOverrides(
  leads: SalesLead[],
  overrides: Record<string, LeadOverride>,
): SalesLead[] {
  if (Object.keys(overrides).length === 0) return leads;
  return leads.map((l) => (overrides[l.id] ? { ...l, ...overrides[l.id] } : l));
}

export function diffFollowUps(
  base: FollowUpTask[],
  current: FollowUpTask[],
): Record<string, FollowUpOverride> {
  const baseById = new Map(base.map((t) => [t.id, t]));
  const out: Record<string, FollowUpOverride> = {};
  for (const t of current) {
    const b = baseById.get(t.id);
    if (!b || b.status !== t.status || b.dueLabel !== t.dueLabel || b.owner !== t.owner) {
      out[t.id] = { status: t.status, dueLabel: t.dueLabel, owner: t.owner };
    }
  }
  return out;
}

export function applyFollowUpOverrides(
  tasks: FollowUpTask[],
  overrides: Record<string, FollowUpOverride>,
): FollowUpTask[] {
  if (Object.keys(overrides).length === 0) return tasks;
  return tasks.map((t) => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t));
}

function load<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/blocked: edits just won't survive a refresh
  }
}

export const loadLeadOverrides = () => load<LeadOverride>(LEAD_OVERRIDES_KEY);
export const saveLeadOverrides = (o: Record<string, LeadOverride>) => save(LEAD_OVERRIDES_KEY, o);
export const loadFollowUpOverrides = () => load<FollowUpOverride>(FOLLOWUP_OVERRIDES_KEY);
export const saveFollowUpOverrides = (o: Record<string, FollowUpOverride>) =>
  save(FOLLOWUP_OVERRIDES_KEY, o);
