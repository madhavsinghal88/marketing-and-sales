import type { CampaignMetrics, EventItem } from "@/lib/types";
import { computeCampaignMetrics, flattenParticipants } from "@/lib/analytics";
import { CampaignPerformance } from "./CampaignPerformance";

type Props = {
  events: EventItem[];
  globalMetrics: CampaignMetrics;
};

export function AnalyticsView({ events, globalMetrics }: Props) {
  const people = flattenParticipants(events);

  return (
    <section className="view-panel" aria-label="Campaign analytics">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Analytics</p>
          <h2>Campaign Analytics</h2>
          <p className="view-panel__sub">
            Delivery, opens, clicks, replies, unsubscribes, and conversions
            across events.
          </p>
        </div>
      </div>

      <div className="analytics-grid">
        <CampaignPerformance metrics={globalMetrics} title="All campaigns" />

        <div className="metric-cards">
          {(
            [
              ["Delivered", globalMetrics.delivered],
              ["Opened", globalMetrics.opened],
              ["Clicked", globalMetrics.clicked],
              ["Replied", globalMetrics.replied],
              ["Unsubscribed", globalMetrics.unsubscribed],
              ["Conversions", globalMetrics.conversions],
            ] as const
          ).map(([label, value]) => (
            <article key={label} className="metric-card">
              <p className="metric-card__value">{value}</p>
              <p className="metric-card__label">{label}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Sent</th>
              <th>Open rate</th>
              <th>Click rate</th>
              <th>Replies</th>
              <th>Unsubs</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const metrics = computeCampaignMetrics(event.participants);
              return (
                <tr key={event.id}>
                  <td>{event.name}</td>
                  <td>{metrics.sent}</td>
                  <td>{metrics.openRate}%</td>
                  <td>{metrics.clickRate}%</td>
                  <td>{metrics.replied}</td>
                  <td>{metrics.unsubscribed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="view-panel__sub">
        Based on {people.length} loaded participants with engagement signals.
      </p>
    </section>
  );
}
