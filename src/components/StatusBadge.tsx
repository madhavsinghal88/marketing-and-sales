import type { EventStatus, TouchStatus } from "@/lib/types";

type Props = {
  status: TouchStatus | EventStatus;
  time?: string;
  compact?: boolean;
};

export function StatusBadge({ status, time, compact }: Props) {
  const kind = status.toLowerCase().replace(/\s+/g, "-");
  const icon =
    status === "Sent" || status === "Active" || status === "Completed"
      ? "✓"
      : status === "Scheduled"
        ? "⏳"
        : status === "Failed"
          ? "!"
          : "•";

  return (
    <span className={`status-badge status-badge--${kind}`}>
      <span className="status-badge__icon" aria-hidden>
        {icon}
      </span>
      <span className="status-badge__text">
        <span className="status-badge__label">{status}</span>
        {!compact && time ? (
          <span className="status-badge__time">{time}</span>
        ) : null}
      </span>
    </span>
  );
}
