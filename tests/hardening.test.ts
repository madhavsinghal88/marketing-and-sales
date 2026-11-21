import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMockSalesforce, json } from "./mockSalesforce";
import { createRest, SalesforceApiError, backoffMs } from "../src/lib/salesforce/rest";
import { friendlyError, syncLeads, loadSchema, clearSchemaCache } from "../src/lib/salesforce/sync";
import { runHealthCheck, listUsers } from "../src/lib/salesforce/remote";
import { autoMatchOwners, ownerForSfId } from "../src/lib/salesforce/ownerMap";
import { createSessionStore, decryptJson, encryptJson } from "../src/lib/secureStore";
import type { LeadPayload } from "../src/lib/salesforce/mapping";

const INSTANCE = "https://mock.my.salesforce.com";

function setup(extra: Partial<Parameters<typeof createRest>[0]> = {}) {
  const sf = createMockSalesforce();
  const slept: number[] = [];
  const rest = createRest({
    instanceUrl: INSTANCE,
    accessToken: sf.state.token,
    apiVersion: "v62.0",
    fetchImpl: sf.fetchImpl,
    sleep: async (ms) => void slept.push(ms),
    refresh: async () => sf.state.token,
    ...extra,
  });
  return { sf, rest, slept };
}

const lead = (n: number): LeadPayload => ({
  key: `k${n}`,
  name: `Test Person${n}`,
  email: `person${n}@example.com`,
  company: "Acme",
  jobTitle: "CTO",
  industry: "Tech",
  stage: "New",
  temperature: "Warm",
  score: 50,
  eventName: "Expo",
  lastActivity: "Registered",
  owner: "Madhav Singhal",
  notes: "",
});

/* ——— retries and rate limits ——— */

test("a rate-limited (429) request is retried after Retry-After and then succeeds", async () => {
  const { sf, rest, slept } = setup();
  sf.fail({ when: (m, p) => m === "GET" && p.includes("/query"), times: 2, respond: () => json(429, [{ errorCode: "REQUEST_LIMIT_EXCEEDED", message: "slow down" }], { "Retry-After": "2" }) });
  const rows = await rest.query("SELECT Id FROM Lead");
  assert.deepEqual(rows, []);
  assert.deepEqual(slept, [2000, 2000]);
  assert.equal(rest.stats.retries, 2);
});

test("a locked record (UNABLE_TO_LOCK_ROW) on a write is retried", async () => {
  const { sf, rest } = setup();
  sf.fail({ when: (m) => m === "POST", respond: () => json(400, [{ errorCode: "UNABLE_TO_LOCK_ROW", message: "locked" }]) });
  const id = await rest.create("Account", { Name: "Acme" });
  assert.ok(id.startsWith("001"));
  assert.equal(rest.stats.retries, 1);
  assert.equal(sf.tables.Account.length, 1, "created exactly once");
});

test("503 on a write is retried; it never creates a duplicate", async () => {
  const { sf, rest } = setup();
  sf.fail({ when: (m) => m === "POST", times: 2, respond: () => json(503, [{ errorCode: "SERVER_UNAVAILABLE", message: "down" }]) });
  await rest.create("Account", { Name: "Acme" });
  assert.equal(sf.tables.Account.length, 1);
  assert.equal(rest.stats.retries, 2);
});

test("retries stop after the limit and the real error surfaces", async () => {
  const { sf, rest } = setup({ maxRetries: 2 });
  sf.fail({ when: (m, p) => p.includes("/query"), times: 99, respond: () => json(503, [{ errorCode: "SERVER_UNAVAILABLE", message: "down" }]) });
  await assert.rejects(rest.query("SELECT Id FROM Lead"), (e: unknown) => {
    assert.ok(e instanceof SalesforceApiError);
    assert.equal(e.status, 503);
    assert.match(friendlyError(e), /busy|try again/i);
    return true;
  });
  assert.equal(rest.stats.requests, 3);
});

test("a network failure on a read is retried; on a write it is NOT (it could duplicate)", async () => {
  let calls = 0;
  const sf = createMockSalesforce();
  const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls <= 1) throw new TypeError("fetch failed");
    return sf.fetchImpl(input, init);
  }) as typeof fetch;
  const rest = createRest({ instanceUrl: INSTANCE, accessToken: sf.state.token, apiVersion: "v62.0", fetchImpl: flaky, sleep: async () => {} });
  await rest.query("SELECT Id FROM Lead"); // 1st call throws, retried
  assert.equal(calls, 2);

  calls = 0;
  const writes = createRest({ instanceUrl: INSTANCE, accessToken: sf.state.token, apiVersion: "v62.0", fetchImpl: flaky, sleep: async () => {} });
  await assert.rejects(writes.create("Account", { Name: "X" }), (e: unknown) => {
    assert.ok(e instanceof SalesforceApiError);
    assert.equal(e.code, "NETWORK_ERROR");
    return true;
  });
  assert.equal(calls, 1, "a failed write is not blindly repeated");
  assert.equal(sf.tables.Account.length, 0);
});

