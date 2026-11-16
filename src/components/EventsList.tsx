import type { EventItem } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  events: EventItem[];
  selectedId: string;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  onAddEvent: () => void;
};

export function EventsList({
  events,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  onAddEvent,
}: Props) {
  return (
    <section className="events-list" aria-label="Events">
      <div className="events-list__head">
        <h2 className="events-list__title">
          Events <span>({events.length})</span>
        </h2>
        <button type="button" className="btn-link" onClick={onAddEvent}>
          + Add Event
        </button>
      </div>

      <label className="search-field">
        <span className="search-field__icon" aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          placeholder="Search events..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </label>

      <ul className="events-list__items">
        {events.map((event) => {
          const selected = event.id === selectedId;
          return (
            <li key={event.id}>
              <button
                type="button"
                className={`event-card ${selected ? "is-selected" : ""}`}
                onClick={() => onSelect(event.id)}
              >
                <span className="event-card__name">{event.name}</span>
                <span className="event-card__meta">
                  <span>{event.participantCount} participants</span>
                  <StatusBadge status={event.status} compact />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
