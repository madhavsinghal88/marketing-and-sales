import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DeliveryStatus,
  EmailTemplate,
  EngagementLevel,
  EventItem,
  Participant,
  SequenceDay,
} from "@/lib/types";
import { SEQUENCE_DAYS } from "@/lib/types";
import { formatTouchTime, nextSendableDay } from "@/lib/outlook/sequence";
import { initialDelivery } from "@/lib/outlook/delivery";
import { AddParticipantPanel } from "./AddParticipantPanel";
import type { SalesforceSyncApi } from "@/lib/salesforce/useSync";
import { upsertTouch } from "@/lib/drip/schedule";
import { cancelPendingJobsForParticipants } from "@/lib/drip/store";
import { uniqueSorted } from "@/lib/analytics";
import { ParticipantsTable } from "./ParticipantsTable";
import { ScheduleCampaignModal } from "./ScheduleCampaignModal";
import { AutomationTimeline } from "./AutomationTimeline";

type Tab = "participants" | "timeline" | "settings";

type Props = {
  event: EventItem;
  template: EmailTemplate;
  outlookConnected: boolean;
  outlookMode: "demo" | "live" | null;
  outlookMailbox: string | null;
  outlookCanRead: boolean;
  sf: SalesforceSyncApi;
  scheduleRequestId?: number;
  onParticipantsChange: (participants: Participant[]) => void;
  onToast: (message: string) => void;
  onEditTemplate: () => void;
  onConnectOutlook: () => void;
};

type SendResultRow = {
  id: string;
  ok: boolean;
  messageId?: string;
  error?: string;
  day: SequenceDay;
  subject?: string;
  sentAt?: string;
  demo?: boolean;
};

type DeliveryApiResult = {
  id: string;
  status: DeliveryStatus;
  detail: string;
  checkedAt: string;
};