test("a request that never answers times out with a clear error", async () => {
  const hang = ((_: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as typeof fetch;
  const rest = createRest({ instanceUrl: INSTANCE, accessToken: "t", apiVersion: "v62.0", fetchImpl: hang, timeoutMs: 20, maxRetries: 0, sleep: async () => {} });
  await assert.rejects(rest.query("SELECT Id FROM Lead"), (e: unknown) => {
    assert.ok(e instanceof SalesforceApiError);
    assert.equal(e.code, "TIMEOUT");
    return true;
  });
});

test("an expired access token is refreshed once and the request succeeds", async () => {
  const sf = createMockSalesforce();
  sf.expireToken();
  const fresh = sf.state.token;
  sf.state.token = "rotated";
  let refreshes = 0;
  const rest = createRest({
    instanceUrl: INSTANCE,
    accessToken: fresh, // stale on purpose
    apiVersion: "v62.0",
    fetchImpl: sf.fetchImpl,
    sleep: async () => {},
    refresh: async () => {
      refreshes += 1;
      return sf.state.token;
    },
  });
  await rest.query("SELECT Id FROM Lead");
  assert.equal(refreshes, 1);
  assert.equal(rest.stats.retries, 0, "a token refresh is not counted as a retry");
});

test("a dead session (refresh impossible) is a clear 401, not a loop", async () => {
  const sf = createMockSalesforce();
  sf.expireToken();
  const rest = createRest({ instanceUrl: INSTANCE, accessToken: "stale", apiVersion: "v62.0", fetchImpl: sf.fetchImpl, sleep: async () => {}, refresh: async () => null });
  await assert.rejects(rest.query("SELECT Id FROM Lead"), (e: unknown) => e instanceof SalesforceApiError && e.status === 401);
  assert.equal(rest.stats.requests, 1);
});

test("backoff honours Retry-After and caps it", () => {
  assert.equal(backoffMs(0, "3"), 3000);
  assert.equal(backoffMs(0, "999"), 10_000);
  assert.ok(backoffMs(2, null) >= 1600 && backoffMs(2, null) < 1900);
});

test("one bad record in a batch fails alone; the rest sync, and retried writes do not duplicate leads", async () => {
  const { sf, rest } = setup();
  clearSchemaCache();
  sf.fail({ when: (m, p, b) => m === "POST" && p.endsWith("/Lead") && (b as { Email?: string })?.Email === "person2@example.com", times: 1, respond: () => json(400, [{ errorCode: "FIELD_CUSTOM_VALIDATION_EXCEPTION", message: "Company must be real" }]) });
  sf.fail({ when: (m, p) => m === "POST" && p.endsWith("/Lead"), times: 1, respond: () => json(503, [{ errorCode: "SERVER_UNAVAILABLE", message: "blip" }]) });
  const schema = await loadSchema(rest, "retry-test");
  const results = await syncLeads(rest, schema, [lead(1), lead(2), lead(3)]);
  const bad = results.filter((r) => !r.ok);
  assert.equal(bad.length, 1);
  assert.match(bad[0].error ?? "", /validation rule/i);
  assert.equal(sf.tables.Lead.length, 2);
  const emails = sf.tables.Lead.map((l) => l.Email);
  assert.equal(new Set(emails).size, emails.length, "no duplicates");
});

test("friendlyError explains the common Salesforce failures in plain words", () => {
  const e = (code: string, message = "m") => new SalesforceApiError(message, 400, code);
  assert.match(friendlyError(e("INVALID_CROSS_REFERENCE_KEY")), /Owner mapping/);
  assert.match(friendlyError(e("REQUIRED_FIELD_MISSING", "Foo__c")), /requires a field/);
  assert.match(friendlyError(e("STRING_TOO_LONG")), /too long/);
  assert.match(friendlyError(e("UNABLE_TO_LOCK_ROW")), /locked/);
  assert.match(friendlyError(e("STORAGE_LIMIT_EXCEEDED")), /storage/);
  assert.match(friendlyError(e("TIMEOUT", "Salesforce did not answer in time.")), /Try again/);
});

/* ——— org health check ——— */

test("health check passes on a healthy org and reports API usage", async () => {
  const { rest } = setup();
  const report = await runHealthCheck(rest);
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => c.status === "fail")));
  assert.equal(report.apiUsage?.max, 15000);
  assert.ok(report.checks.find((c) => c.id === "users"));
});

