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
  at?: string; // display time e.g. "10:24 AM"
  messageId?: string;
  error?: string;
}

export interface Participant {
  id: string;
  name: string;
  email: string;
  touches: TouchLog[];
  template: string;
  comment: string;
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
  pendingEmails: number;
}
