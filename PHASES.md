# EventMail — Marketing & Sales Automation CRM

Evolve the current Event Email Automation dashboard into a **Marketing & Sales Automation CRM**: Event Management + Email Marketing Automation + Lightweight CRM.

**Product direction:** Useful for both marketing teams and sales teams — not just an email sender.

**UI reference:** Marketing & Sales Hub mockup (dark sidebar, stats bar, events list, participant workspace, campaign performance, sales pipeline, automations, integrations).

---

## Already built (foundation)

| Area | Status |
|------|--------|
| Board shell + mock data | ✅ |
| Global template editor | ✅ |
| Outlook connect + Send now | ✅ |
| Scheduled drip | ✅ Phase 1 |
| Marketing analytics / segments / automation | ✅ Phase 2 |
| Lead scoring / pipeline / follow-ups / deals | ✅ Phase 3 |
| Persistence + polish | ⬜ Later |

---

## Recommended development priority

| Phase | Features |
|-------|----------|
| **Phase 1** | Events, participants, Outlook, templates, scheduled emails |
| **Phase 2** | Campaign analytics, segmentation, automation workflows |
| **Phase 3** | Lead scoring, CRM, sales pipeline, follow-ups |
| **Phase 4** | A/B testing, landing pages, ROI reporting, AI assistance |

---

## Phase 1 — Events, Outlook, templates, scheduled emails

**Goal:** Solid event-email core so operators can manage events, connect Outlook, edit templates, and schedule drip sends.

- [x] Events list + participant workspace
- [x] Global / sequence templates with merge fields
- [x] Outlook OAuth + Send now (Graph / demo mode)
- [x] Schedule UI: pick date(s) + audience (event / people)
- [x] Drip job store (localStorage → later server/cron)
- [x] Auto-send on due dates when Outlook is connected (30s poller while app open)
- [x] Board cells show pending vs scheduled vs sent vs failed

**Done when:** Scheduled drips fire on chosen dates and update the board. ✅

**How to use**
1. Connect Outlook (demo or live).
2. Select participants (or use Entire event) → **Schedule Campaign**.
3. Pick due times per D1/D3/D5/D7 → confirm.
4. Cells show **Scheduled** with the due label; when due, jobs auto-send and flip to **Sent** / **Failed**.

---

## Phase 2 — Marketing: analytics, segmentation, automation

**Goal:** Turn sends into measurable campaigns with targeted audiences and trigger-based workflows.

### 1. Email Campaign Builder — High priority
- [x] Create campaigns
- [x] Customize templates (global template panel)
- [x] Schedule bulk emails (Schedule Campaign / sequence)
- [ ] Manage promotional newsletters *(deeper editor later)*

### 2. Audience Segmentation
- [x] Filter participants by event, industry, company, job title, location, interests, engagement

### 3. Campaign Analytics
- [x] Track delivery, open rates, clicks, replies, unsubscribes, conversions
- [x] Campaign performance widgets (sent / opened / clicked / replied)

### 4. Advanced Automation
- [x] Trigger rules UI (registration, inactivity, email clicks, replies, event dates)
- [x] Visual automation timeline (Day 1 Welcome → Day 3 Info → Day 5 Reminder → Day 7 Follow-up)

### 5. A/B Testing *(slips to Phase 4)*
- [ ] Test subject lines, email content, and CTAs

**Done when:** Marketers can segment an audience, run/automate a campaign, and see open/click/reply metrics. ✅

**How to use**
1. Sidebar → **Audience & Segments** to filter the full audience.
2. Sidebar → **Email Campaigns** to create drafts and jump into scheduling.
3. Sidebar → **Automation** to toggle trigger rules + view sequence timeline.
4. Sidebar → **Campaign Analytics** for opens/clicks/replies across events.
5. Dashboard right rail shows live performance + automations for the selected event.

---

## Phase 3 — Sales CRM: scoring, pipeline, follow-ups, deals

**Goal:** Lightweight CRM so sales can work event leads end-to-end.

### 6. Sales Pipeline — High priority
- [x] Stages: New → Contacted → Qualified → Proposal → Negotiation → Won/Lost
- [x] Pipeline summary (total leads → qualified → in pipeline → closed)

