import type { DripJob, DripJobStatus } from "@/lib/types";

export const DRIP_STORAGE_KEY = "eventmail.dripJobs.v1";

function readAll(): DripJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRIP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DripJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(jobs: DripJob[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRIP_STORAGE_KEY, JSON.stringify(jobs));
}

export function loadDripJobs(): DripJob[] {
  return readAll();
}

export function saveDripJobs(jobs: DripJob[]): void {
  writeAll(jobs);
}

export function upsertDripJobs(incoming: DripJob[]): DripJob[] {
  const existing = readAll();
  const keys = new Set(
    incoming.map((j) => `${j.eventId}:${j.participantId}:${j.day}`),
  );

  const kept = existing.map((job) => {
    if (
      job.status === "pending" &&
      keys.has(`${job.eventId}:${job.participantId}:${job.day}`)
    ) {
      return { ...job, status: "cancelled" as DripJobStatus };
    }
    return job;
  });

  const next = [...kept, ...incoming];
  writeAll(next);
  return next;
}

export function updateDripJobs(
  ids: string[],
  patch: Partial<DripJob>,
): DripJob[] {
  const idSet = new Set(ids);
  const next = readAll().map((job) =>
    idSet.has(job.id) ? { ...job, ...patch } : job,
  );
  writeAll(next);
  return next;
}

export function getDuePendingJobs(now = new Date()): DripJob[] {
  const ts = now.getTime();
  return readAll().filter(
    (job) => job.status === "pending" && Date.parse(job.dueAt) <= ts,
  );
}

export function cancelPendingJobsForParticipants(
  eventId: string,
  participantIds: string[],
  day?: DripJob["day"],
): DripJob[] {
  const people = new Set(participantIds);
  const next = readAll().map((job) => {
    if (
      job.status === "pending" &&
      job.eventId === eventId &&
      people.has(job.participantId) &&
      (day == null || job.day === day)
    ) {
      return { ...job, status: "cancelled" as DripJobStatus };
    }
    return job;
  });
  writeAll(next);
  return next;
}

export function createJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `drip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
