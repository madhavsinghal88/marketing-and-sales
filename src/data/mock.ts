import type {
  AppStats,
  AutomationRule,
  EmailTemplate,
  EngagementLevel,
  EventItem,
  MarketingCampaign,
  Participant,
  ParticipantEngagement,
  TouchLog,
} from "@/lib/types";

export const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: "Following up on {{event}}",
  body: `Hi {{name}},

Thanks for being part of {{event}}. We'd love to stay in touch.

Best,
The Outreach Team`,
};

export const APP_STATS: AppStats = {
  totalEvents: 12,
  totalParticipants: 486,
  emailsSent: 1240,
  opens: 824,
  openRate: 66,
  clicks: 312,
  clickRate: 25,
  salesLeads: 58,
};

const INDUSTRIES = [
  "Technology",
  "Marketing",
  "Finance",
  "Healthcare",
  "SaaS",
  "Climate",
  "Design",
  "Security",
];
const LOCATIONS = [
  "San Francisco, US",
  "New York, US",
  "London, UK",
  "Bengaluru, IN",
  "Singapore",
  "Berlin, DE",
  "Toronto, CA",
  "Tokyo, JP",
];
const TITLES = [
  "VP Marketing",
  "Head of Growth",
  "Product Manager",
  "CTO",
  "Sales Director",
  "Founder",
  "Demand Gen Lead",
  "Partnerships Manager",
];
const INTEREST_POOL = [
  "AI",
  "Sponsorship",
  "Product demos",
  "Networking",
  "Cloud",
  "Fintech",
  "Design systems",
  "Security",
  "Climate tech",
  "Speaker slots",
];

function companyFromEmail(email: string): string {
  const domain = email.split("@")[1] ?? "company.com";
  const root = domain.split(".")[0] ?? "company";
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function engagementFromTouches(
  touches: TouchLog[],
  seed: number,
): ParticipantEngagement {
  const sentCount = touches.filter((t) => t.status === "Sent").length;
  if (sentCount === 0) {
    return {
      opened: false,
      clicked: false,
      replied: false,
      unsubscribed: false,
      level: "none",
      score: 0,
    };
  }

  const opened = seed % 3 !== 0 || sentCount >= 2;
  const clicked = opened && seed % 2 === 0;
  const replied = clicked && seed % 5 === 0;
  const unsubscribed = seed % 17 === 0;
  let score = sentCount * 12;
  if (opened) score += 20;
  if (clicked) score += 25;
  if (replied) score += 30;
  if (unsubscribed) score = Math.max(score - 40, 0);
  score = Math.min(score, 100);

  let level: EngagementLevel = "low";
  if (score >= 70) level = "high";
  else if (score >= 40) level = "medium";
  else if (score > 0) level = "low";
  else level = "none";

  return { opened, clicked, replied, unsubscribed, level, score };
}

function p(
  id: string,
  name: string,
  email: string,
  touches: TouchLog[],
  comment: string,
  extras?: Partial<
    Pick<
      Participant,
      "company" | "industry" | "jobTitle" | "location" | "interests"
    >
  >,
): Participant {
  const seed = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    id,
    name,
    email,
    company: extras?.company ?? companyFromEmail(email),
    industry: extras?.industry ?? INDUSTRIES[seed % INDUSTRIES.length],
    jobTitle: extras?.jobTitle ?? TITLES[seed % TITLES.length],
    location: extras?.location ?? LOCATIONS[seed % LOCATIONS.length],
    interests:
      extras?.interests ??
      [
        INTEREST_POOL[seed % INTEREST_POOL.length],
        INTEREST_POOL[(seed + 3) % INTEREST_POOL.length],
      ],
    engagement: engagementFromTouches(touches, seed),
    touches,
    template: "Event Sequence",
    comment,
  };
}

