import {
  SEQUENCE_DAYS,
  type DeliveryStatus,
  type Participant,
  type SequenceDay,
} from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  participants: Participant[];
  selectedIds: Set<string>;
  query: string;
  page: number;
  pageSize: number;
  onQueryChange: (q: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onCommentChange: (id: string, comment: string) => void;
  onTemplateChange: (id: string, template: string) => void;
  onPageChange: (page: number) => void;
  onAddParticipant: () => void;
  onConfirmReceived: (id: string) => void;
  onRemove: (id: string) => void;
};

const DELIVERY_LABEL: Record<DeliveryStatus, { icon: string; label: string }> = {
  awaiting: { icon: "⏳", label: "Checking delivery" },
  delivered: { icon: "✓", label: "Delivered" },
  bounced: { icon: "✗", label: "Bounced" },
  confirmed: { icon: "✓✓", label: "Received" },
  unverified: { icon: "?", label: "Unverified" },
};

function DeliveryBadge({
  participant,
  onConfirm,
}: {
  participant: Participant;
  onConfirm: (id: string) => void;
}) {
  const d = participant.delivery;
  if (!d) return null;

  const view = d.demo
    ? { icon: "◌", label: "Demo send (not real)" }
    : DELIVERY_LABEL[d.status];
  const checked = d.checkedAt
    ? ` · checked ${new Date(d.checkedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "";
  const canConfirm =
    !d.demo && d.status !== "confirmed" && d.status !== "bounced";

  return (
    <span className="delivery-row">
      <span
        className={`delivery-badge delivery-badge--${d.demo ? "demo" : d.status}`}
        title={`${d.detail ?? view.label}${checked}`}
      >
        <span aria-hidden>{view.icon}</span> {view.label}
      </span>
      {canConfirm ? (
        <button
          type="button"
          className="delivery-confirm"
          onClick={() => onConfirm(participant.id)}
          title="I can see this email in their inbox"
        >
          Confirm received
        </button>
      ) : null}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function touchFor(participant: Participant, day: SequenceDay) {
  return participant.touches.find((t) => t.day === day);
}

function buildPageItems(totalPages: number, current: number): (number | "…")[] {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - current) <= 1,
  );
  const items: (number | "…")[] = [];
  for (let i = 0; i < pages.length; i++) {
    const n = pages[i];
    if (i > 0 && n - pages[i - 1] > 1) items.push("…");
    items.push(n);
  }
  return items;
}

export function ParticipantsTable({
  participants,
  selectedIds,
  query,
  page,
  pageSize,
  onQueryChange,
  onToggle,
  onToggleAll,
  onCommentChange,
  onTemplateChange,
  onPageChange,
  onAddParticipant,
  onConfirmReceived,
  onRemove,
}: Props) {
  const filtered = participants.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((p) => selectedIds.has(p.id));
  const someOnPageSelected = pageRows.some((p) => selectedIds.has(p.id));

  return (
    <div className="participants">
      <div className="participants__toolbar">
        <label className="search-field search-field--wide">
          <span className="search-field__icon" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            placeholder="Search participants..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>
        <div className="participants__actions">
          <button type="button" className="btn btn--ghost">
            Filter
          </button>
          <button type="button" className="btn btn--ghost">
            Export
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onAddParticipant}
          >
            + Add Participant
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  ref={(el) => {
                    if (el)
                      el.indeterminate = someOnPageSelected && !allOnPageSelected;
                  }}
                  onChange={onToggleAll}
                  aria-label="Select all on page"
                />
              </th>
              <th>Participant</th>
              {SEQUENCE_DAYS.map((day) => (
                <th key={day.key}>
                  <span className="th-stack">
                    <span>{day.label}</span>
                    <span className="th-stack__sub">({day.sublabel})</span>
                  </span>
                </th>
              ))}
              <th>Template</th>
              <th>Comments</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((participant) => (
              <tr
                key={participant.id}
                className={selectedIds.has(participant.id) ? "is-selected" : ""}
              >
                <td className="col-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(participant.id)}
                    onChange={() => onToggle(participant.id)}
                    aria-label={`Select ${participant.name}`}
                  />
                </td>
                <td>
                  <div className="person-cell">
                    <span className="person-cell__avatar" aria-hidden>
                      {initials(participant.name)}
                    </span>
                    <span className="person-cell__copy">
                      <span className="person-cell__name">
                        {participant.name}
                        {participant.source === "manual" ? (
                          <>
                            <span className="person-tag">Added</span>
                            <button
                              type="button"
                              className="person-remove"
                              aria-label={`Remove ${participant.name}`}
                              title="Remove this participant"
                              onClick={() => onRemove(participant.id)}
                            >
                              ✕
                            </button>
                          </>
                        ) : null}
                      </span>
                      <span className="person-cell__email">
                        {participant.email}
                      </span>
                      <DeliveryBadge
                        participant={participant}
                        onConfirm={onConfirmReceived}
                      />
                    </span>
                  </div>
                </td>
                {SEQUENCE_DAYS.map((day) => {
                  const touch = touchFor(participant, day.key);
                  return (
                    <td key={day.key}>
                      {touch ? (
                        <StatusBadge
                          status={touch.status}
                          time={touch.at}
                        />
                      ) : (
                        <StatusBadge status="Pending" />
                      )}
                    </td>
                  );
                })}
                <td>
                  <select
                    className="template-select"
                    value={participant.template}
                    onChange={(e) =>
                      onTemplateChange(participant.id, e.target.value)
                    }
                  >
                    <option>Event Sequence</option>
                    <option>Welcome Only</option>
                    <option>Follow-up Focus</option>
                  </select>
                </td>
                <td>
                  <div className="comment-cell">
                    <span className="comment-cell__icon" aria-hidden>
                      💬
                    </span>
                    <input
                      className="comment-cell__input"
                      type="text"
                      value={participant.comment}
                      placeholder="Add comment…"
                      onChange={(e) =>
                        onCommentChange(participant.id, e.target.value)
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <p className="pagination__meta">
          {filtered.length === 0
            ? "0 participants"
            : `${start + 1}-${Math.min(start + pageSize, filtered.length)} of ${filtered.length} participants`}
        </p>
        <div className="pagination__pages">
          <button
            type="button"
            className="page-btn"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            ‹
          </button>
          {buildPageItems(totalPages, safePage).map((item, idx) =>
            item === "…" ? (
              <span key={`e-${idx}`} className="page-ellipsis">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`page-btn ${item === safePage ? "is-active" : ""}`}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className="page-btn"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
