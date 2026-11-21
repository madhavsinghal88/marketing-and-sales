import type {
  DripJob,
  EmailTemplate,
  EventItem,
  SequenceDay,
} from "@/lib/types";
import { formatTouchTime } from "@/lib/outlook/sequence";
import { initialDelivery } from "@/lib/outlook/delivery";
import { upsertTouch } from "./schedule";
import { getDuePendingJobs, updateDripJobs } from "./store";

type SendApiResult = {
  id: string;
  ok: boolean;
  messageId?: string;
  error?: string;
  subject?: string;
  sentAt?: string;
  demo?: boolean;
};

type RunDueResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: boolean;
  events: EventItem[];
  message?: string;
};

/**
 * Sends due pending drip jobs via Outlook and patches event participant touches.
 * Safe to call from a client poller while Outlook is connected.
 */
export async function runDueDripJobs(options: {
  events: EventItem[];
  template: EmailTemplate;
  outlookConnected: boolean;
}): Promise<RunDueResult> {
  const { events, template, outlookConnected } = options;

  if (!outlookConnected) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: true,
      events,
      message: undefined,
    };
  }

  const due = getDuePendingJobs();
  if (due.length === 0) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: false,
      events,
    };
  }

  // Group by eventName + day for fewer API calls
  const groups = new Map<string, DripJob[]>();
  for (const job of due) {
    const key = `${job.eventId}::${job.day}`;
    const list = groups.get(key) ?? [];
    list.push(job);
    groups.set(key, list);
  }

  let nextEvents = events;
  let sent = 0;
  let failed = 0;
  const nowLabel = formatTouchTime();

  for (const jobs of groups.values()) {
    const sample = jobs[0];
    const jobIds = jobs.map((j) => j.id);

    try {
      const res = await fetch("/api/outlook/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: sample.eventName,
          day: sample.day,
          template,
          recipients: jobs.map((j) => ({
            id: j.participantId,
            name: j.name,
            email: j.email,
          })),
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        results?: SendApiResult[];
      };

      if (!res.ok) {
        updateDripJobs(jobIds, {
          status: "failed",
          error: data.error ?? "Send failed",
        });
        nextEvents = applyResults(
          nextEvents,
          sample.eventId,
          sample.day,
          jobs.map((j) => ({
            id: j.participantId,
            ok: false,
            error: data.error ?? "Send failed",
          })),
          nowLabel,
        );
        failed += jobs.length;
        continue;
      }

      const results = data.results ?? [];

      for (const job of jobs) {
        const row = results.find((r) => r.id === job.participantId);
        if (row?.ok) {
          updateDripJobs([job.id], {
            status: "sent",
            messageId: row.messageId,
            error: undefined,
          });
          sent += 1;
        } else {
          updateDripJobs([job.id], {
            status: "failed",
            error: row?.error ?? "Send failed",
          });
          failed += 1;
        }
      }

      nextEvents = applyResults(
        nextEvents,
        sample.eventId,
        sample.day,
        results.map((r) => ({
          id: r.id,
          ok: r.ok,
          messageId: r.messageId,
          error: r.error,
          subject: r.subject,
          sentAt: r.sentAt,
          demo: r.demo,
        })),
        nowLabel,
      );
    } catch {
      updateDripJobs(jobIds, {
        status: "failed",
        error: "Network error while sending drip",
      });
      nextEvents = applyResults(
        nextEvents,
        sample.eventId,
        sample.day,
        jobs.map((j) => ({
          id: j.participantId,
          ok: false,
          error: "Network error while sending drip",
        })),
        nowLabel,
      );
      failed += jobs.length;
    }
  }

  return {
    processed: due.length,
    sent,
    failed,
    skipped: false,
    events: nextEvents,
    message:
      failed > 0
        ? `Drip: sent ${sent}, failed ${failed}.`
        : sent > 0
          ? `Drip: sent ${sent} scheduled email${sent === 1 ? "" : "s"}.`
          : undefined,
  };
}

function applyResults(
  events: EventItem[],
  eventId: string,
  day: SequenceDay,
  results: SendApiResult[],
  nowLabel: string,
): EventItem[] {
  const byId = new Map(results.map((r) => [r.id, r]));

  return events.map((event) => {
    if (event.id !== eventId) return event;

    return {
      ...event,
      participants: event.participants.map((person) => {
        const row = byId.get(person.id);
        if (!row) return person;

        return {
          ...person,
          delivery: row.ok ? initialDelivery(row, day) : person.delivery,
          touches: upsertTouch(
            person.touches,
            day,
            row.ok
              ? {
                  status: "Sent",
                  at: nowLabel,
                  messageId: row.messageId,
                  error: undefined,
                  dueAt: undefined,
                  jobId: undefined,
                }
              : {
                  status: "Failed",
                  at: nowLabel,
                  error: row.error ?? "Send failed",
                },
          ),
        };
      }),
    };
  });
}