export const MOCK_EVENTS: EventItem[] = [
  {
    id: "evt-01",
    name: "Technology Summit 2026",
    participantCount: 48,
    status: "Active",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-01",
        "John Smith",
        "john.smith@example.com",
        [
          { day: "D1", status: "Sent", at: "10:24 AM" },
          { day: "D3", status: "Sent", at: "09:15 AM" },
          { day: "D5", status: "Scheduled", at: "Tomorrow" },
          { day: "D7", status: "Pending" },
        ],
        "Interested in speaker slots",
        {
          company: "Example Corp",
          industry: "Technology",
          jobTitle: "VP Marketing",
          location: "San Francisco, US",
          interests: ["Speaker slots", "AI"],
        },
      ),
      p(
        "p-02",
        "Sarah Johnson",
        "sarah.j@techcorp.io",
        [
          { day: "D1", status: "Sent", at: "10:24 AM" },
          { day: "D3", status: "Scheduled", at: "Tomorrow" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Confirmed attendance",
        {
          company: "TechCorp",
          industry: "Technology",
          jobTitle: "Head of Growth",
          location: "New York, US",
          interests: ["Networking", "Product demos"],
        },
      ),
      p(
        "p-03",
        "Michael Chen",
        "m.chen@innovate.co",
        [
          { day: "D1", status: "Sent", at: "10:25 AM" },
          { day: "D3", status: "Sent", at: "09:16 AM" },
          { day: "D5", status: "Sent", at: "08:00 AM" },
          { day: "D7", status: "Pending" },
        ],
        "Follow up on registration",
        {
          company: "Innovate",
          industry: "SaaS",
          jobTitle: "CTO",
          location: "Singapore",
          interests: ["AI", "Cloud"],
        },
      ),
      p(
        "p-04",
        "Emily Davis",
        "emily.d@startup.io",
        [
          { day: "D1", status: "Sent", at: "10:25 AM" },
          { day: "D3", status: "Scheduled", at: "Tomorrow" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "VIP guest — priority",
        {
          company: "Startup.io",
          industry: "SaaS",
          jobTitle: "Founder",
          location: "Austin, US",
          interests: ["Sponsorship", "Networking"],
        },
      ),
      p(
        "p-05",
        "Robert Wilson",
        "rwilson@enterprise.com",
        [
          { day: "D1", status: "Sent", at: "10:26 AM" },
          { day: "D3", status: "Sent", at: "09:17 AM" },
          { day: "D5", status: "Scheduled", at: "Tomorrow" },
          { day: "D7", status: "Pending" },
        ],
        "Asked about sponsorship",
        {
          company: "Enterprise",
          industry: "Finance",
          jobTitle: "Sales Director",
          location: "London, UK",
          interests: ["Sponsorship", "Fintech"],
        },
      ),
      p(
        "p-06",
        "Aisha Rahman",
        "aisha@northpeak.io",
        [
          { day: "D1", status: "Sent", at: "10:26 AM" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Q1 partnership interest",
      ),
      p(
        "p-07",
        "Ben Ortiz",
        "ben@orbitlab.co",
        [
          { day: "D1", status: "Scheduled", at: "Today 4 PM" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "",
      ),
      p(
        "p-08",
        "Chloe Ng",
        "chloe@signalstack.com",
        [
          { day: "D1", status: "Pending" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Prefer morning sends",
      ),
    ],
  },
  {
    id: "evt-02",
    name: "AI Innovation Conference",
    participantCount: 72,
    status: "Active",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-20",
        "Dev Patel",
        "dev@lattice.ai",
        [
          { day: "D1", status: "Sent", at: "11:00 AM" },
          { day: "D3", status: "Sent", at: "11:05 AM" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Wants a demo next week",
        {
          company: "Lattice AI",
          industry: "Technology",
          jobTitle: "Product Manager",
          location: "Bengaluru, IN",
          interests: ["AI", "Product demos"],
        },
      ),
      p(
        "p-21",
        "Elena Vos",
        "elena@brightloop.dev",
        [
          { day: "D1", status: "Sent", at: "11:02 AM" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "No reply to first touch",
      ),
      p(
        "p-22",
        "Farah Khan",
        "farah@metricly.com",
        [
          { day: "D1", status: "Scheduled", at: "Tomorrow" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "",
      ),
    ],
  },
  {
    id: "evt-03",
    name: "Digital Marketing Expo",
    participantCount: 35,
    status: "Scheduled",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-30",
        "Greg Hale",
        "greg@shipyard.pm",
        [
          { day: "D1", status: "Pending" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Use company domain only",
        {
          industry: "Marketing",
          jobTitle: "Demand Gen Lead",
          interests: ["Networking", "Sponsorship"],
        },
      ),
      p(
        "p-31",
        "Hana Lee",
        "hana@canvasops.io",
        [
          { day: "D1", status: "Pending" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "",
      ),
    ],
  },
  {
    id: "evt-04",
    name: "Cloud Computing Workshop",
    participantCount: 28,
    status: "Active",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-40",
        "Ian Brooks",
        "ian@updraft.co.uk",
        [
          { day: "D1", status: "Sent", at: "09:00 AM" },
          { day: "D3", status: "Scheduled", at: "Tomorrow" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "",
        { industry: "Technology", interests: ["Cloud"] },
      ),
      p(
        "p-41",
        "Jules Martin",
        "jules@foliohq.com",
        [
          { day: "D1", status: "Sent", at: "09:01 AM" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Booth meet",
      ),
    ],
  },
  {
    id: "evt-05",
    name: "Startup Pitch Night",
    participantCount: 56,
    status: "Scheduled",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-50",
        "Kara Weiss",
        "kara@gridline.design",
        [
          { day: "D1", status: "Pending" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Interested in case study",
        { industry: "Design", interests: ["Design systems", "Networking"] },
      ),
    ],
  },
  {
    id: "evt-06",
    name: "Fintech Leaders Forum",
    participantCount: 41,
    status: "Active",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-60",
        "Maya Tan",
        "maya@ledgerly.sg",
        [
          { day: "D1", status: "Sent", at: "08:30 AM" },
          { day: "D3", status: "Sent", at: "08:35 AM" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "",
        { industry: "Finance", location: "Singapore", interests: ["Fintech"] },
      ),
      p(
        "p-61",
        "Noah Kim",
        "noah@payframe.io",
        [
          { day: "D1", status: "Sent", at: "08:31 AM" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Follow up after Diwali",
      ),
    ],
  },
  {
    id: "evt-07",
    name: "Product Design Meetup",
    participantCount: 22,
    status: "Completed",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-70",
        "Priya Shah",
        "priya@apibridge.dev",
        [
          { day: "D1", status: "Sent", at: "2:00 PM" },
          { day: "D3", status: "Sent", at: "2:05 PM" },
          { day: "D5", status: "Sent", at: "2:10 PM" },
          { day: "D7", status: "Sent", at: "2:15 PM" },
        ],
        "Spoke on stage",
        { industry: "Design", interests: ["Design systems", "Speaker slots"] },
      ),
    ],
  },
  {
    id: "evt-08",
    name: "Enterprise CX Forum",
    participantCount: 39,
    status: "Active",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-80",
        "Ravi Mehta",
        "ravi@careloop.com",
        [
          { day: "D1", status: "Sent", at: "4:00 PM" },
          { day: "D3", status: "Scheduled", at: "Tomorrow" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "",
      ),
      p(
        "p-81",
        "Sara Blum",
        "sara@npslab.com",
        [
          { day: "D1", status: "Sent", at: "4:05 PM" },
          { day: "D3", status: "Sent", at: "4:10 PM" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Intro to VP next month",
      ),
    ],
  },
  {
    id: "evt-09",
    name: "Climate Tech Showcase",
    participantCount: 31,
    status: "Scheduled",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-90",
        "Tom Berg",
        "tom@greenwatt.nl",
        [
          { day: "D1", status: "Pending" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "",
        { industry: "Climate", interests: ["Climate tech"] },
      ),
    ],
  },
  {
    id: "evt-10",
    name: "Women in Product Mixer",
    participantCount: 44,
    status: "Active",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-100",
        "Wendy Park",
        "wendy@roadmap.ca",
        [
          { day: "D1", status: "Sent", at: "7:00 PM" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Met at booth",
        { location: "Toronto, CA", interests: ["Networking", "Product demos"] },
      ),
    ],
  },
  {
    id: "evt-11",
    name: "Security Leaders Briefing",
    participantCount: 27,
    status: "Draft",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-110",
        "Yuki Sato",
        "yuki@shieldops.jp",
        [
          { day: "D1", status: "Pending" },
          { day: "D3", status: "Pending" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "Compliance hold",
        {
          industry: "Security",
          location: "Tokyo, JP",
          interests: ["Security"],
        },
      ),
    ],
  },
  {
    id: "evt-12",
    name: "SaaS Growth Dinner",
    participantCount: 33,
    status: "Active",
    campaign: "Event Outreach",
    sequenceLabel: "Event Sequence (D1, D3, D7)",
    participants: [
      p(
        "p-120",
        "Zane Cooper",
        "zane@vaultedge.com",
        [
          { day: "D1", status: "Sent", at: "6:00 PM" },
          { day: "D3", status: "Scheduled", at: "Tomorrow" },
          { day: "D5", status: "Pending" },
          { day: "D7", status: "Pending" },
        ],
        "",
        { industry: "SaaS", interests: ["Product demos", "Networking"] },
      ),
    ],
  },
];

export const DEFAULT_CAMPAIGNS: MarketingCampaign[] = [
  {
    id: "camp-01",
    name: "Tech Summit Welcome Wave",
    eventId: "evt-01",
    eventName: "Technology Summit 2026",
    status: "Active",
    audienceLabel: "All participants",
    createdAt: "2026-11-10",
  },
  {
    id: "camp-02",
    name: "AI Conf Demo Nurture",
    eventId: "evt-02",
    eventName: "AI Innovation Conference",
    status: "Scheduled",
    audienceLabel: "High engagement",
    scheduledFor: "Nov 18, 9:00 AM",
    createdAt: "2026-11-14",
  },
  {
    id: "camp-03",
    name: "Fintech Leaders Follow-up",
    eventId: "evt-06",
    eventName: "Fintech Leaders Forum",
    status: "Draft",
    audienceLabel: "Finance · Singapore",
    createdAt: "2026-11-15",
  },
];

export const DEFAULT_AUTOMATIONS: AutomationRule[] = [
  {
    id: "auto-01",
    name: "Welcome on registration",
    trigger: "registration",
    triggerLabel: "When someone registers",
    action: "Send Day 1 Welcome email",
    enabled: true,
  },
  {
    id: "auto-02",
    name: "Nudge inactive opens",
    trigger: "inactivity",
    triggerLabel: "No open after 48 hours",
    action: "Send reminder with new subject",
    enabled: true,
  },
  {
    id: "auto-03",
    name: "Click → sales alert",
    trigger: "email_click",
    triggerLabel: "Clicks CTA in any email",
    action: "Tag as Warm lead + notify owner",
    enabled: true,
  },
  {
    id: "auto-04",
    name: "Reply → personal follow-up",
    trigger: "reply",
    triggerLabel: "Participant replies",
    action: "Pause drip + create follow-up task",
    enabled: false,
  },
  {
    id: "auto-05",
    name: "Event-day reminder",
    trigger: "event_date",
    triggerLabel: "1 day before event",
    action: "Send Day 5 Reminder email",
    enabled: true,
  },
];
