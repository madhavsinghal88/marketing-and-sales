"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SEQUENCE_DAYS,
  type Participant,
  type SequenceDay,
} from "@/lib/types";
import {
  buildSchedule,
  defaultDaySchedule,
  type ScheduleAudience,
} from "@/lib/drip/schedule";
import { upsertDripJobs } from "@/lib/drip/store";

type Props = {
  open: boolean;
  eventId: string;
  eventName: string;
  participants: Participant[];
  selectedIds: Set<string>;
  onClose: () => void;
  onScheduled: (participants: Participant[], scheduledCount: number) => void;
  onToast: (message: string) => void;
};

export function ScheduleCampaignModal({
  open,
  eventId,
  eventName,
  participants,
  selectedIds,
  onClose,
  onScheduled,
  onToast,
}: Props) {
  const [audience, setAudience] = useState<ScheduleAudience>("selected");
  const [dayTimes, setDayTimes] = useState<Record<SequenceDay, string>>({
    D1: "",
    D3: "",
    D5: "",
    D7: "",
  });
  const [enabled, setEnabled] = useState<Record<SequenceDay, boolean>>({
    D1: true,
    D3: true,
    D5: true,
    D7: true,
  });

  useEffect(() => {
    if (!open) return;
    setDayTimes(defaultDaySchedule(new Date()));
    setEnabled({ D1: true, D3: true, D5: true, D7: true });
    setAudience(selectedIds.size > 0 ? "selected" : "event");
  }, [open, selectedIds.size]);

  const audiencePeople = useMemo(() => {
    if (audience === "event") return participants;
    return participants.filter((p) => selectedIds.has(p.id));
  }, [audience, participants, selectedIds]);

  if (!open) return null;

  function toggleDay(day: SequenceDay) {
    setEnabled((prev) => ({ ...prev, [day]: !prev[day] }));
  }

  function handleConfirm() {
    if (audiencePeople.length === 0) {
      onToast(
        audience === "selected"
          ? "Select participants first, or choose Entire event."
          : "This event has no participants.",
      );
      return;
    }

    const daysEnabled = SEQUENCE_DAYS.map((d) => d.key).filter(
      (key) => enabled[key],
    );
    if (daysEnabled.length === 0) {
      onToast("Enable at least one sequence day.");
      return;
    }

    try {
      const result = buildSchedule({
        eventId,
        eventName,
        participants: audiencePeople,
        dayTimes,
        daysEnabled,
      });

      if (result.scheduledCount === 0) {
        onToast("Nothing to schedule — selected days are already Sent.");
        return;
      }

      upsertDripJobs(result.jobs);

      // Merge scheduled people back into full event participant list
      const byId = new Map(result.participants.map((p) => [p.id, p]));
      const merged = participants.map((p) => byId.get(p.id) ?? p);

      onScheduled(merged, result.scheduledCount);
      onClose();
    } catch {
      onToast("Invalid schedule date. Check the day times and try again.");
    }
  }

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside
        className="panel panel--schedule"
        role="dialog"
        aria-label="Schedule campaign"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel__head">
          <div>
            <p className="panel__eyebrow">Drip · Phase 1</p>
            <h2>Schedule campaign</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="panel__hint">
          Queue sequence emails for <strong>{eventName}</strong>. Due jobs send
          automatically while Outlook is connected and this app is open.
        </p>

        <fieldset className="schedule-audience">
          <legend>Audience</legend>
          <label className="schedule-radio">
            <input
              type="radio"
              name="audience"
              checked={audience === "selected"}
              onChange={() => setAudience("selected")}
            />
            <span>
              Selected participants
              <small>{selectedIds.size} selected</small>
            </span>
          </label>
          <label className="schedule-radio">
            <input
              type="radio"
              name="audience"
              checked={audience === "event"}
              onChange={() => setAudience("event")}
            />
            <span>
              Entire event
              <small>{participants.length} people</small>
            </span>
          </label>
        </fieldset>

        <div className="schedule-days">
          <p className="schedule-days__label">Sequence timing</p>
          {SEQUENCE_DAYS.map((day) => (
            <div key={day.key} className="schedule-day-row">
              <label className="schedule-day-row__check">
                <input
                  type="checkbox"
                  checked={enabled[day.key]}
                  onChange={() => toggleDay(day.key)}
                />
                <span>
                  {day.label}
                  <small>{day.sublabel}</small>
                </span>
              </label>
              <input
                type="datetime-local"
                className="schedule-day-row__input"
                disabled={!enabled[day.key]}
                value={dayTimes[day.key]}
                onChange={(e) =>
                  setDayTimes((prev) => ({
                    ...prev,
                    [day.key]: e.target.value,
                  }))
                }
              />
            </div>
          ))}
        </div>

        <p className="panel__note">
          Already-sent days are skipped. Re-scheduling replaces pending jobs for
          the same person + day.
        </p>

        <div className="panel__actions panel__actions--row">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleConfirm}
          >
            Schedule {audiencePeople.length || ""}{" "}
            {audiencePeople.length === 1 ? "person" : "people"}
          </button>
        </div>
      </aside>
    </div>
  );
}
