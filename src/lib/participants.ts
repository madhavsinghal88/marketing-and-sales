import type { EventItem, Participant } from "./types";

export const MANUAL_PARTICIPANTS_KEY = "eventmail.manualParticipants.v1";

export const TEMPLATE_CHOICES = [
  "Event Sequence",
  "Welcome Only",
  "Follow-up Focus",
] as const;

export type NewParticipantInput = {
  name: string;
  email: string;
  company: string;
  jobTitle: string;
  industry: string;
  location: string;
  interests: string; // comma separated
  template: string;
  comment: string;
};

export type ParticipantErrors = Partial<Record<"name" | "email", string>>;

export function emptyParticipantInput(): NewParticipantInput {
  return {
    name: "",
    email: "",
    company: "",
    jobTitle: "",
    industry: "",
    location: "",
    interests: "",
    template: TEMPLATE_CHOICES[0],
    comment: "",
  };
}

const EMAIL_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns an error per invalid field; an empty object means the input is valid. */
export function validateParticipantInput(
  input: NewParticipantInput,
  existing: Pick<Participant, "email">[],
): ParticipantErrors {
  const errors: ParticipantErrors = {};

  if (!input.name.trim()) {
    errors.name = "Name is required.";
  } else if (input.name.trim().length > 120) {
    errors.name = "Name is too long.";
  }

  const email = normalizeEmail(input.email);
  if (!email) {
    errors.email = "Email is required.";
  } else if (!isValidEmail(email)) {
    errors.email = "Enter a valid email address, e.g. name@company.com.";
  } else if (existing.some((p) => normalizeEmail(p.email) === email)) {
    errors.email = "This email is already a participant in this event.";
  }

  return errors;
}

export function createParticipantId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `p-${crypto.randomUUID()}`;
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseInterests(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

export function buildParticipant(
  input: NewParticipantInput,
  now = new Date(),
): Participant {
  return {
    id: createParticipantId(),
    name: input.name.trim().replace(/\s+/g, " "),
    email: normalizeEmail(input.email),
    company: input.company.trim() || "—",
    industry: input.industry.trim() || "Other",
    jobTitle: input.jobTitle.trim() || "—",
    location: input.location.trim() || "—",
    interests: parseInterests(input.interests),
    engagement: {
      opened: false,
      clicked: false,
      replied: false,
      unsubscribed: false,
      level: "none",
      score: 0,
    },
    touches: [],
    template: input.template || TEMPLATE_CHOICES[0],
    comment: input.comment.trim(),
    source: "manual",
    addedAt: now.toISOString(),
  };
}

/* ——— Local persistence for manually added participants ——— */

type StoredMap = Record<string, Participant[]>;

function readStored(): StoredMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MANUAL_PARTICIPANTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Adds saved manual participants back into their events. Returns null if none. */
export function mergeStoredParticipants(events: EventItem[]): EventItem[] | null {
  const stored = readStored();
  let changed = false;

  const next = events.map((event) => {
    const saved = (stored[event.id] ?? []).filter(
      (p) => p && p.source === "manual" && typeof p.email === "string",
    );
    const known = new Set(event.participants.map((p) => p.id));
    const fresh = saved.filter((p) => !known.has(p.id));
    if (fresh.length === 0) return event;
    changed = true;
    // Saved newest-first (new people are prepended), so they show on page 1.
    const participants = [...fresh, ...event.participants];
    return {
      ...event,
      participants,
      participantCount: event.participantCount + fresh.length,
    };
  });

  return changed ? next : null;
}

export function saveManualParticipants(events: EventItem[]): void {
  if (typeof window === "undefined") return;
  const out: StoredMap = {};
  for (const event of events) {
    const manual = event.participants.filter((p) => p.source === "manual");
    if (manual.length > 0) out[event.id] = manual;
  }
  try {
    window.localStorage.setItem(MANUAL_PARTICIPANTS_KEY, JSON.stringify(out));
  } catch {
    // storage full or blocked: the in-memory list still works for this session
  }
}
