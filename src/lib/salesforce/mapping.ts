/**
 * Pure mapping between EventMail data and Salesforce records. No I/O, no framework
 * imports, so it is shared by the browser, the API routes, and the tests.
 */
import type { DescribeResult } from "./rest";

/* ——— Payloads sent from the browser to the sync routes ——— */

export type LeadPayload = {
  key: string;
  name: string;
  email: string;
  company: string;
  jobTitle: string;
  industry: string;
  stage: string; // EventMail pipeline stage
  temperature: string; // Hot | Warm | Cold
  score: number;
  eventName: string;
  lastActivity: string;
  owner: string;
  notes: string;
  /** Salesforce User id mapped to `owner` (Owner mapping). */
  ownerSfId?: string;
  /** Write OwnerId on an existing lead (the owner was changed in EventMail since the last sync). */
  writeOwner?: boolean;
  /** OwnerId Salesforce had at the last sync. If it differs now, a rep reassigned it: do not overwrite. */
  baselineOwnerId?: string;
};

export type DealPayload = {
  key: string;
  leadName: string;
  leadEmail: string;
  company: string;
  eventName: string;
  stage: string;
  value: number;
  probability: number;
  closeLabel: string;
  owner: string;
  ownerSfId?: string;
  writeOwner?: boolean;
  baselineOwnerId?: string;
  /** StageName Salesforce had at the last sync. If it differs now, a rep moved it: do not overwrite. */
  baselineStage?: string;
  /**
   * Write StageName on an existing opportunity. false = the stage did not change in EventMail
   * since the last sync, so a stage a rep set in Salesforce must not be overwritten.
   * Undefined behaves like true.
   */
  writeStage?: boolean;
};

export type TaskPayload = {
  key: string;
  leadKey: string;
  leadEmail: string;
  leadSfId?: string;
  subject: string;
  description: string;
  done: boolean;
  dueLabel: string;
  priority: "High" | "Normal";
  ownerSfId?: string;
  writeOwner?: boolean;
  baselineOwnerId?: string;
  /** false = completion did not change in EventMail, so leave the Salesforce status alone. */
  writeStatus?: boolean;
  /** Task.Status Salesforce had at the last sync. If it differs now, a rep changed it: do not overwrite. */
  baselineStatus?: string;
};

export type CampaignPayload = {
  key: string;
  name: string;
  status: string; // EventMail event status
  members: { leadKey: string; email: string; leadSfId?: string }[];
};

export type SyncAction = "created" | "updated" | "unchanged" | "skipped";

export type SyncResult = {
  key: string;
  ok: boolean;
  sfId?: string;
  action?: SyncAction;
  note?: string;
  error?: string;
  /** What Salesforce holds right after this sync: the baseline for detecting later changes. */
  remote?: RemoteSnap;
  /** Tracked fields this sync actually wrote (so unwritten ones keep their old baseline). */
  wrote?: ("status" | "stage" | "taskStatus" | "owner")[];
  /** A write that was skipped on purpose because Salesforce changed it first. */
  held?: string;
  /** Which EventMail fields that applies to: their baseline must not move. */
  heldFields?: HeldField[];
};

export type HeldField = "stage" | "owner" | "done";

export function heldMessage(fields: HeldField[]): string | undefined {
  if (fields.length === 0) return undefined;
  const names = fields.map((f) => (f === "done" ? "status" : f));
  return `The ${names.join(" and ")} ${names.length > 1 ? "were" : "was"} changed in Salesforce first, so ${names.length > 1 ? "they were" : "it was"} left alone. Pull to review.`;
}

/** The fields EventMail tracks on a Salesforce record, normalised. */
export type RemoteSnap = {
  sfId: string;
  /** Lead.Status */
  status?: string;
  /** Opportunity.StageName */
  stage?: string;
  /** Task.Status */
  taskStatus?: string;
  /** Task.ActivityDate (yyyy-mm-dd) */
  dueDate?: string;
  ownerId?: string;
  ownerName?: string;
  converted?: boolean;
  isClosed?: boolean;
  isWon?: boolean;
  modified?: string;
};

/* ——— What this Salesforce org supports ——— */

export type SfSchema = {
  /** false = describe calls failed; defaults are used and nothing is assumed about custom fields. */
  loaded: boolean;
  leadStatuses: string[];
  leadRatings: string[];
  oppStages: string[];
  campaignStatuses: string[];
  custom: { score: boolean; event: boolean; lastActivity: boolean };
};

