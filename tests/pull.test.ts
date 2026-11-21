import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, dealLead, type World } from "./world";
import { leadHash } from "../src/lib/salesforce/payloads";
import { recordKey } from "../src/lib/salesforce/syncStore";

const P02 = "lead-evt-01-p-02"; // New, owned by Madhav Singhal
const P03 = "lead-evt-01-p-03"; // Qualified, has a deal
const P04 = "lead-evt-01-p-04";

const leadOf = (w: World, id: string) => w.leads.find((l) => l.id === id)!;
const sfLead = (w: World, id: string) => w.sfRecord("lead", id)!;
const sfDeal = (w: World, leadId: string) => w.sfRecord("deal", `deal-${leadId}`)!;
const sfTask = (w: World, taskId: string) => w.sfRecord("task", taskId)!;

async function synced(opts?: Parameters<typeof createWorld>[0]) {
  const w = createWorld(opts);
  await w.pushAll();
  return w;
}

/* ——— baseline: nothing changed ——— */

test("a pull right after a push reports no changes (the push is not mistaken for a rep's edit)", async () => {
  const w = await synced();
  const out = await w.pull();
  assert.deepEqual(out.changes, []);
  assert.equal(out.leadPatches.length + out.followUpPatches.length, 0);
  assert.ok(out.counts.checked > 0);
});

test("pulling twice is a no-op", async () => {
  const w = await synced();
  sfLead(w, P02).Status = "Qualified";
  await w.pull();
  const second = await w.pull();
  assert.deepEqual(second.changes, []);
});

/* ——— Salesforce -> EventMail ——— */

test("a rep changing the lead status in Salesforce moves the EventMail stage", async () => {
  const w = await synced();
  assert.equal(leadOf(w, P02).stage, "New");
  w.sf.edit("Lead", sfLead(w, P02).Id, { Status: "Qualified" });

  const out = await w.pull();

  assert.equal(leadOf(w, P02).stage, "Qualified");
  assert.match(leadOf(w, P02).lastActivity, /Salesforce/);
  assert.equal(out.counts.applied, 1);
  assert.equal(out.changes[0].tone, "applied");
  // The record is not shown as "Changed" just because Salesforce changed it.
  assert.equal(w.record("lead", P02).hash, leadHash(leadOf(w, P02)));
  assert.equal(w.record("lead", P02).base?.stage, "Qualified");
  assert.ok(w.record("lead", P02).pulledAt);
});

test("an Opportunity moved in Salesforce moves the lead, and its deal follows", async () => {
  const w = await synced();
  const lead = dealLead(w);
  assert.equal(lead.id, P03);
  w.sf.edit("Opportunity", sfDeal(w, P03).Id, { StageName: "Negotiation/Review" });

  await w.pull();

  assert.equal(leadOf(w, P03).stage, "Negotiation");
  assert.equal(w.deals.find((d) => d.leadId === P03)?.stage, "Negotiation");
});

test("closing the Opportunity as Won in Salesforce marks the lead Won", async () => {
  const w = await synced();
  w.sf.edit("Opportunity", sfDeal(w, P03).Id, { StageName: "Closed Won" });
  await w.pull();
  assert.equal(leadOf(w, P03).stage, "Won");
  assert.equal(w.deals.find((d) => d.leadId === P03)?.stage, "Won");
});

test("when both the lead status and the opportunity moved, the opportunity wins", async () => {
  const w = await synced();
  w.sf.edit("Lead", sfLead(w, P03).Id, { Status: "Working - Contacted" });
  w.sf.edit("Opportunity", sfDeal(w, P03).Id, { StageName: "Closed Lost" });
  await w.pull();
  assert.equal(leadOf(w, P03).stage, "Lost");
});

test("converting a lead in Salesforce marks it Won", async () => {
  const w = await synced();
  w.sf.edit("Lead", sfLead(w, P02).Id, { Status: "Closed - Converted", IsConverted: true });
  await w.pull();
  assert.equal(leadOf(w, P02).stage, "Won");
});

