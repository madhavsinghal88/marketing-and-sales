"use client";

import { useMemo, useState } from "react";
import type { EngagementLevel, EventItem, SegmentFilters } from "@/lib/types";
import {
  applySegmentFilters,
  flattenParticipants,
  uniqueSorted,
} from "@/lib/analytics";

type Props = {
  events: EventItem[];
  onToast: (message: string) => void;
};

const EMPTY: SegmentFilters = {
  eventId: "",
  industry: "",
  company: "",
  jobTitle: "",
  location: "",
  interest: "",
  engagement: "",
};

export function SegmentsView({ events, onToast }: Props) {
  const [filters, setFilters] = useState<SegmentFilters>(EMPTY);
  const people = useMemo(() => flattenParticipants(events), [events]);

  const options = useMemo(() => {
    return {
      industries: uniqueSorted(people.map((p) => p.industry)),
      locations: uniqueSorted(people.map((p) => p.location)),
      titles: uniqueSorted(people.map((p) => p.jobTitle)),
      interests: uniqueSorted(people.flatMap((p) => p.interests)),
    };
  }, [people]);

  const filtered = useMemo(
    () => applySegmentFilters(people, filters),
    [people, filters],
  );

  function set<K extends keyof SegmentFilters>(key: K, value: SegmentFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="view-panel" aria-label="Audience and segments">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Marketing</p>
          <h2>Audience & Segments</h2>
          <p className="view-panel__sub">
            Filter participants by event, industry, company, role, location,
            interests, and engagement.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() =>
            onToast(
              `Saved segment draft with ${filtered.length} people — wire to campaigns next.`,
            )
          }
        >
          Save segment
        </button>
      </div>

      <div className="segment-filters">
        <label className="field">
          <span>Event</span>
          <select
            value={filters.eventId}
            onChange={(e) => set("eventId", e.target.value)}
          >
            <option value="">All events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Industry</span>
          <select
            value={filters.industry}
            onChange={(e) => set("industry", e.target.value)}
          >
            <option value="">Any</option>
            {options.industries.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Company</span>
          <input
            type="search"
            placeholder="Search company"
            value={filters.company}
            onChange={(e) => set("company", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Job title</span>
          <select
            value={filters.jobTitle}
            onChange={(e) => set("jobTitle", e.target.value)}
          >
            <option value="">Any</option>
            {options.titles.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Location</span>
          <select
            value={filters.location}
            onChange={(e) => set("location", e.target.value)}
          >
            <option value="">Any</option>
            {options.locations.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Interest</span>
          <select
            value={filters.interest}
            onChange={(e) => set("interest", e.target.value)}
          >
            <option value="">Any</option>
            {options.interests.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Engagement</span>
          <select
            value={filters.engagement}
            onChange={(e) =>
              set("engagement", e.target.value as EngagementLevel | "")
            }
          >
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setFilters(EMPTY)}
        >
          Clear
        </button>
      </div>

      <p className="segment-count">
        Showing <strong>{filtered.length}</strong> of {people.length} people
      </p>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Event</th>
              <th>Company</th>
              <th>Industry</th>
              <th>Title</th>
              <th>Location</th>
              <th>Engagement</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 40).map((person) => (
              <tr key={`${person.eventId}-${person.id}`}>
                <td>
                  <div className="person-cell">
                    <strong>{person.name}</strong>
                    <span>{person.email}</span>
                  </div>
                </td>
                <td>{person.eventName}</td>
                <td>{person.company}</td>
                <td>{person.industry}</td>
                <td>{person.jobTitle}</td>
                <td>{person.location}</td>
                <td>
                  <span
                    className={`eng-pill eng-pill--${person.engagement.level}`}
                  >
                    {person.engagement.level} · {person.engagement.score}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>No participants match these filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