export const CUSTOM_FIELDS = {
  score: "EventMail_Score__c",
  event: "EventMail_Event__c",
  lastActivity: "EventMail_Last_Activity__c",
} as const;

export const DEFAULT_SCHEMA: SfSchema = {
  loaded: false,
  leadStatuses: [],
  leadRatings: [],
  oppStages: [],
  campaignStatuses: [],
  custom: { score: false, event: false, lastActivity: false },
};

function activeValues(describe: DescribeResult | null, field: string): string[] {
  const f = describe?.fields.find((x) => x.name === field);
  return (f?.picklistValues ?? []).filter((p) => p.active !== false).map((p) => p.value);
}

export function buildSchema(
  lead: DescribeResult | null,
  opportunity: DescribeResult | null,
  campaign: DescribeResult | null,
): SfSchema {
  const names = new Set((lead?.fields ?? []).map((f) => f.name));
  return {
    loaded: Boolean(lead),
    leadStatuses: activeValues(lead, "Status"),
    leadRatings: activeValues(lead, "Rating"),
    oppStages: activeValues(opportunity, "StageName"),
    campaignStatuses: activeValues(campaign, "Status"),
    custom: {
      score: names.has(CUSTOM_FIELDS.score),
      event: names.has(CUSTOM_FIELDS.event),
      lastActivity: names.has(CUSTOM_FIELDS.lastActivity),
    },
  };
}

/* ——— Stage mapping ——— */

const LEAD_STATUS_CANDIDATES: Record<string, string[]> = {
  New: ["Open - Not Contacted", "New", "Open"],
  Contacted: ["Working - Contacted", "Working", "Contacted"],
  Qualified: ["Qualified", "Working - Contacted", "Working"],
  Proposal: ["Working - Contacted", "Working", "Contacted"],
  Negotiation: ["Working - Contacted", "Working", "Contacted"],
  // A lead can only become "Closed - Converted" through Salesforce's convert action,
  // so a won lead stays in progress here (its Opportunity carries the "Closed Won").
  Won: ["Working - Contacted", "Working", "Contacted"],
  Lost: ["Closed - Not Converted", "Unqualified", "Disqualified"],
};

const OPP_STAGE_CANDIDATES: Record<string, string[]> = {
  New: ["Prospecting"],
  Contacted: ["Qualification", "Prospecting"],
  Qualified: ["Needs Analysis", "Qualification"],
  Proposal: ["Proposal/Price Quote", "Proposal"],
  Negotiation: ["Negotiation/Review", "Negotiation"],
  Won: ["Closed Won"],
  Lost: ["Closed Lost"],
};

