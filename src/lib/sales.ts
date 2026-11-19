import type {
  Deal,
  EventItem,
  FollowUpTask,
  LeadTemperature,
  PipelineStage,
  SalesActivity,
  SalesLead,
  SalesOwner,
} from "@/lib/types";
import { PIPELINE_STAGES, SALES_OWNERS } from "@/lib/types";
import { flattenParticipants } from "@/lib/analytics";

export function temperatureFromScore(score: number): LeadTemperature {
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Cold";
}

export function stageFromScore(score: number, seed: number): PipelineStage {
  if (score >= 85) return seed % 2 === 0 ? "Negotiation" : "Proposal";
  if (score >= 70) return "Qualified";
  if (score >= 45) return "Contacted";
  if (score >= 20) return "New";
  return seed % 5 === 0 ? "Lost" : "New";
}

export function probabilityForStage(stage: PipelineStage): number {
  switch (stage) {
    case "New":
      return 10;
    case "Contacted":
      return 20;
    case "Qualified":
      return 40;
    case "Proposal":
      return 55;
    case "Negotiation":
      return 75;
    case "Won":
      return 100;
    case "Lost":
      return 0;
  }
}

export function buildLeadsFromEvents(events: EventItem[]): SalesLead[] {
  const people = flattenParticipants(events);
  return people.map((person, index) => {
    const seed = person.id
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const score = person.engagement.score;
    return {
      id: `lead-${person.eventId}-${person.id}`,
      participantId: person.id,
      eventId: person.eventId,
      eventName: person.eventName,
      name: person.name,
      email: person.email,
      company: person.company,
      jobTitle: person.jobTitle,
      industry: person.industry,
      score,
      temperature: temperatureFromScore(score),
      stage: stageFromScore(score, seed + index),
      owner: SALES_OWNERS[(seed + index) % SALES_OWNERS.length],
      lastActivity:
        person.engagement.replied
          ? "Replied to email"
          : person.engagement.clicked
            ? "Clicked CTA"
            : person.engagement.opened
              ? "Opened email"
              : "Registered",
      notes: person.comment || "No notes yet",
    };
  });
}

export function buildFollowUps(leads: SalesLead[]): FollowUpTask[] {
  return leads
    .filter((lead) => lead.stage !== "Won" && lead.stage !== "Lost")
    .slice(0, 12)
    .map((lead, index) => {
      const overdue = index % 4 === 0;
      const done = index % 5 === 0;
      return {
        id: `fu-${lead.id}`,
        leadId: lead.id,
        leadName: lead.name,
        company: lead.company,
        owner: lead.owner,
        dueLabel: overdue
          ? "Yesterday"
          : done
            ? "Completed"
            : index % 3 === 0
              ? "Today 4:00 PM"
              : "Tomorrow 11:00 AM",
        channel: (["Call", "Email", "Meeting"] as const)[index % 3],
        status: done ? "Done" : overdue ? "Overdue" : "Open",
        note:
          lead.temperature === "Hot"
            ? "Priority — high engagement"
            : "Check interest and next step",
      };
    });
}

export function buildActivities(leads: SalesLead[]): SalesActivity[] {
  return leads.slice(0, 10).map((lead, index) => ({
    id: `act-${lead.id}`,
    leadId: lead.id,
    leadName: lead.name,
    kind: (["Email", "Call", "Note"] as const)[index % 3],
    summary:
      index % 3 === 0
        ? "Sent follow-up sequence email"
        : index % 3 === 1
          ? "Discovery call — 20 min"
          : "Noted sponsorship interest",
    at: index % 2 === 0 ? "Today 10:15 AM" : "Yesterday 3:40 PM",
    owner: lead.owner,
  }));
}

export function buildDeals(leads: SalesLead[]): Deal[] {
  return leads
    .filter((lead) =>
      ["Qualified", "Proposal", "Negotiation", "Won", "Lost"].includes(
        lead.stage,
      ),
    )
    .map((lead, index) => {
      const base = 4000 + (lead.score * 180) + index * 750;
      const probability = probabilityForStage(lead.stage);
      return {
        id: `deal-${lead.id}`,
        leadId: lead.id,
        leadName: lead.name,
        company: lead.company,
        eventName: lead.eventName,
        owner: lead.owner,
        stage: lead.stage,
        value: base,
        probability,
        expectedRevenue: Math.round((base * probability) / 100),
        closeLabel:
          lead.stage === "Won"
            ? "Closed"
            : lead.stage === "Lost"
              ? "Closed — lost"
              : index % 2 === 0
                ? "Nov 28"
                : "Dec 5",
      };
    });
}

export function pipelineSummary(leads: SalesLead[]) {
  const total = leads.length;
  const qualified = leads.filter((l) =>
    ["Qualified", "Proposal", "Negotiation", "Won"].includes(l.stage),
  ).length;
  const inPipeline = leads.filter((l) =>
    ["Contacted", "Qualified", "Proposal", "Negotiation"].includes(l.stage),
  ).length;
  const closed = leads.filter(
    (l) => l.stage === "Won" || l.stage === "Lost",
  ).length;
  const won = leads.filter((l) => l.stage === "Won").length;
  return { total, qualified, inPipeline, closed, won };
}

export function groupLeadsByStage(leads: SalesLead[]) {
  const groups = {} as Record<PipelineStage, SalesLead[]>;
  for (const stage of PIPELINE_STAGES) groups[stage] = [];
  for (const lead of leads) groups[lead.stage].push(lead);
  return groups;
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function moveLeadStage(
  leads: SalesLead[],
  leadId: string,
  stage: PipelineStage,
): SalesLead[] {
  return leads.map((lead) =>
    lead.id === leadId
      ? {
          ...lead,
          stage,
          lastActivity: `Moved to ${stage}`,
        }
      : lead,
  );
}

export function assignLeadOwner(
  leads: SalesLead[],
  leadId: string,
  owner: SalesOwner,
): SalesLead[] {
  return leads.map((lead) =>
    lead.id === leadId ? { ...lead, owner, lastActivity: `Assigned to ${owner}` } : lead,
  );
}