test("a status EventMail itself wrote is not treated as a downgrade (Proposal stays Proposal)", async () => {
  const w = createWorld();
  w.setStage(P02, "Proposal");
  await w.pushAll(); // Salesforce shows "Working - Contacted" for a Proposal
  assert.equal(sfLead(w, P02).Status, "Working - Contacted");
  // A rep re-saves the same status (modified date changes, value does not)
  w.sf.edit("Lead", sfLead(w, P02).Id, { Status: "Working - Contacted" });
  const out = await w.pull();
  assert.equal(leadOf(w, P02).stage, "Proposal");
  assert.deepEqual(out.changes, []);
});

test("an unknown custom Lead.Status is ignored instead of guessed", async () => {
  const w = await synced();
  w.sf.edit("Lead", sfLead(w, P02).Id, { Status: "Nurture - Q3 Webinar" });
  const out = await w.pull();
  assert.equal(leadOf(w, P02).stage, "New");
  assert.equal(out.counts.applied, 0);
});

test("a task completed in Salesforce marks the follow-up Done; reopening reopens it", async () => {
  const w = await synced();
  const id = `fu-${P02}`;
  assert.equal(w.followUps.find((t) => t.id === id)?.status, "Open");
  w.sf.edit("Task", sfTask(w, id).Id, { Status: "Completed" });

  await w.pull();
  let fu = w.followUps.find((t) => t.id === id)!;
  assert.equal(fu.status, "Done");
  assert.equal(fu.dueLabel, "Completed");
  assert.equal(w.record("task", id).hash, w.record("task", id).hash);

  w.sf.edit("Task", sfTask(w, id).Id, { Status: "In Progress", ActivityDate: "2000-01-01" });
  await w.pull();
  fu = w.followUps.find((t) => t.id === id)!;
  assert.equal(fu.status, "Overdue");
});

test("a lead or task that no longer exists in Salesforce is dropped from the synced list", async () => {
  const w = await synced();
  const sfId = w.record("lead", P04).sfId!;
  w.sf.remove("Lead", sfId);

  const out = await w.pull();

  assert.equal(out.counts.removed, 1);
  assert.equal(out.changes.find((c) => c.tone === "removed")?.kind, "lead");
  assert.equal(w.records[recordKey("lead", P04)], undefined);
  // Syncing it again recreates it.
  await w.pushLeads([leadOf(w, P04)]);
  assert.ok(w.record("lead", P04).sfId);
  assert.notEqual(w.record("lead", P04).sfId, sfId);
});

/* ——— conflicts ——— */

async function conflictWorld(policy: "ask" | "salesforce" | "eventmail") {
  const w = await synced();
  w.policy = policy;
  w.setStage(P02, "Proposal"); // EventMail: New -> Proposal
  w.sf.edit("Lead", sfLead(w, P02).Id, { Status: "Qualified" }); // Salesforce: -> Qualified
  return w;
}

test("conflict policy 'ask' holds the change for a decision and touches nothing", async () => {
  const w = await conflictWorld("ask");
  const out = await w.pull();

  assert.equal(out.counts.conflicts, 1);
  assert.equal(w.conflicts.length, 1);
  assert.deepEqual(
    { local: w.conflicts[0].local, remote: w.conflicts[0].remote, field: w.conflicts[0].field, source: w.conflicts[0].source },
    { local: "Proposal", remote: "Qualified", field: "stage", source: "Lead" },
  );
  assert.equal(leadOf(w, P02).stage, "Proposal");
  // pulling again does not duplicate the conflict
  await w.pull();
  assert.equal(w.conflicts.length, 1);
});

test("resolving a conflict with 'Use Salesforce' applies it and clears the conflict", async () => {
  const w = await conflictWorld("ask");
  await w.pull();
  w.resolve(w.conflicts[0].id, "salesforce");
  assert.equal(leadOf(w, P02).stage, "Qualified");
  assert.equal(w.conflicts.length, 0);
  assert.deepEqual((await w.pull()).changes, []);
});

test("resolving a conflict with 'Keep EventMail' keeps the value and does not re-raise it", async () => {
  const w = await conflictWorld("ask");
  await w.pull();
  w.resolve(w.conflicts[0].id, "eventmail");
  assert.equal(leadOf(w, P02).stage, "Proposal");
  assert.equal(w.conflicts.length, 0);
  assert.deepEqual((await w.pull()).changes, []);
  // and Salesforce was not overwritten
  assert.equal(sfLead(w, P02).Status, "Qualified");
});