function pick(candidates: string[], available: string[]): string {
  if (available.length === 0) return candidates[0];
  const lower = new Map(available.map((v) => [v.toLowerCase(), v]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  return available[0];
}

export function leadStatusFor(stage: string, schema: SfSchema): string {
  return pick(LEAD_STATUS_CANDIDATES[stage] ?? LEAD_STATUS_CANDIDATES.New, schema.leadStatuses);
}

/** True when this Salesforce lead status is one that EventMail itself writes for `stage`. */
export function leadStatusMatchesStage(status: string, stage: string): boolean {
  const c = LEAD_STATUS_CANDIDATES[stage] ?? [];
  return c.some((v) => v.toLowerCase() === status.trim().toLowerCase());
}

export function oppStageMatchesStage(stageName: string, stage: string): boolean {
  const c = OPP_STAGE_CANDIDATES[stage] ?? [];
  return c.some((v) => v.toLowerCase() === stageName.trim().toLowerCase());
}

export function oppStageFor(stage: string, schema: SfSchema): string {
  return pick(OPP_STAGE_CANDIDATES[stage] ?? OPP_STAGE_CANDIDATES.New, schema.oppStages);
}

export function campaignStatusFor(status: string, schema: SfSchema): string | undefined {
  const wanted =
    status === "Completed"
      ? ["Completed"]
      : status === "Active"
        ? ["In Progress"]
        : ["Planned"];
  if (schema.campaignStatuses.length === 0) return wanted[0];
  const hit = schema.campaignStatuses.find(
    (v) => v.toLowerCase() === wanted[0].toLowerCase(),
  );
  return hit; // undefined = leave it to the org's default
}

/* ——— Salesforce -> EventMail (reverse) ——— */

/** EventMail pipeline stages (kept as plain strings so this file stays import-light). */
export type StageName = "New" | "Contacted" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";

/** Lead.Status -> EventMail stage. Unknown custom statuses return undefined (left alone). */
export function stageFromLeadStatus(status: string, converted = false): StageName | undefined {
  if (converted) return "Won";
  const s = status.trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("closed - converted") || s === "converted") return "Won";
  if (
    s.startsWith("closed - not converted") ||
    s === "unqualified" ||
    s === "disqualified" ||
    s.startsWith("closed")
  ) {
    return "Lost";
  }
  if (s.startsWith("open") || s === "new") return "New";
  if (s.startsWith("qualified")) return "Qualified";
  if (s.startsWith("working") || s === "contacted") return "Contacted";
  return undefined;
}

/** Opportunity.StageName -> EventMail stage. */
export function stageFromOppStage(stageName: string, isClosed = false, isWon = false): StageName | undefined {
  if (isClosed) return isWon ? "Won" : "Lost";
  const s = stageName.trim().toLowerCase();
  if (!s) return undefined;
  if (s === "closed won") return "Won";
  if (s === "closed lost") return "Lost";
  if (s.startsWith("prospecting")) return "New";
  if (s.startsWith("qualification")) return "Contacted";
  if (
    s.startsWith("needs analysis") ||
    s.startsWith("value proposition") ||
    s.startsWith("id. decision") ||
    s.startsWith("perception analysis")
  ) {
    return "Qualified";
  }
  if (s.startsWith("proposal")) return "Proposal";
  if (s.startsWith("negotiation")) return "Negotiation";
  return undefined;
}

/** Task.Status -> done? ("Completed" or any closed status). */
export function taskDoneFor(status: string, isClosed = false): boolean {
  return isClosed || status.trim().toLowerCase() === "completed";
}

/* ——— Small helpers ——— */

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { first: "", last: "Unknown" };
  if (parts.length === 1) return { first: "", last: truncate(parts[0], 80) };
  return {
    first: truncate(parts.slice(0, -1).join(" "), 40),
    last: truncate(parts[parts.length - 1], 80),
  };
}

export function cleanCompany(company: string): string {
  const c = company.trim();
  return !c || c === "—" || c === "-" ? "Not provided" : truncate(c, 255);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Nov 28" -> next such date on/after today; closed deals -> today; unknown -> +30 days. */
export function closeDateFor(stage: string, label: string, now = new Date()): string {
  if (stage === "Won" || stage === "Lost") return isoDate(now);
  const m = /^([A-Za-z]{3,9})\s+(\d{1,2})$/.exec(label.trim());
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    const day = Number(m[2]);
    if (month >= 0 && day >= 1 && day <= 31) {
      let d = new Date(now.getFullYear(), month, day);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (d < today) d = new Date(now.getFullYear() + 1, month, day);
      return isoDate(d);
    }
  }
  return isoDate(addDays(now, 30));
}

/** "Yesterday" / "Today 4:00 PM" / "Tomorrow 11:00 AM" / "Completed" -> a date. */
export function dueDateFor(label: string, now = new Date()): string {
  const l = label.trim().toLowerCase();
  if (l.startsWith("yesterday")) return isoDate(addDays(now, -1));
  if (l.startsWith("today") || l.startsWith("completed")) return isoDate(now);
  if (l.startsWith("tomorrow")) return isoDate(addDays(now, 1));
  const m = /^([a-z]{3,9})\s+(\d{1,2})$/.exec(l);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3));
    const day = Number(m[2]);
    if (month >= 0 && day >= 1 && day <= 31) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let d = new Date(now.getFullYear(), month, day);
      // A date label this far in the past is a date that already happened this year.
      if (d.getTime() < today.getTime() - 180 * 86_400_000) d = new Date(now.getFullYear() + 1, month, day);
      return isoDate(d);
    }
  }
  return isoDate(addDays(now, 1));
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/.test(email.trim());
}

/* ——— Record bodies ——— */

