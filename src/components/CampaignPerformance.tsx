import type { CampaignMetrics } from "@/lib/types";

type Props = {
  metrics: CampaignMetrics;
  title?: string;
};

export function CampaignPerformance({
  metrics,
  title = "Campaign Performance",
}: Props) {
  const rings = [
    { label: "Opened", value: metrics.opened, tone: "open" },
    { label: "Clicked", value: metrics.clicked, tone: "click" },
    { label: "Replied", value: metrics.replied, tone: "reply" },
  ];

  return (
    <section className="widget" aria-label={title}>
      <div className="widget__head">
        <h3>{title}</h3>
        <p>{metrics.openRate}% open rate</p>
      </div>

      <div className="perf-donut" aria-hidden>
        <div
          className="perf-donut__ring"
          style={{
            background: `conic-gradient(
              var(--blue) 0 ${metrics.openRate}%,
              #d9e4f5 ${metrics.openRate}% 100%
            )`,
          }}
        >
          <div className="perf-donut__hole">
            <strong>{metrics.openRate}%</strong>
            <span>opens</span>
          </div>
        </div>
      </div>

      <ul className="perf-legend">
        <li>
          <span className="perf-legend__dot perf-legend__dot--sent" />
          Sent <strong>{metrics.sent}</strong>
        </li>
        {rings.map((row) => (
          <li key={row.label}>
            <span className={`perf-legend__dot perf-legend__dot--${row.tone}`} />
            {row.label} <strong>{row.value}</strong>
          </li>
        ))}
        <li>
          <span className="perf-legend__dot perf-legend__dot--unsub" />
          Unsubscribed <strong>{metrics.unsubscribed}</strong>
        </li>
      </ul>
    </section>
  );
}
