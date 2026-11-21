export type EventStatus = "Active" | "Scheduled" | "Completed" | "Draft";

export type TouchStatus = "Sent" | "Scheduled" | "Pending" | "Failed";

export type SequenceDay = "D1" | "D3" | "D5" | "D7";

export const SEQUENCE_DAYS: {
  key: SequenceDay;
  label: string;
  sublabel: string;
}[] = [
  { key: "D1", label: "Day 1", sublabel: "Welcome" },
  { key: "D3", label: "Day 3", sublabel: "Event Info" },
  { key: "D5", label: "Day 5", sublabel: "Reminder" },
  { key: "D7", label: "Day 7", sublabel: "Follow-up" },
];

export interface TouchLog {
  day: SequenceDay;
  status: TouchStatus;
  at?: string; // display time e.g. "10:24 AM" or scheduled label
  dueAt?: string; // ISO due time when Scheduled
  jobId?: string;
  messageId?: string;
  error?: string;
}

export type DripJobStatus = "pending" | "sent" | "failed" | "cancelled";

export interface DripJob {
  id: string;
  eventId: string;
  eventName: string;
  participantId: string;
  name: string;
  email: string;
  day: SequenceDay;
  dueAt: string; // ISO
  status: DripJobStatus;
  messageId?: string;
  error?: string;
  createdAt: string;
}

export type EngagementLevel = "high" | "medium" | "low" | "none";

export interface ParticipantEngagement {
  opened: boolean;
  clicked: boolean;
  replied: boolean;
  unsubscribed: boolean;
  level: EngagementLevel;
  score: number;
}

/**
 * What we can honestly say about a sent email:
 * - awaiting:   accepted by Outlook, no bounce seen yet
 * - delivered:  found in Sent Items and no bounce (NDR) came back
 * - bounced:    Outlook/recipient server returned an "undeliverable" notice
 * - confirmed:  a person confirmed they saw it in the recipient inbox
 * - unverified: cannot be checked (demo mode / not found in Sent Items)
 */
export type DeliveryStatus =
  | "awaiting"
  | "delivered"
  | "bounced"
  | "confirmed"
  | "unverified";

export interface DeliveryInfo {
  status: DeliveryStatus;
  day: SequenceDay;
  subject: string;
  sentAt: string; // ISO
  checkedAt?: string; // ISO
  detail?: string;
  demo?: boolean;
}

export interface Participant {
  id: string;
  name: string;
  email: string;
  company: string;
  industry: string;
  jobTitle: string;
  location: string;
  interests: string[];
  engagement: ParticipantEngagement;
  touches: TouchLog[];
  template: string;
  comment: string;
  /** "manual" = added by a user through Add Participant (persisted locally). */
  source?: "manual";
  addedAt?: string; // ISO
  /** Result of the latest real send + delivery check. */
  delivery?: DeliveryInfo;
}

export interface EventItem {
  id: string;
  name: string;
  participantCount: number;
  status: EventStatus;
  campaign: string;
  sequenceLabel: string;
  participants: Participant[];
}

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface AppStats {
  totalEvents: number;
  totalParticipants: number;
  emailsSent: number;
  opens: number;
  openRate: number;
  clicks: number;
  clickRate: number;
  salesLeads: number;
}

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  unsubscribed: number;
  conversions: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

export type CampaignStatus = "Draft" | "Scheduled" | "Active" | "Completed";

export interface MarketingCampaign {
  id: string;
  name: string;
  eventId: string;
  eventName: string;
  status: CampaignStatus;
  audienceLabel: string;
  scheduledFor?: string;
  createdAt: string;
}

export type AutomationTrigger =
  | "registration"
  | "inactivity"
  | "email_click"
  | "reply"
  | "event_date";

export interface AutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  triggerLabel: string;
  action: string;
  enabled: boolean;
  eventId?: string;
}

export type AppView =
  | "dashboard"
  | "events"
  | "participants"
  | "campaigns"
  | "segments"
  | "templates"
  | "automation"
  | "landing-pages"
  | "forms"
  | "leads"
  | "pipeline"
  | "followups"
  | "deals"
  | "analytics"
  | "sales-reports"
  | "roi"
  | "integrations"
  | "settings";

export interface SegmentFilters {
  eventId: string; // "" = all events
  industry: string;
  company: string;
  jobTitle: string;
  location: string;
  interest: string;
  engagement: EngagementLevel | "";
}

export type LeadTemperature = "Hot" | "Warm" | "Cold";

export type PipelineStage =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Proposal"
  | "Negotiation"
  | "Won"
  | "Lost";

export const PIPELINE_STAGES: PipelineStage[] = [
  "New",
  "Contacted",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
];

export const SALES_OWNERS = [
  "Madhav Singhal",
  "Priya Nair",
  "Alex Rivera",
  "Jordan Lee",
] as const;

export type SalesOwner = (typeof SALES_OWNERS)[number];

export interface SalesLead {
  id: string;
  participantId: string;
  eventId: string;
  eventName: string;
  name: string;
  email: string;
  company: string;
  jobTitle: string;
  industry: string;
  score: number;
  temperature: LeadTemperature;
  stage: PipelineStage;
  owner: SalesOwner;
  lastActivity: string;
  notes: string;
}

export type FollowUpStatus = "Open" | "Done" | "Overdue";
export type FollowUpChannel = "Call" | "Email" | "Meeting";

export interface FollowUpTask {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  owner: SalesOwner;
  dueLabel: string;
  channel: FollowUpChannel;
  status: FollowUpStatus;
  note: string;
}

export type ActivityKind = "Call" | "Email" | "Note";

export interface SalesActivity {
  id: string;
  leadId: string;
  leadName: string;
  kind: ActivityKind;
  summary: string;
  at: string;
  owner: SalesOwner;
}

export interface Deal {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  eventName: string;
  owner: SalesOwner;
  stage: PipelineStage;
  value: number;
  probability: number; // 0-100
  expectedRevenue: number;
  closeLabel: string;
}
