import { useEffect, useMemo, useState } from "react";
import type {
  EmailTemplate,
  EngagementLevel,
  EventItem,
  Participant,
  SequenceDay,
} from "@/lib/types";
import { SEQUENCE_DAYS } from "@/lib/types";
import { formatTouchTime, nextSendableDay } from "@/lib/outlook/sequence";
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
};

export function EventWorkspace({
  event,
  template,
  outlookConnected,
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
    const jobs = selected
      .map((p) => {
        const day =
          sendDay === "auto" ? nextSendableDay(p) : (sendDay as SequenceDay);
        return day ? { participant: p, day } : null;
      })
      .filter(Boolean) as { participant: Participant; day: SequenceDay }[];

    if (jobs.length === 0) {
      onToast("Nothing to send — selected people are already complete.");
      return;
    }

    const byDay = new Map<SequenceDay, Participant[]>();
    for (const job of jobs) {
      const list = byDay.get(job.day) ?? [];
      list.push(job.participant);
      byDay.set(job.day, list);
    }

    setSending(true);
    const allResults: SendResultRow[] = [];

    try {
      for (const [day, people] of byDay) {
        const res = await fetch("/api/outlook/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventName: event.name,
            day,
            template,
            recipients: people.map((p) => ({
              id: p.id,
              name: p.name,
              email: p.email,
            })),
          }),
        });

        const data = (await res.json()) as {
          error?: string;
          results?: SendResultRow[];
          sentCount?: number;
          failedCount?: number;
          mode?: string;
        };

        if (!res.ok) {
          onToast(data.error ?? "Send failed");
          continue;
        }

        for (const row of data.results ?? []) {
          allResults.push({ ...row, day });
        }

        // Manual send replaces any pending drip for these people/day
        cancelPendingJobsForParticipants(
          event.id,
          people.map((p) => p.id),
          day,
        );
      }

      const nowLabel = formatTouchTime();
      onParticipantsChange(
        event.participants.map((p) => {
          const rows = allResults.filter((r) => r.id === p.id);
          if (rows.length === 0) return p;
          let touches = p.touches;
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
          }
          return { ...p, touches };
        }),
      );

      const sent = allResults.filter((r) => r.ok).length;
      const failed = allResults.length - sent;
      onToast(
        failed
          ? `Sent ${sent}, failed ${failed}. Failed rows can be retried.`
          : `Sent ${sent} email${sent === 1 ? "" : "s"} via Outlook.`,
      );
    } catch {
      onToast("Network error while sending.");
    } finally {
      setSending(false);
    }
  }

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
          </p>
        </div>
        <div className="send-bar__actions">
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
            onAddParticipant={() =>
              onToast("Add Participant — coming in a later phase.")
            }
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
