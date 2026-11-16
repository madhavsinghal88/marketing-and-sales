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
  { key: "pendingEmails", label: "Pending Emails" },
];

export function StatsBar({ stats }: Props) {
  return (
    <section className="stats-bar" aria-label="Overview stats">
      {CARDS.map((card) => (
        <article key={card.key} className="stat-card">
          <p className="stat-card__value">
            {card.format
              ? card.format(stats[card.key])
              : stats[card.key].toLocaleString("en-US")}
          </p>
          <p className="stat-card__label">{card.label}</p>
        </article>
      ))}
    </section>
  );
}
