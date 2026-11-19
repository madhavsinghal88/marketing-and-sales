import type { EventItem, MarketingCampaign } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  campaigns: MarketingCampaign[];
  events: EventItem[];
  onCreate: (eventId: string, name: string) => void;
  onOpenSchedule: (eventId: string) => void;
  onToast: (message: string) => void;
};

export function CampaignsView({
  campaigns,
  events,
  onCreate,
  onOpenSchedule,
  onToast,
}: Props) {
  return (
    <section className="view-panel" aria-label="Email campaigns">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Marketing</p>
          <h2>Email Campaigns</h2>
          <p className="view-panel__sub">
            Create campaigns, reuse templates, and schedule bulk sequence sends.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            const event = events[0];
            if (!event) {
              onToast("Add an event first.");
              return;
            }
            onCreate(event.id, `${event.name} Campaign`);
            onToast("Draft campaign created. Schedule it from the dashboard.");
          }}
        >
          + New campaign
        </button>
      </div>

      <div className="campaign-grid">
        {campaigns.map((campaign) => (
          <article key={campaign.id} className="campaign-card">
            <div className="campaign-card__top">
              <StatusBadge status={campaign.status} compact />
              <span className="campaign-card__date">{campaign.createdAt}</span>
            </div>
            <h3>{campaign.name}</h3>
            <p>
              {campaign.eventName} · {campaign.audienceLabel}
            </p>
            {campaign.scheduledFor ? (
              <p className="campaign-card__schedule">
                Scheduled {campaign.scheduledFor}
              </p>
            ) : null}
            <div className="campaign-card__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onOpenSchedule(campaign.eventId)}
              >
                Schedule sequence
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  onToast("Newsletter editor expands in a later phase.")
                }
              >
                Edit content
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
