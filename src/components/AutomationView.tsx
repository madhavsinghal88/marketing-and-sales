import type { AutomationRule, EventItem } from "@/lib/types";
import { AutomationTimeline } from "./AutomationTimeline";

type Props = {
  rules: AutomationRule[];
  selectedEvent?: EventItem;
  onToggle: (id: string) => void;
  onOpenSchedule: () => void;
};

export function AutomationView({
  rules,
  selectedEvent,
  onToggle,
  onOpenSchedule,
}: Props) {
  return (
    <section className="view-panel" aria-label="Automation workflows">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Marketing</p>
          <h2>Automation</h2>
          <p className="view-panel__sub">
            Trigger emails from registration, inactivity, clicks, replies, or
            event dates.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={onOpenSchedule}>
          Schedule sequence
        </button>
      </div>

      <div className="automation-layout">
        <div className="rule-list">
          {rules.map((rule) => (
            <article key={rule.id} className="rule-card">
              <div className="rule-card__main">
                <h3>{rule.name}</h3>
                <p>
                  <strong>When:</strong> {rule.triggerLabel}
                </p>
                <p>
                  <strong>Then:</strong> {rule.action}
                </p>
              </div>
              <label className="rule-toggle">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => onToggle(rule.id)}
                />
                <span>{rule.enabled ? "On" : "Off"}</span>
              </label>
            </article>
          ))}
        </div>

        {selectedEvent ? (
          <AutomationTimeline
            participants={selectedEvent.participants}
            onSchedule={onOpenSchedule}
          />
        ) : null}
      </div>
    </section>
  );
}