test("health check names the fix when Campaigns cannot be created (Marketing User)", async () => {
  const { sf, rest } = setup();
  sf.state.noCreate.add("Campaign");
  sf.state.marketingUser = false;
  const report = await runHealthCheck(rest, { userId: sf.apiUser });
  assert.equal(report.ok, false);
  const campaign = report.checks.find((c) => c.id === "obj-Campaign")!;
  assert.equal(campaign.status, "fail");
  assert.match(campaign.fix ?? "", /Marketing User/);
  assert.equal(report.checks.find((c) => c.id === "marketing-user")?.status, "fail");
});

test("health check fails clearly when the session is dead", async () => {
  const sf = createMockSalesforce();
  sf.expireToken();
  const rest = createRest({ instanceUrl: INSTANCE, accessToken: "stale", apiVersion: "v62.0", fetchImpl: sf.fetchImpl, sleep: async () => {}, refresh: async () => null });
  const report = await runHealthCheck(rest);
  assert.equal(report.ok, false);
  assert.match(report.checks[0].fix ?? "", /Connect to Salesforce again/);
});

test("warns when the daily API limit is nearly used up", async () => {
  const { sf, rest } = setup();
  sf.state.dailyUsed = 14_500;
  const report = await runHealthCheck(rest);
  assert.equal(report.checks[0].status, "warn");
});

/* ——— owner mapping ——— */

test("owners are auto-matched to Salesforce users by name, once each, keeping existing links", async () => {
  const { sf, rest } = setup();
  sf.addUser("Madhav Singhal", "m@example.com");
  sf.addUser("Priya Nair", "p@example.com");
  sf.addUser("Nair, Priya", "dup@example.com"); // a second, same-named user must not also be used
  const users = await listUsers(rest);
  const existing = { "Alex Rivera": { sfUserId: "005000000000777", sfName: "Alex R." } };
  const { map, matched, unmatched } = autoMatchOwners(["Madhav Singhal", "Priya Nair", "Alex Rivera", "Jordan Lee"], users, existing);
  assert.deepEqual(matched.sort(), ["Madhav Singhal", "Priya Nair"]);
  assert.deepEqual(unmatched, ["Jordan Lee"]);
  assert.equal(map["Alex Rivera"].sfUserId, "005000000000777");
  assert.equal(ownerForSfId(map, map["Priya Nair"].sfUserId + "AAA"), "Priya Nair", "15/18 char ids compare equal");
});

/* ——— encrypted token store ——— */

test("sessions survive a server restart and are stored encrypted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eventmail-store-"));
  try {
    const a = createSessionStore<{ accessToken: string }>({ name: "t", secret: "s3cret", dir });
    a.set("sess-1", { accessToken: "00D-super-secret-token" });

    // "restart": a brand new store object over the same directory
    const b = createSessionStore<{ accessToken: string }>({ name: "t", secret: "s3cret", dir });
    assert.deepEqual(b.get("sess-1"), { accessToken: "00D-super-secret-token" });

    const raw = fs.readFileSync(a.file!, "utf8");
    assert.ok(!raw.includes("super-secret"), "token must not appear in plain text on disk");
    assert.ok(raw.startsWith("v1."));

    b.delete("sess-1");
    const c = createSessionStore<{ accessToken: string }>({ name: "t", secret: "s3cret", dir });
    assert.equal(c.get("sess-1"), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a different secret cannot read the file (and tampering is detected)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eventmail-store-"));
  try {
    const a = createSessionStore<string>({ name: "t", secret: "one", dir });
    a.set("x", "value");
    assert.equal(createSessionStore<string>({ name: "t", secret: "two", dir }).get("x"), undefined);

    const raw = fs.readFileSync(a.file!, "utf8");
    fs.writeFileSync(a.file!, raw.slice(0, -4) + "AAAA");
    assert.equal(createSessionStore<string>({ name: "t", secret: "one", dir }).get("x"), undefined);

    assert.equal(decryptJson("garbage", "one"), null);
    assert.deepEqual(decryptJson(encryptJson({ a: 1 }, "k"), "k"), { a: 1 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("when the disk cannot be written the store keeps working in memory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eventmail-store-"));
  const blocker = path.join(dir, "file-not-dir");
  fs.writeFileSync(blocker, "x");
  try {
    const s = createSessionStore<string>({ name: "t", secret: "k", dir: path.join(blocker, "nested") });
    s.set("a", "b");
    assert.equal(s.get("a"), "b");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("two workers sharing the file see each other's sessions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eventmail-store-"));
  try {
    const w1 = createSessionStore<string>({ name: "t", secret: "k", dir });
    const w2 = createSessionStore<string>({ name: "t", secret: "k", dir });
    w1.set("a", "from-1");
    assert.equal(w2.get("a"), "from-1");
    w2.set("b", "from-2");
    assert.equal(w1.get("b"), "from-2");
    assert.equal(w1.get("a"), "from-1");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
