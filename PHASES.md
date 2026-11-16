# Marketing Outreach — Phase Plan

High-level product: EventMail dashboard — left events list, right participants table with sequence days (D1/D3/D5/D7), global template, Outlook send, drip schedule, comments.

**UI reference:** Event Email Automation mockup (dark sidebar, stats bar, events list + participant workspace).

---

## Phase 1 — Board shell + mock data ✅

**Goal:** Usable UI that matches the product shape with local mock data (no Outlook yet).

- [x] Phase plan doc
- [x] Next.js + TypeScript + Tailwind scaffold
- [x] Types: Event, Participant, SendLog, Template, StatusTag
- [x] Mock dataset (~10–12 events with participants)
- [x] Left: expandable events + participants
- [x] Center: calendar-date columns with sent markers
- [x] Right: status tag + free-text comment per participant
- [x] Header: Connect Outlook (stub), Edit Template (stub), Schedule (stub), Send now (stub)
- [x] Local state updates for status / comments

**Done when:** You can expand events, see date cells, edit status/comments, and open stub panels.

**Run locally:** `npm run dev` → http://localhost:3000

---

## Phase 2 — Global template editor ✅

**Goal:** One shared subject/body used for every send.

- [x] Template editor modal/drawer (subject + body)
- [x] Merge fields: `{{name}}`, `{{email}}`, `{{event}}`
- [x] Live preview with a selected participant
- [x] Persist template in local storage (until backend)

**Done when:** Template edits apply to all future send previews.

**Open via:** Manage Templates · Email Templates in sidebar

---

## Phase 3 — Outlook connect + Send now ✅ *(just completed)*

**Goal:** Real mail from a connected Outlook mailbox for selected people.

- [x] Microsoft OAuth (Outlook / Graph) connect flow
- [x] Show connected mailbox in header
- [x] Multi-select participants / select whole event
- [x] Send now → Graph sendMail with global template
- [x] Mark matching sequence-day cell as sent (store message id + timestamp)
- [x] Error / retry for failed sends

**Done when:** Selecting people and clicking Send now delivers mail and updates the board.

**How to use**
1. Click **Connect Outlook** (demo mode if `.env` credentials are empty).
2. Select participants → choose **Send day** → **Send now**.
3. For live Graph mail, copy `.env.example` → `.env.local` and set Azure app values.

**API**
- `GET /api/outlook/status`
- `GET /api/outlook/connect` · `GET /api/outlook/callback`
- `POST /api/outlook/demo` · `POST /api/outlook/disconnect`
- `POST /api/outlook/send`

---

## Phase 4 — Scheduled drip

**Goal:** Queue sends on specific calendar dates.

- [ ] Schedule UI: pick date(s) + audience (event / people)
- [ ] Drip job store (local → later server/cron)
- [ ] Auto-send on due dates when Outlook is connected
- [ ] Board cells show pending vs sent vs failed

**Done when:** A scheduled drip fires on the chosen dates and updates the board.

---

## Phase 5 — Persistence + polish

**Goal:** Durable data and production-ready UX.

- [ ] Backend / DB for events, participants, sends, comments, template, schedules
- [ ] CSV / import for events & participants (optional)
- [ ] Filters (by event, status, unsent)
- [ ] Empty states, loading, toast feedback
- [ ] Mobile-friendly board scroll
- [ ] Basic audit log (who sent what when)

**Done when:** Data survives refresh and the flow is ready for real operators.

---

## Locked product decisions

| Topic        | Decision                                      |
|--------------|-----------------------------------------------|
| Send columns | Sequence days D1 / D3 / D5 / D7 (calendar scheduling in Phase 4) |
| Template     | One global template                           |
| Sending      | Manual Send now + scheduled drip              |
| Comments     | Free text + status tags                       |
| Mailbox      | Outlook (Microsoft Graph)                     |

### Starter status tags

`Pending` · `Sent` · `Replied` · `Warm` · `Cold` · `Do not contact`
