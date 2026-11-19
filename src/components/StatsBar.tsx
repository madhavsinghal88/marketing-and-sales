import type { AppStats } from "@/lib/types";

type Props = {
  stats: AppStats;
};

const CARDS: {
  key: keyof AppStats;
  label: string;
  format?: (n: number) => string;
}[] = [
  { key: "totalEvents", label: "Total Events" },
  { key: "totalParticipants", label: "Total Participants" },
  {
    key: "emailsSent",
    label: "Emails Sent",
    format: (n) => n.toLocaleString("en-US"),
  },
  {
    key: "opens",
    label: "Opens",
    format: (n) => n.toLocaleString("en-US"),
  },
  {
    key: "clicks",
    label: "Clicks",
    format: (n) => n.toLocaleString("en-US"),
  },
  { key: "salesLeads", label: "Sales Leads" },
];

export function StatsBar({ stats }: Props) {
  return (
    <section className="stats-bar" aria-label="Overview stats">
      {CARDS.map((card) => {
        const value = stats[card.key];
        const suffix =
          card.key === "opens"
            ? ` (${stats.openRate}%)`
            : card.key === "clicks"
              ? ` (${stats.clickRate}%)`
              : "";
        return (
          <article key={card.key} className="stat-card">
            <p className="stat-card__value">
              {card.format
                ? card.format(value)
                : value.toLocaleString("en-US")}
              {suffix ? (
                <span className="stat-card__suffix">{suffix}</span>
              ) : null}
            </p>
            <p className="stat-card__label">{card.label}</p>
          </article>
        );
      })}
    </section>
  );
}