### 7. Lead Scoring
- [x] Scores from email engagement, event participation, replies, and interest
- [x] Lead status tags (Hot / Warm / Cold, etc.)

### 8. Follow-up Manager
- [x] Assign leads to employees
- [x] Follow-up reminders
- [x] Call / email history

### 9. Deal & Revenue Tracking
- [x] Deal value, expected revenue, conversion probability, closed deals

**Done when:** Sales can score leads, move them through a pipeline, schedule follow-ups, and track deal value. ✅

**How to use**
1. Sidebar → **Leads & Scoring** to filter Hot/Warm/Cold and assign owners.
2. Sidebar → **Sales Pipeline** to move leads across stages.
3. Sidebar → **Follow-ups** for reminders + activity history.
4. Sidebar → **Deals & Opportunities** for value / probability / expected revenue.
5. Sidebar → **Sales Reports** for win rate and owner/event breakdowns.

---

## Phase 4 — Growth: A/B, landing pages, ROI, AI

**Goal:** Optimization surfaces and an AI Marketing Assistant.

- [ ] A/B testing (subject, content, CTAs) — if not finished in Phase 2
- [ ] Landing pages
- [ ] Forms
- [ ] ROI & conversion reporting
- [ ] **AI Marketing Assistant**
  - [ ] Generate marketing emails per event
  - [ ] Suggest subject lines
  - [ ] Identify participants who have not engaged
  - [ ] Recommend the next follow-up
  - [ ] Summarize campaign performance
  - [ ] Identify high-potential sales leads

**Done when:** Teams can optimize campaigns, publish simple landing/forms flows, see ROI, and use AI assists in daily workflows.

---

## Left sidebar information architecture

```
EventMail – Marketing & Sales

OVERVIEW
  Dashboard
  Events
  Participants

MARKETING
  Email Campaigns
  Audience & Segments
  Templates
  Automation
  Landing Pages
  Forms

SALES
  Leads & Scoring
  Sales Pipeline
  Follow-ups
  Deals & Opportunities

ANALYTICS
  Campaign Analytics
  Sales Reports
  ROI & Conversions

SYSTEM
  Integrations
  Settings
```

---

## Integrations to support

| Integration | Purpose |
|-------------|---------|
| Microsoft Outlook | Email sending and tracking |
| HubSpot | CRM and sales pipeline |
| Salesforce | Enterprise CRM |
| Zoho CRM | Lead and deal management |
| Calendly | Meeting scheduling |
| Microsoft Teams | Meeting and team communication |
| Heroku | Cloud app deploy and hosting |

---

## Dashboard visual concept (target)

Combine the existing EventMail board with marketing + sales surfaces:

- **Stats bar:** Total Events, Total Participants, Emails Sent, Opens, Clicks, Sales Leads
- **Events list** + **participant workspace** (sequence days, template, lead status, comments)
- **Campaign Performance** (open rate donut + sent/opened/clicked/replied)
- **Sales Pipeline** (leads → qualified → pipeline → closed)
- **Automations** timeline for the active sequence
- **Integrations** strip (Outlook, Salesforce, HubSpot, Zoho, + More)
- **Marketing & Sales feature cards** (campaigns, segmentation, lead scoring, CRM sync, landing pages, forms, A/B testing, analytics)

---

## Locked product decisions (current)

| Topic | Decision |
|-------|----------|
| Product shape | Event Management + Email Marketing Automation + Lightweight CRM |
| Send columns | Sequence days D1 / D3 / D5 / D7 (calendar scheduling in Phase 1) |
| Template | Global + campaign/sequence templates over time |
| Sending | Manual Send now + scheduled drip + trigger automation |
| Comments | Free text + status / lead tags |
| Primary mailbox | Outlook (Microsoft Graph) |
| Sales stages | New → Contacted → Qualified → Proposal → Negotiation → Won/Lost |

### Starter status / lead tags

`Pending` · `Sent` · `Replied` · `Hot` · `Warm` · `Cold` · `Do not contact`