test("conflict policy 'salesforce' applies the Salesforce value", async () => {
  const w = await conflictWorld("salesforce");
  const out = await w.pull();
  assert.equal(leadOf(w, P02).stage, "Qualified");
  assert.equal(w.conflicts.length, 0);
  assert.match(out.changes[0].message, /Salesforce won/);
});

test("conflict policy 'eventmail' keeps the EventMail value and never overwrites Salesforce", async () => {
  const w = await conflictWorld("eventmail");
  const out = await w.pull();
  assert.equal(leadOf(w, P02).stage, "Proposal");
  assert.equal(out.counts.kept, 1);
  assert.equal(out.changes[0].tone, "kept");
  assert.equal(sfLead(w, P02).Status, "Qualified");
  assert.deepEqual((await w.pull()).changes, []);
});

test("while a conflict is open, pushing never overwrites the Salesforce stage", async () => {
  const w = createWorld();
  w.setStage(P02, "Qualified");
  await w.pushAll(); // creates the opportunity at Needs Analysis
  const deal = w.deals.find((d) => d.leadId === P02)!;
  assert.ok(deal);
  assert.equal(sfDeal(w, P02).StageName, "Needs Analysis");

  w.setStage(P02, "Proposal"); // EventMail moves it on
  w.sf.edit("Opportunity", sfDeal(w, P02).Id, { StageName: "Negotiation/Review" }); // rep moved it too
  await w.pull();
  assert.equal(w.conflicts.length, 1);

  await w.pushDeals();
  assert.equal(sfDeal(w, P02).StageName, "Negotiation/Review", "the rep's stage must survive a push");
});

/* ——— pushes must not trample a rep's work ——— */

test("re-syncing does not overwrite an Opportunity stage a rep set, and the pull still sees it", async () => {
  const w = await synced();
  w.sf.edit("Opportunity", sfDeal(w, P03).Id, { StageName: "Negotiation/Review" });

  await w.pushDeals(); // user clicked Re-sync before pulling
  assert.equal(sfDeal(w, P03).StageName, "Negotiation/Review");

  await w.pull();
  assert.equal(leadOf(w, P03).stage, "Negotiation");
});

test("a stage changed in EventMail AND by a rep: the push leaves Salesforce alone, the pull raises a conflict", async () => {
  const w = await synced();
  w.setStage(P03, "Proposal");
  w.sf.edit("Opportunity", sfDeal(w, P03).Id, { StageName: "Negotiation/Review" });

  const stats = await w.pushDeals();
  assert.equal(stats.held, 1);
  assert.equal(sfDeal(w, P03).StageName, "Negotiation/Review");

  await w.pull();
  assert.equal(w.conflicts.length, 1);
  assert.equal(w.conflicts[0].source, "Opportunity");
});

test("a stage changed only in EventMail is written to Salesforce", async () => {
  const w = await synced();
  w.setStage(P03, "Proposal");
  await w.pushDeals();
  assert.equal(sfDeal(w, P03).StageName, "Proposal/Price Quote");
  assert.deepEqual((await w.pull()).changes, []);
});

test("re-syncing does not reopen a task a rep completed", async () => {
  const w = await synced();
  const id = `fu-${P02}`;
  w.sf.edit("Task", sfTask(w, id).Id, { Status: "Completed" });
  await w.pushTasks();
  assert.equal(sfTask(w, id).Status, "Completed");
  await w.pull();
  assert.equal(w.followUps.find((t) => t.id === id)?.status, "Done");
});

test("completing a follow-up in EventMail completes the Salesforce task", async () => {
  const w = await synced();
  const id = `fu-${P02}`;
  w.setFollowUp(id, { status: "Done", dueLabel: "Completed" });
  await w.pushTasks();
  assert.equal(sfTask(w, id).Status, "Completed");
  assert.deepEqual((await w.pull()).changes, []);
});

/* ——— owners ——— */

test("a new lead is created owned by the mapped Salesforce user", async () => {
  const w = createWorld();
  w.linkOwners(["Madhav Singhal", "Alex Rivera", "Jordan Lee", "Priya Nair"]);
  await w.pushLeads();
  assert.equal(sfLead(w, P02).OwnerId, w.ownerMap["Madhav Singhal"].sfUserId);
  assert.equal(sfLead(w, "lead-evt-01-p-01").OwnerId, w.ownerMap["Alex Rivera"].sfUserId);
});

