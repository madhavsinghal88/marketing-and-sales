import {
  SEQUENCE_DAYS,
  type DripJob,
  type Participant,
  type SequenceDay,
  type TouchLog,
} from "@/lib/types";
import { createJobId } from "./store";

/** Day offsets from campaign start: D1=0, D3=2, D5=4, D7=6 */
export const SEQUENCE_DAY_OFFSETS: Record<SequenceDay, number> = {
  D1: 0,
  D3: 2,
  D5: 4,
  D7: 6,
};

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }
  return parsed;
}

export function defaultDaySchedule(start: Date): Record<SequenceDay, string> {
  const base = new Date(start);
  // Round up to next 5 minutes for cleaner defaults
  const mins = base.getMinutes();
  const rounded = Math.ceil((mins + 1) / 5) * 5;
  base.setMinutes(rounded, 0, 0);

  const out = {} as Record<SequenceDay, string>;
  for (const day of SEQUENCE_DAYS) {
    out[day.key] = toDatetimeLocalValue(
      addDays(base, SEQUENCE_DAY_OFFSETS[day.key]),
    );
  }
  return out;
}

export function formatScheduleLabel(dueAt: string | Date): string {
  const date = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function upsertTouch(
  touches: TouchLog[],
  day: SequenceDay,
  patch: Partial<TouchLog>,
): TouchLog[] {
  const exists = touches.some((t) => t.day === day);
  if (!exists) {
    return [...touches, { day, status: "Pending", ...patch } as TouchLog];
  }
  return touches.map((t) => (t.day === day ? { ...t, ...patch } : t));
}

export type ScheduleAudience = "selected" | "event";

export type BuildScheduleInput = {
  eventId: string;
  eventName: string;
  participants: Participant[];
  dayTimes: Partial<Record<SequenceDay, string>>; // datetime-local values
  daysEnabled: SequenceDay[];
};

export type BuildScheduleResult = {
  jobs: DripJob[];
  participants: Participant[];
  scheduledCount: number;
};

export function buildSchedule(input: BuildScheduleInput): BuildScheduleResult {
  const nowIso = new Date().toISOString();
  const jobs: DripJob[] = [];
  let scheduledCount = 0;

  const participants = input.participants.map((person) => {
    let touches = person.touches;

    for (const day of input.daysEnabled) {
      const localValue = input.dayTimes[day];
      if (!localValue) continue;

      // Skip days already sent
      const existing = touches.find((t) => t.day === day);
      if (existing?.status === "Sent") continue;

      const due = fromDatetimeLocalValue(localValue);
      const dueAt = due.toISOString();
      const jobId = createJobId();

      jobs.push({
        id: jobId,
        eventId: input.eventId,
        eventName: input.eventName,
        participantId: person.id,
        name: person.name,
        email: person.email,
        day,
        dueAt,
        status: "pending",
        createdAt: nowIso,
      });

      touches = upsertTouch(touches, day, {
        status: "Scheduled",
        at: formatScheduleLabel(due),
        dueAt,
        jobId,
        error: undefined,
        messageId: undefined,
      });
      scheduledCount += 1;
    }

    return { ...person, touches };
  });

  return { jobs, participants, scheduledCount };
}