export function EventWorkspace({
  event,
  template,
  outlookConnected,
  outlookMode,
  outlookMailbox,
  outlookCanRead,
  sf,
  scheduleRequestId = 0,
  onParticipantsChange,
  onToast,
  onEditTemplate,
  onConnectOutlook,
}: Props) {
  const [tab, setTab] = useState<Tab>("participants");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendDay, setSendDay] = useState<SequenceDay | "auto">("auto");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [industryFilter, setIndustryFilter] = useState("");
  const [engagementFilter, setEngagementFilter] = useState<
    EngagementLevel | ""
  >("");

  const pageSize = 5;

  useEffect(() => {
    if (scheduleRequestId > 0) setScheduleOpen(true);
  }, [scheduleRequestId]);

  const industries = useMemo(
    () => uniqueSorted(event.participants.map((p) => p.industry)),
    [event.participants],
  );

  const visibleParticipants = useMemo(() => {
    return event.participants.filter((p) => {
      if (industryFilter && p.industry !== industryFilter) return false;
      if (engagementFilter && p.engagement.level !== engagementFilter) {
        return false;
      }
      return true;
    });
  }, [event.participants, industryFilter, engagementFilter]);

  const filteredCount = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleParticipants.length;
    return visibleParticipants.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    ).length;
  }, [visibleParticipants, query]);

  const scheduledTouches = useMemo(() => {
    return event.participants.reduce((count, p) => {
      return (
        count + p.touches.filter((t) => t.status === "Scheduled").length
      );
    }, 0);
  }, [event.participants]);

  function updateParticipant(id: string, patch: Partial<Participant>) {
    onParticipantsChange(
      event.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    const q = query.trim().toLowerCase();
    const filtered = visibleParticipants.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q),
    );
    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);
    const allSelected = pageRows.every((p) => selectedIds.has(p.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageRows.forEach((p) => {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      });
      return next;
    });
  }

  async function handleSendNow() {
    if (!outlookConnected) {
      onToast("Connect Outlook first, then send.");
      onConnectOutlook();
      return;
    }
    if (selectedIds.size === 0) {
      onToast("Select at least one participant to send.");
      return;
    }

    const selected = event.participants.filter((p) => selectedIds.has(p.id));
    setSending(true);
    try {
      const outcome = await runSend(selected, event.participants, sendDay);
      if (outcome.nothingToSend) {
        onToast("Nothing to send — selected people are already complete.");
        return;
      }
      if (outcome.networkError) {
        onToast("Network error while sending.");
        return;
      }
      for (const message of outcome.errors) onToast(message);
      onToast(
        outcome.failed
          ? `Sent ${outcome.sent}, failed ${outcome.failed}. Failed rows can be retried.`
          : `Sent ${outcome.sent} email${outcome.sent === 1 ? "" : "s"} via Outlook${
              outlookMode === "demo" ? " (demo — not actually sent)" : ""
            }.`,
      );
    } finally {
      setSending(false);
    }
  }

  /**
   * Sends the sequence email for `people` and writes the results onto `base`
   * (the full participant list, which may already include a just-added person).
   */
  async function runSend(
    people: Participant[],
    base: Participant[],
    dayChoice: SequenceDay | "auto",
  ): Promise<{
    sent: number;
    failed: number;
    errors: string[]; // request-level failures (e.g. not connected)
    rowErrors: string[]; // per-recipient failures reported by Outlook
    nothingToSend: boolean;
    networkError: boolean;
  }> {
    const jobs = people
      .map((p) => {
        const day =
          dayChoice === "auto" ? nextSendableDay(p) : (dayChoice as SequenceDay);
        return day ? { participant: p, day } : null;
      })
      .filter(Boolean) as { participant: Participant; day: SequenceDay }[];

    const empty = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
      rowErrors: [] as string[],
    };
    if (jobs.length === 0) {
      return { ...empty, nothingToSend: true, networkError: false };
    }

    const byDay = new Map<SequenceDay, Participant[]>();
    for (const job of jobs) {
      const list = byDay.get(job.day) ?? [];
      list.push(job.participant);
      byDay.set(job.day, list);
    }

    const allResults: SendResultRow[] = [];
    const errors: string[] = [];

    try {
      for (const [day, group] of byDay) {
        const res = await fetch("/api/outlook/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventName: event.name,
            day,
            template,
            recipients: group.map((p) => ({
              id: p.id,
              name: p.name,
              email: p.email,
            })),
          }),
        });

        const data = (await res.json()) as {
          error?: string;
          results?: SendResultRow[];
        };

        if (!res.ok) {
          errors.push(data.error ?? "Send failed");
          continue;
        }

        for (const row of data.results ?? []) {
          allResults.push({ ...row, day });
        }

        // Manual send replaces any pending drip for these people/day
        cancelPendingJobsForParticipants(
          event.id,
          group.map((p) => p.id),
          day,
        );
      }
    } catch {
      return { ...empty, errors, nothingToSend: false, networkError: true };
    }

    const nowLabel = formatTouchTime();
    onParticipantsChange(
      base.map((p) => {
        const rows = allResults.filter((r) => r.id === p.id);
        if (rows.length === 0) return p;
        let touches = p.touches;
        let delivery = p.delivery;
        for (const row of rows) {
          touches = upsertTouch(
            touches,
            row.day,
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
          );
          if (row.ok) delivery = initialDelivery(row, row.day) ?? delivery;
        }
        return { ...p, touches, delivery };
      }),
    );

    const sent = allResults.filter((r) => r.ok).length;
    return {
      sent,
      failed: allResults.length - sent,
      errors,
      rowErrors: allResults.flatMap((r) => (r.ok || !r.error ? [] : [r.error])),
      nothingToSend: false,
      networkError: false,
    };
  }

  async function handleAddParticipant(
    participant: Participant,
    opts: { sendNow: boolean },
  ): Promise<boolean> {
    const base = [participant, ...event.participants];

    if (opts.sendNow && !outlookConnected) {
      onToast("Connect Outlook first, then send.");
      return false;
    }

    // Add first, so the person is never lost if the send fails.
    onParticipantsChange(base);
    setTab("participants");
    setQuery("");
    setIndustryFilter("");
    setEngagementFilter("");
    setPage(1);
    setSelectedIds((prev) => new Set(prev).add(participant.id));

    if (!opts.sendNow) {
      onToast(`${participant.name} added to ${event.name}.`);
      return true;
    }

    setSending(true);
    try {
      const outcome = await runSend([participant], base, "D1");
      if (outcome.networkError) {
        onToast(
          `${participant.name} was added, but the send hit a network error. Use Retry failed.`,
        );
      } else if (outcome.failed > 0 || outcome.sent === 0) {
        onToast(
          `${participant.name} was added, but the email failed${
            outcome.errors[0] || outcome.rowErrors[0]
              ? `: ${outcome.errors[0] ?? outcome.rowErrors[0]}`
              : ""
          }. Use Retry failed.`,
        );
      } else {
        onToast(
          outlookMode === "demo"
            ? `${participant.name} added. Demo mode: the email was simulated, not sent.`
            : `${participant.name} added and Day 1 email sent to ${participant.email}.`,
        );
      }
      return true;
    } finally {
      setSending(false);
    }
  }

  /* ——— Delivery verification ——— */

  const participantsRef = useRef(event.participants);
  const checkDeliveryRef = useRef<(silent: boolean) => Promise<void>>(
    async () => {},
  );

  useEffect(() => {
    participantsRef.current = event.participants;
  });

  async function checkDelivery(silent: boolean) {
    if (checking) return;

    if (outlookMode === "live" && !outlookCanRead) {
      if (!silent) {
        onToast(
          "Automatic delivery checks aren't enabled. Use Confirm received once you see the email in the inbox.",
        );
      }
      return;
    }

    const restrict = !silent && selectedIds.size > 0;
    const targets = participantsRef.current.filter((p) => {
      const d = p.delivery;
      if (!d || d.demo) return false;
      if (d.status === "bounced" || d.status === "confirmed") return false;
      return restrict ? selectedIds.has(p.id) : true;
    });

    if (targets.length === 0) {
      if (!silent) {
        const demoOnly = participantsRef.current.some((p) => p.delivery?.demo);
        onToast(
          demoOnly
            ? "Demo sends can't be verified. Connect real Outlook and send a real email."
            : "No sent emails to check yet. Send an email first.",
        );
      }
      return;
    }

    setChecking(true);
    try {
      const res = await fetch("/api/outlook/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checks: targets.map((p) => ({
            id: p.id,
            email: p.email,
            subject: p.delivery!.subject,
            sentAt: p.delivery!.sentAt,
          })),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        results?: DeliveryApiResult[];
      };

      if (!res.ok) {
        if (!silent) onToast(data.error ?? "Could not check delivery.");
        return;
      }

      const byId = new Map((data.results ?? []).map((r) => [r.id, r]));
      const newlyBounced: string[] = [];
      onParticipantsChange(
        participantsRef.current.map((p) => {
          const row = byId.get(p.id);
          if (!row || !p.delivery || p.delivery.status === "confirmed") return p;
          if (row.status === "bounced" && p.delivery.status !== "bounced") {
            newlyBounced.push(p.name);
          }
          return {
            ...p,
            delivery: {
              ...p.delivery,
              status: row.status,
              detail: row.detail,
              checkedAt: row.checkedAt,
            },
          };
        }),
      );

      const results = data.results ?? [];
      if (newlyBounced.length > 0) {
        onToast(`Bounce detected for ${newlyBounced.join(", ")}.`);
      } else if (!silent) {
        const delivered = results.filter((r) => r.status === "delivered").length;
        const waiting = results.filter((r) => r.status === "awaiting").length;
        const unverified = results.filter((r) => r.status === "unverified").length;
        onToast(
          `Checked ${results.length}: ${delivered} delivered, ${waiting} still checking${
            unverified ? `, ${unverified} unverified` : ""
          }.`,
        );
      }
    } catch {
      if (!silent) onToast("Network error while checking delivery.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkDeliveryRef.current = checkDelivery;
  });

  const awaitingCount = event.participants.filter(
    (p) => p.delivery?.status === "awaiting" && !p.delivery.demo,
  ).length;

  // While something is still "awaiting", re-check quietly every 30s.
  useEffect(() => {
    if (outlookMode !== "live" || !outlookCanRead || awaitingCount === 0) return;
    const id = window.setInterval(
      () => void checkDeliveryRef.current(true),
      30_000,
    );
    return () => window.clearInterval(id);
  }, [outlookMode, outlookCanRead, awaitingCount]);

  function handleRemoveParticipant(id: string) {
    const person = event.participants.find((p) => p.id === id);
    if (!person || person.source !== "manual") return;
    if (!window.confirm(`Remove ${person.name} (${person.email}) from this event?`)) {
      return;
    }
    cancelPendingJobsForParticipants(event.id, [id]);
    onParticipantsChange(event.participants.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onToast(`${person.name} removed.`);
  }

  function handleConfirmReceived(id: string) {
    onParticipantsChange(
      event.participants.map((p) =>
        p.id === id && p.delivery
          ? {
              ...p,
              delivery: {
                ...p.delivery,
                status: "confirmed" as const,
                detail: "Confirmed received by a team member.",
                checkedAt: new Date().toISOString(),
              },
            }
          : p,
      ),
    );
    onToast("Marked as received.");
  }

  const deliverySummary = useMemo(() => {
    const counts = { delivered: 0, confirmed: 0, awaiting: 0, bounced: 0 };
    for (const p of event.participants) {
      const s = p.delivery;
      if (!s || s.demo) continue;
      if (s.status === "delivered") counts.delivered += 1;
      else if (s.status === "confirmed") counts.confirmed += 1;
      else if (s.status === "awaiting") counts.awaiting += 1;
      else if (s.status === "bounced") counts.bounced += 1;
    }
    return counts;
  }, [event.participants]);

  const hasDeliveryData =
    deliverySummary.delivered +
      deliverySummary.confirmed +
      deliverySummary.awaiting +
      deliverySummary.bounced >
    0;

  async function handleRetryFailed() {
    const failed = event.participants.filter((p) =>
      p.touches.some((t) => t.status === "Failed"),
    );
    if (failed.length === 0) {
      onToast("No failed sends to retry.");
      return;
    }
    setSelectedIds(new Set(failed.map((p) => p.id)));
    setSendDay("auto");
    onToast(`Selected ${failed.length} failed recipient(s). Click Send now.`);
  }

  return (
    <section className="workspace" aria-label={event.name}>
      <div className="workspace__head">
        <div>
          <h2 className="workspace__title">{event.name}</h2>
          <p className="workspace__meta">
            {event.participantCount} participants · Campaign: {event.campaign} ·
            Template: {event.sequenceLabel}
            {scheduledTouches > 0
              ? ` · ${scheduledTouches} scheduled`
              : ""}
          </p>
        </div>
        <div className="workspace__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onToast("Edit Event — coming in a later phase.")}
          >
            Edit Event
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onEditTemplate}
          >
            Manage Templates
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setScheduleOpen(true)}
          >
            Schedule Campaign
          </button>
          <button
            type="button"
            className={`btn btn--ghost sf-event-btn sf-event-btn--${sf.eventState(event).state}`}
            disabled={sf.busy !== null}
            onClick={() => void sf.syncEvent(event)}
            title={
              sf.eventState(event).state === "failed"
                ? sf.eventState(event).record?.error
                : "Create this event as a Salesforce Campaign and add its leads"
            }
          >
            {sf.busy
              ? sf.busy
              : sf.eventState(event).state === "synced"
                ? "✓ In Salesforce"
                : sf.eventState(event).state === "stale"
                  ? "Re-sync to Salesforce"
                  : sf.eventState(event).state === "failed"
                    ? "Retry Salesforce sync"
                    : "Sync to Salesforce"}
          </button>
        </div>
      </div>

      <div className="send-bar">
        <div className="send-bar__left">
          <label className="send-bar__field">
            <span>Send day</span>
            <select
              value={sendDay}
              onChange={(e) =>
                setSendDay(e.target.value as SequenceDay | "auto")
              }
            >
              <option value="auto">Next pending / failed</option>
              {SEQUENCE_DAYS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label} ({d.sublabel})
                </option>
              ))}
            </select>
          </label>
          <p className="send-bar__meta">
            {selectedIds.size} selected
            {!outlookConnected ? " · Outlook not connected" : ""}
            {hasDeliveryData ? (
              <span className="delivery-summary">
                {deliverySummary.delivered + deliverySummary.confirmed > 0
                  ? ` · ✓ ${deliverySummary.delivered + deliverySummary.confirmed} delivered`
                  : ""}
                {deliverySummary.awaiting > 0
                  ? ` · ⏳ ${deliverySummary.awaiting} checking`
                  : ""}
                {deliverySummary.bounced > 0
                  ? ` · ✗ ${deliverySummary.bounced} bounced`
                  : ""}
              </span>
            ) : null}
          </p>
        </div>
        <div className="send-bar__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={checking}
            onClick={() => void checkDelivery(false)}
            title="Look in Sent Items and bounce notices to verify delivery"
          >
            {checking ? "Checking…" : "Check delivery"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleRetryFailed}
          >
            Retry failed
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={sending || selectedIds.size === 0}
            onClick={handleSendNow}
          >
            {sending
              ? "Sending…"
              : `Send now${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ["participants", "Participants"],
            ["timeline", "Email Timeline"],
            ["settings", "Campaign Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`tabs__btn ${tab === id ? "is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "participants" && (
        <>
          <div className="segment-chipbar">
            <label>
              Industry
              <select
                value={industryFilter}
                onChange={(e) => {
                  setIndustryFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {industries.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Engagement
              <select
                value={engagementFilter}
                onChange={(e) => {
                  setEngagementFilter(
                    e.target.value as EngagementLevel | "",
                  );
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="none">None</option>
              </select>
            </label>
            <span className="segment-chipbar__count">
              {visibleParticipants.length}/{event.participants.length} people
            </span>
          </div>
          <ParticipantsTable
            participants={visibleParticipants}
            selectedIds={selectedIds}
            query={query}
            page={page}
            pageSize={pageSize}
            onQueryChange={(q) => {
              setQuery(q);
              setPage(1);
            }}
            onToggle={toggle}
            onToggleAll={toggleAllOnPage}
            onCommentChange={(id, comment) =>
              updateParticipant(id, { comment })
            }
            onTemplateChange={(id, templateName) =>
              updateParticipant(id, { template: templateName })
            }
            onPageChange={setPage}
            onAddParticipant={() => setAddOpen(true)}
            onConfirmReceived={handleConfirmReceived}
            onRemove={handleRemoveParticipant}
          />
        </>
      )}

      {tab === "timeline" && (
        <div className="tab-panel tab-panel--timeline">
          <AutomationTimeline
            participants={event.participants}
            onSchedule={() => setScheduleOpen(true)}
          />
          <p className="tab-panel__muted">
            {scheduledTouches > 0
              ? `${scheduledTouches} touch${scheduledTouches === 1 ? "" : "es"} currently scheduled. `
              : "No scheduled touches yet. "}
            Showing {filteredCount} searchable participants. Due jobs auto-send
            while Outlook is connected.
          </p>
        </div>
      )}

      {tab === "settings" && (
        <div className="tab-panel">
          <p>
            Campaign settings for <strong>{event.campaign}</strong> with
            template {event.sequenceLabel}.
          </p>
          <p className="tab-panel__muted">
            Live Outlook sends use the global template from Manage Templates.
            Drip jobs are stored locally and fire when due. Use Audience &
            Segments for cross-event filters.
          </p>
        </div>
      )}

      {addOpen ? (
        <AddParticipantPanel
          eventName={event.name}
          existing={event.participants}
          industries={industries}
          outlookConnected={outlookConnected}
          outlookMode={outlookMode}
          mailbox={outlookMailbox}
          onClose={() => setAddOpen(false)}
          onAdd={handleAddParticipant}
          onConnectOutlook={onConnectOutlook}
        />
      ) : null}

      <ScheduleCampaignModal
        open={scheduleOpen}
        eventId={event.id}
        eventName={event.name}
        participants={event.participants}
        selectedIds={selectedIds}
        onClose={() => setScheduleOpen(false)}
        onScheduled={(participants, scheduledCount) => {
          onParticipantsChange(participants);
          onToast(
            `Scheduled ${scheduledCount} email${scheduledCount === 1 ? "" : "s"}. They send when due if Outlook stays connected.`,
          );
        }}
        onToast={onToast}
      />
    </section>
  );
}
