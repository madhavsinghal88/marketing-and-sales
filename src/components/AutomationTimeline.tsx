import { SEQUENCE_DAYS, type Participant, type SequenceDay } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  participants: Participant[];
  onSchedule?: () => void;
};

function daySummary(participants: Participant[], day: SequenceDay) {
  const counts = { Sent: 0, Scheduled: 0, Pending: 0, Failed: 0 };
  for (const person of participants) {
    const touch = person.touches.find((t) => t.day === day);
    const status = touch?.status ?? "Pending";
    counts[status] += 1;
  }
  if (counts.Sent > 0) return { label: "Sent", detail: `${counts.Sent} sent` };
  if (counts.Scheduled > 0)
    return { label: "Scheduled", detail: `${counts.Scheduled} queued` };
  if (counts.Failed > 0)
    return { label: "Failed", detail: `${counts.Failed} failed` };
  return { label: "Pending", detail: "Waiting" };
}

export function AutomationTimeline({ participants, onSchedule }: Props) {
  return (
    <section className="widget" aria-label="Automations">
      <div className="widget__head">
        <h3>Automations</h3>
        {onSchedule ? (
          <button type="button" className="btn-link" onClick={onSchedule}>
            Edit schedule
          </button>
        ) : null}
      </div>

      <ol className="auto-timeline">
        {SEQUENCE_DAYS.map((day, index) => {
          const summary = daySummary(participants, day.key);
          return (
            <li key={day.key} className="auto-timeline__item">
              <span className="auto-timeline__marker" aria-hidden>
                {index + 1}
              </span>
              <div>
                <p className="auto-timeline__title">
                  {day.label}: {day.sublabel}
                </p>
                <p className="auto-timeline__meta">
                  <StatusBadge
                    status={
                      summary.label as "Sent" | "Scheduled" | "Pending" | "Failed"
                    }
                    compact
                  />
                  <span>{summary.detail}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
