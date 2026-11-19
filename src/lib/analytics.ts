import type {
  CampaignMetrics,
  EventItem,
  Participant,
  SegmentFilters,
} from "@/lib/types";

export function computeCampaignMetrics(
  participants: Participant[],
): CampaignMetrics {
  let sent = 0;
  for (const person of participants) {
    sent += person.touches.filter((t) => t.status === "Sent").length;
  }

  const opened = participants.filter((p) => p.engagement.opened).length;
  const clicked = participants.filter((p) => p.engagement.clicked).length;
  const replied = participants.filter((p) => p.engagement.replied).length;
  const unsubscribed = participants.filter(
    (p) => p.engagement.unsubscribed,
  ).length;
  const conversions = participants.filter(
    (p) => p.engagement.replied || p.engagement.score >= 70,
  ).length;

  const delivered = Math.max(sent - Math.floor(unsubscribed * 0.2), 0);
  const openRate = sent > 0 ? Math.round((opened / participants.length) * 100) : 0;
  const clickRate = sent > 0 ? Math.round((clicked / participants.length) * 100) : 0;
  const replyRate = sent > 0 ? Math.round((replied / participants.length) * 100) : 0;

  return {
    sent,
    delivered,
    opened,
    clicked,
    replied,
    unsubscribed,
    conversions,
    openRate,
    clickRate,
    replyRate,
  };
}

export function flattenParticipants(events: EventItem[]): (Participant & {
  eventId: string;
  eventName: string;
})[] {
  return events.flatMap((event) =>
    event.participants.map((p) => ({
      ...p,
      eventId: event.id,
      eventName: event.name,
    })),
  );
}

export function applySegmentFilters(
  people: (Participant & { eventId: string; eventName: string })[],
  filters: SegmentFilters,
): (Participant & { eventId: string; eventName: string })[] {
  return people.filter((p) => {
    if (filters.eventId && p.eventId !== filters.eventId) return false;
    if (
      filters.industry &&
      p.industry.toLowerCase() !== filters.industry.toLowerCase()
    ) {
      return false;
    }
    if (
      filters.company &&
      !p.company.toLowerCase().includes(filters.company.toLowerCase())
    ) {
      return false;
    }
    if (
      filters.jobTitle &&
      !p.jobTitle.toLowerCase().includes(filters.jobTitle.toLowerCase())
    ) {
      return false;
    }
    if (
      filters.location &&
      !p.location.toLowerCase().includes(filters.location.toLowerCase())
    ) {
      return false;
    }
    if (
      filters.interest &&
      !p.interests.some((i) =>
        i.toLowerCase().includes(filters.interest.toLowerCase()),
      )
    ) {
      return false;
    }
    if (filters.engagement && p.engagement.level !== filters.engagement) {
      return false;
    }
    return true;
  });
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
