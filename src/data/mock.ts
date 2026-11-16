import type { AppStats, EmailTemplate, EventItem } from "@/lib/types";

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
  pendingEmails: 86,
};

function p(
  id: string,
  name: string,
  email: string,
  touches: EventItem["participants"][number]["touches"],
  comment: string,
): EventItem["participants"][number] {
  return {
    id,
    name,
    email,
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
      ),
    ],
  },
];