export function leadDescription(p: LeadPayload): string {
  return [
    "Synced from EventMail",
    `Event: ${p.eventName}`,
    `Engagement score: ${p.score}/100 (${p.temperature})`,
    `Pipeline stage: ${p.stage}`,
    p.industry && p.industry !== "Other" ? `Industry: ${p.industry}` : "",
    `Last activity: ${p.lastActivity}`,
    `EventMail owner: ${p.owner}`,
    p.notes && p.notes !== "No notes yet" ? `Notes: ${p.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function customLeadFields(p: LeadPayload, schema: SfSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (schema.custom.score) out[CUSTOM_FIELDS.score] = p.score;
  if (schema.custom.event) out[CUSTOM_FIELDS.event] = truncate(p.eventName, 255);
  if (schema.custom.lastActivity) {
    out[CUSTOM_FIELDS.lastActivity] = truncate(p.lastActivity, 255);
  }
  return out;
}

function ratingFor(p: LeadPayload, schema: SfSchema): string | undefined {
  if (schema.leadRatings.length === 0) return p.temperature; // standard picklist: Hot/Warm/Cold
  return schema.leadRatings.find((r) => r.toLowerCase() === p.temperature.toLowerCase());
}

/** True when the id Salesforce holds now is still the one we last saw. */
export function sameSfId(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").slice(0, 15) === (b ?? "").slice(0, 15);
}

export type ExistingLead = {
  Id: string;
  OwnerId?: string | null;
  Status?: string | null;
  Title?: string | null;
  Company?: string | null;
  IsConverted?: boolean | null;
};

export function newLeadBody(p: LeadPayload, schema: SfSchema): Record<string, unknown> {
  const { first, last } = splitName(p.name);
  const body: Record<string, unknown> = {
    LastName: last,
    Company: cleanCompany(p.company),
    Email: p.email.trim().toLowerCase(),
    Status: leadStatusFor(p.stage, schema),
    Description: leadDescription(p),
    ...customLeadFields(p, schema),
  };
  if (first) body.FirstName = first;
  if (p.jobTitle && p.jobTitle !== "—") body.Title = truncate(p.jobTitle, 128);
  const rating = ratingFor(p, schema);
  if (rating) body.Rating = rating;
  if (p.ownerSfId) body.OwnerId = p.ownerSfId;
  return body;
}

/**
 * Update only what EventMail owns, and never trample edits a salesperson made:
 * the status moves only while the lead is still untouched ("Open - Not Contacted"),
 * and title/company are filled in only when they are blank in Salesforce.
 */
export function leadUpdateBody(
  p: LeadPayload,
  existing: ExistingLead,
  schema: SfSchema,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    Description: leadDescription(p),
    ...customLeadFields(p, schema),
  };
  const rating = ratingFor(p, schema);
  if (rating) body.Rating = rating;
  // Only reassign when the owner was changed in EventMail; otherwise the rep's owner stands.
  if (
    p.ownerSfId &&
    p.writeOwner &&
    (p.baselineOwnerId === undefined || sameSfId(existing.OwnerId, p.baselineOwnerId))
  ) {
    body.OwnerId = p.ownerSfId;
  }

  const untouched = leadStatusFor("New", schema).toLowerCase();
  const next = leadStatusFor(p.stage, schema);
  if ((existing.Status ?? "").toLowerCase() === untouched && next !== existing.Status) {
    body.Status = next;
  }
  if (!existing.Title && p.jobTitle && p.jobTitle !== "—") {
    body.Title = truncate(p.jobTitle, 128);
  }
  if (!existing.Company || existing.Company === "Not provided") {
    const company = cleanCompany(p.company);
    if (company !== "Not provided") body.Company = company;
  }
  return body;
}

export function opportunityName(p: DealPayload): string {
  return truncate(`${p.company} - ${p.leadName} (${p.eventName})`, 120);
}

export function opportunityDescription(p: DealPayload): string {
  return [
    "Synced from EventMail",
    `Lead: ${p.leadName} <${p.leadEmail}>`,
    `Event: ${p.eventName}`,
    `EventMail stage: ${p.stage} (${p.probability}% probability)`,
    `EventMail owner: ${p.owner}`,
  ].join("\n");
}

export function taskStatusFor(done: boolean): string {
  return done ? "Completed" : "Not Started";
}

/* ——— Change detection (is the synced copy out of date?) ——— */

export function hashOf(parts: (string | number | boolean | null | undefined)[]): string {
  const s = parts.map((p) => String(p ?? "")).join("␟");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
