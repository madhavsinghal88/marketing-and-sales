# Salesforce integration: demo walkthrough

A 6 to 8 minute click-through for showing the two-way Salesforce sync. It runs entirely in
**demo mode** (no Salesforce account needed). Every step also works against a real org; the
differences are called out at the end.

## Before you start

1. Dev server running (`npm run dev`), open http://localhost:3000.
2. Sidebar → **Integrations** → on the Salesforce card click **or try demo mode** (the main
   **Connect Salesforce** button goes to the real Salesforce login). The header then shows
   **Salesforce Connected (demo)**.
3. Scroll to the dashed blue **Demo: act as a Salesforce rep** card and click **Reset demo data**
   so you start clean.

## The story to tell

> "Marketing runs the event and scores the leads here. Sales works the deals in Salesforce.
> Until now those were two islands. Now they stay in step in both directions, and nobody's work
> is overwritten."

## Walkthrough

### 1. Link people (30 s) — Integrations → Owner mapping
- Click **Auto-match by name**. All four EventMail owners get linked to the same-named Salesforce
  users (badge shows **4/4 linked**).
- *Say:* records will be assigned to the right rep in Salesforce, and reassignments there come
  back here.

### 2. Push everything out (45 s) — **↑ Sync everything**
- Confirm the dialog. Tiles fill up: 25 leads, 4 opportunities, 22 tasks, 12 campaigns.
- Open **Leads & Scoring**: every row shows **✓ Synced (demo)**. In a live org there is also an
  **Open ↗** link that jumps to the record in Salesforce.
- *Say:* leads become Salesforce Leads, deals become Opportunities (with an Account), follow-ups
  become Tasks, events become Campaigns. Re-syncing never duplicates.

### 3. Health check (20 s) — Integrations → Org health check → **Run check**
- Green list: login, create/edit Leads, Opportunities, Tasks, Campaigns, users available.
- *Say:* in a real org this reads permissions and tells you the exact fix (e.g. "tick Marketing
  User") before anything fails.

### 4. A rep changes something in Salesforce (1.5 min) — "Demo: act as a Salesforce rep"
1. Action: **Change a lead's status**, record: **Sarah Johnson**, new value
   **Working - Contacted**, click **Apply and pull now**.
2. Toast: *"Pulled from Salesforce … 1 change brought into EventMail"*.
3. **Leads & Scoring** → Sarah is now **Contacted** with a blue **↓ From Salesforce** chip, and
   still **✓ Synced** (not "Changed").
4. Integrations → **Sync log** shows `↓ Lead · Sarah Johnson · Stage: New → Contacted (changed in
   Salesforce lead)`.
- *Say:* the rep never opened EventMail. The pipeline here is already correct.

More one-liners to try with the same card:
| Rep action | Result in EventMail |
|---|---|
| Move an opportunity to **Negotiation/Review** | the lead and its deal move to Negotiation |
| Move an opportunity to **Closed Won** | lead and deal become Won |
| Lead status **Closed - Converted** | lead becomes Won |
| **Complete** a task | the follow-up becomes Done |
| **Reassign** a lead to Priya Nair | owner becomes Priya Nair |
| Reassign to **Sam Carter** (not mapped) | owner unchanged, log explains why |
| **Delete** a lead in Salesforce | row becomes "Not synced", sync again recreates it |

### 5. Both sides changed: conflict handling (2 min)
1. **Sales Pipeline** → on Sarah's card, **Move to → Proposal** (EventMail change).
2. Integrations → demo card: lead status → **Closed - Not Converted**, **Apply and pull now**
   (Salesforce change).
3. A yellow card appears: **1 conflict needs your decision**: *EventMail: Proposal ↔
   Salesforce: Lost.* Leads shows a **⚠ Conflict** badge. Nothing was overwritten.
4. Click **Use Salesforce** (or **Keep EventMail**). The conflict clears, the value is applied.
- *Say:* the policy is a setting: **Salesforce wins**, **EventMail wins**, or **Ask me** (what you
  just saw). EventMail never overwrites a rep's work in Salesforce.

### 6. Rep edits survive a re-sync (45 s)
- In the demo card choose **Move an opportunity to another stage**, pick a deal, a new stage, and
  click **Apply in Salesforce** (not "and pull"). Then click **↑ Sync everything**.
- The deal's Salesforce stage is **not** overwritten by the push. Now click **↓ Pull from
  Salesforce** and the rep's stage arrives in EventMail. This is the safety net: a push never
  undoes a rep's work.

### 7. Reliability (1 min)
- **Reload the browser**: pulled stages are still there, rows still **✓ Synced**.
- **Restart the server** (`Ctrl+C`, `npm run dev`): the connection and owner links stay. Tokens
  are stored encrypted in `.data/` (git-ignored), so no re-login.
- **Automatic pull**: set it to every minute and show it picking up a change by itself.
- **Sync log**: filter **↓ Pulled / ↑ Pushed / Problems**, **Export** the log, **Retry N failed**
  if anything failed. Rate limits, record locks and timeouts are retried automatically and the
  toast says so.

## Real org differences
- **Connect Salesforce** uses OAuth; log in with your Developer Edition username.
- No "act as a rep" card: make the change in Salesforce itself, then **↓ Pull from Salesforce**.
- **Org health check** runs against the real org and lists any permission to fix.
- Campaigns need the **Marketing User** checkbox on the connected user.
- **Open ↗** links open the real record.

## What can be done now (feature list)
**EventMail → Salesforce:** leads (by email), opportunities + accounts, tasks, campaigns + members, owner assignment, no duplicates, rep edits protected.
**Salesforce → EventMail:** lead status → stage, opportunity stage → stage (opportunity wins), converted → Won, owner → owner, task completion → follow-up status, deletions detected.
**Control:** manual or automatic pull, three conflict policies, conflict resolution list, owner mapping with auto-match.
**Operations:** persistent encrypted sessions, automatic retry with backoff, dead-session detection, plain-English errors, retry failed, exportable log, org health check, demo reset.

## Run the tests
`npm test` (50 automated tests against an in-memory mock Salesforce).