test("an owner reassigned in Salesforce comes back to EventMail", async () => {
  const w = createWorld();
  w.linkOwners(["Madhav Singhal", "Alex Rivera", "Jordan Lee", "Priya Nair"]);
  await w.pushAll();
  w.sf.edit("Lead", sfLead(w, P02).Id, { OwnerId: w.ownerMap["Priya Nair"].sfUserId });

  await w.pull();
  assert.equal(leadOf(w, P02).owner, "Priya Nair");
  assert.deepEqual((await w.pull()).changes, []);
});

test("an owner who is not mapped produces a notice and leaves EventMail unchanged", async () => {
  const w = createWorld();
  w.linkOwners(["Madhav Singhal"]);
  await w.pushLeads();
  const stranger = w.sf.addUser("Pat Stranger", "pat@example.com");
  w.sf.edit("Lead", sfLead(w, P02).Id, { OwnerId: stranger });

  const out = await w.pull();
  assert.equal(leadOf(w, P02).owner, "Madhav Singhal");
  assert.equal(out.counts.notices, 1);
  assert.match(out.changes[0].message, /Pat Stranger/);
  assert.deepEqual((await w.pull()).changes, [], "the notice is shown once, not on every pull");
});

test("assigning a lead in EventMail assigns it in Salesforce", async () => {
  const w = createWorld();
  w.linkOwners(["Madhav Singhal", "Alex Rivera", "Jordan Lee", "Priya Nair"]);
  await w.pushAll();
  w.setOwner(P02, "Jordan Lee");
  await w.pushLeads([leadOf(w, P02)]);
  assert.equal(sfLead(w, P02).OwnerId, w.ownerMap["Jordan Lee"].sfUserId);
});

test("an EventMail reassignment does not overwrite an owner a rep set in Salesforce", async () => {
  const w = createWorld();
  w.linkOwners(["Madhav Singhal", "Alex Rivera", "Jordan Lee", "Priya Nair"]);
  await w.pushAll();
  w.sf.edit("Lead", sfLead(w, P02).Id, { OwnerId: w.ownerMap["Priya Nair"].sfUserId });
  w.setOwner(P02, "Jordan Lee");

  const stats = await w.pushLeads([leadOf(w, P02)]);
  assert.equal(stats.held, 1);
  assert.equal(sfLead(w, P02).OwnerId, w.ownerMap["Priya Nair"].sfUserId);
  await w.pull();
  assert.equal(w.conflicts.some((c) => c.field === "owner"), true);
});

test("records still owned by the integration user are handed to the mapped owner once owners are linked", async () => {
  const w = createWorld();
  await w.pushAll(); // no owner mapping yet: everything belongs to the integration user
  assert.equal(sfLead(w, P02).OwnerId, w.sf.apiUser);
  w.linkOwners(["Madhav Singhal", "Alex Rivera", "Jordan Lee", "Priya Nair"]);

  await w.pushLeads();
  assert.equal(sfLead(w, P02).OwnerId, w.ownerMap["Madhav Singhal"].sfUserId);
});

test("an inactive or invalid mapped owner fails that record with a clear message and no other", async () => {
  const w = createWorld();
  w.ownerMap["Madhav Singhal"] = { sfUserId: "005000000009999", sfName: "Ghost" };
  const stats = await w.pushLeads([leadOf(w, P02), leadOf(w, P03)]);
  assert.equal(stats.failed, 1);
  assert.match(stats.firstError ?? "", /owner/i);
  assert.ok(w.record("lead", P03).sfId);
});

/* ——— legacy records (synced before two-way sync existed) ——— */

test("records without a baseline are adopted on the first pull instead of misreported", async () => {
  const w = await synced();
  for (const [k, r] of Object.entries(w.records)) w.records[k] = { ...r, base: undefined, remote: undefined };
  const out = await w.pull();
  assert.deepEqual(out.changes, []);
  assert.ok(w.record("lead", P02).remote, "baseline recorded");
  // ...and a later change is detected
  w.sf.edit("Lead", sfLead(w, P02).Id, { Status: "Qualified" });
  await w.pull();
  assert.equal(leadOf(w, P02).stage, "Qualified");
});
