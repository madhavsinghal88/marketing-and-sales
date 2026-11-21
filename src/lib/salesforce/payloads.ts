/**
 * Turns EventMail objects into sync payloads, and computes the "has this changed since
 * it was synced?" hash for each. Pure; imports types only so tests can run it in Node.
 */
import type {
  Deal,
  EventItem,
  FollowUpTask,
  SalesActivity,
  SalesLead,
} from "../types";
import type { SyncRecord } from "./syncStore";
import {
  hashOf,
  type CampaignPayload,
  type DealPayload,
  type LeadPayload,
  type TaskPayload,
} from "./mapping";

/* ——— What decides whether a push may overwrite the Salesforce side ——— */

export type OwnerFlags = {
  ownerSfId?: string;
  writeOwner?: boolean;
  baselineOwnerId?: string;
};

/**
 * Owners are written on create. On an existing record they are written only when
 *  - the owner was changed in EventMail since the last sync, or
 *  - the record is still owned by the integration user (nobody took it over), so handing it
 *    to the mapped owner cannot undo a rep's decision.
 */
export function ownerFlags(
  record: SyncRecord | undefined,
  currentOwner: string,
  ownerSfId: string | undefined,
  integrationUserId?: string,
): OwnerFlags {
  if (!ownerSfId) return {};
  const baseOwner = record?.base?.owner;
  const changed = baseOwner !== undefined && baseOwner !== currentOwner;
  const remoteOwner = record?.remote?.ownerId?.slice(0, 15);
  const unclaimed =
    Boolean(remoteOwner) &&
    Boolean(integrationUserId) &&
    remoteOwner === integrationUserId!.slice(0, 15) &&
    remoteOwner !== ownerSfId.slice(0, 15);
  return {
    ownerSfId,
    writeOwner: changed || unclaimed,
    baselineOwnerId: record?.remote?.ownerId,
  };
}

/**
 * writeStage false = "this did not change in EventMail": do not overwrite Salesforce's value.
 * undefined = unknown (record synced before two-way sync), which keeps the old behaviour.
 * `held` = an open conflict on this field: never overwrite until a person decides.
 * The baseline lets the server refuse the write if a rep changed it in the meantime.
 */
export function stageFlags(
  record: SyncRecord | undefined,
  currentStage: string,
  held = false,
): { writeStage?: boolean; baselineStage?: string } {
  const base = record?.base?.stage;
  return {
    writeStage: held ? false : base === undefined ? undefined : base !== currentStage,
    baselineStage: record?.remote?.stage,
  };
}

export function statusFlags(
  record: SyncRecord | undefined,
  currentDone: boolean,
  held = false,
): { writeStatus?: boolean; baselineStatus?: string } {
  const base = record?.base?.done;
  return {
    writeStatus: held ? false : base === undefined ? undefined : base !== currentDone,
    baselineStatus: record?.remote?.taskStatus,
  };
}

export const leadBase = (l: Pick<SalesLead, "stage" | "owner">) => ({
  stage: l.stage as string,
  owner: l.owner as string,
});
export const dealBase = (d: Pick<Deal, "stage" | "owner">) => ({
  stage: d.stage as string,
  owner: d.owner as string,
});
export const taskBase = (t: Pick<FollowUpTask, "status" | "owner">) => ({
  done: t.status === "Done",
  owner: t.owner as string,
});

export function leadToPayload(lead: SalesLead, flags: OwnerFlags = {}): LeadPayload {
  return {
    ...flags,
    key: lead.id,
    name: lead.name,
    email: lead.email,
    company: lead.company,
    jobTitle: lead.jobTitle,
    industry: lead.industry,
    stage: lead.stage,
    temperature: lead.temperature,
    score: lead.score,
    eventName: lead.eventName,
    lastActivity: lead.lastActivity,
    owner: lead.owner,
    notes: lead.notes,
  };
}

export const leadHash = (l: SalesLead) =>
  hashOf([l.name, l.email, l.company, l.jobTitle, l.stage, l.temperature, l.score, l.eventName, l.lastActivity, l.owner, l.notes]);

export function dealToPayload(
  deal: Deal,
  leadEmail: string,
  flags: OwnerFlags & { writeStage?: boolean; baselineStage?: string } = {},
): DealPayload {
  return {
    ...flags,
    key: deal.id,
    leadName: deal.leadName,
    leadEmail,
    company: deal.company,
    eventName: deal.eventName,
    stage: deal.stage,
    value: deal.value,
    probability: deal.probability,
    closeLabel: deal.closeLabel,
    owner: deal.owner,
  };
}

export const dealHash = (d: Deal) =>
  hashOf([d.leadName, d.company, d.eventName, d.stage, d.value, d.closeLabel, d.owner]);

export function followUpToPayload(
  task: FollowUpTask,
  lead: Pick<SalesLead, "id" | "email">,
  leadSfId?: string,
  flags: OwnerFlags & { writeStatus?: boolean; baselineStatus?: string } = {},
): TaskPayload {
  return {
    ...flags,
    key: task.id,
    leadKey: lead.id,
    leadEmail: lead.email,
    leadSfId,
    subject: `${task.channel} follow-up: ${task.leadName}`,
    description: `${task.note}\n\nFollow-up assigned to ${task.owner} in EventMail.`,
    done: task.status === "Done",
    dueLabel: task.dueLabel,
    priority: /priority/i.test(task.note) ? "High" : "Normal",
  };
}

export const followUpHash = (t: FollowUpTask) =>
  hashOf([t.leadId, t.channel, t.note, t.status, t.dueLabel, t.owner]);

export function activityToPayload(
  activity: SalesActivity,
  lead: Pick<SalesLead, "id" | "email">,
  leadSfId?: string,
  flags: OwnerFlags = {},
): TaskPayload {
  return {
    ...flags,
    key: activity.id,
    leadKey: lead.id,
    leadEmail: lead.email,
    leadSfId,
    subject: `${activity.kind}: ${activity.summary}`,
    description: `Logged in EventMail by ${activity.owner} (${activity.at}).`,
    done: true, // a logged activity already happened
    dueLabel: activity.at,
    priority: "Normal",
  };
}

export const activityHash = (a: SalesActivity) =>
  hashOf([a.leadId, a.kind, a.summary, a.at, a.owner]);

export function eventToPayload(
  event: Pick<EventItem, "id" | "name" | "status">,
  leads: SalesLead[],
  sfIdOf: (leadId: string) => string | undefined,
): CampaignPayload {
  return {
    key: event.id,
    name: event.name,
    status: event.status,
    members: leads.map((l) => ({
      leadKey: l.id,
      email: l.email,
      leadSfId: sfIdOf(l.id),
    })),
  };
}

export const eventHash = (e: Pick<EventItem, "name" | "status">, leadCount: number) =>
  hashOf([e.name, e.status, leadCount]);
