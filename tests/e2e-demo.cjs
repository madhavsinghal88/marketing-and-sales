// Browser end-to-end test of Salesforce Phase 3 in DEMO mode (no real Salesforce needed).
// Runs in an isolated browser context, so it never touches the user's own cookies/session.
const puppeteer = require("puppeteer-core") /* npm i --no-save puppeteer-core, then: node tests/e2e-demo.cjs (dev server on :3000) */;
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const SHOTS = path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}
async function waitText(page, re, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const t = await bodyText(page);
    if (re.test(t)) return true;
    await sleep(150);
  }
  return false;
}
async function clickButton(page, text, nth = 0) {
  const ok = await page.evaluate(
    (text, nth) => {
      const els = [...document.querySelectorAll("button, a")].filter((e) => e.textContent.trim() === text && !e.disabled);
      const el = els[nth];
      if (!el) return false;
      el.click();
      return true;
    },
    text,
    nth,
  );
  if (!ok) throw new Error(`button not found: ${text}`);
}
async function selectIn(page, labelStart, value) {
  const h = await page.evaluateHandle((t) => {
    const l = [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith(t));
    return l ? l.querySelector("select") : null;
  }, labelStart);
  const el = h.asElement();
  if (!el) throw new Error(`select not found: ${labelStart}`);
  await el.select(value);
}
async function nav(page, label) {
  await page.evaluate((label) => {
    const el = [...document.querySelectorAll(".sidebar__nav button, .sidebar__nav a")].find((e) => e.textContent.includes(label));
    if (!el) throw new Error("nav not found " + label);
    el.click();
  }, label);
  await sleep(400);
}
async function rowCells(page, name) {
  return page.evaluate((name) => {
    const tr = [...document.querySelectorAll("tbody tr")].find((r) => r.textContent.includes(name));
    return tr ? tr.innerText : null;
  }, name);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--window-size=1500,1100"],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1500, height: 1100 });
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) problems.push("console: " + m.text());
  });
  page.on("dialog", (d) => void d.accept());

  try {
    await page.goto(BASE, { waitUntil: "networkidle2", timeout: 90000 });
    await nav(page, "Integrations");
    await clickButton(page, "or try demo mode");
    check("demo Salesforce connects from the UI button", await waitText(page, /Connected\s*\(demo\)/));
    await nav(page, "Integrations");
    await clickButton(page, "Reset demo data");
    check("reset demo data works", await waitText(page, /Demo reset. Nothing is synced yet/));

    check("panel shows the two-way controls", await waitText(page, /Salesforce → EventMail \(pull\)/) && /Owner mapping/.test(await bodyText(page)) && /Org health check/.test(await bodyText(page)) && /Demo: act as a Salesforce rep/.test(await bodyText(page)));
    await shot(page, "01-integrations-empty");

    // Owner mapping
    await clickButton(page, "Auto-match by name");
    check("owner auto-match links all 4 owners", await waitText(page, /4\/4 linked/), (await bodyText(page)).slice(0, 200));

    // Sync everything (pushes owners too)
    await clickButton(page, "↑ Sync everything");
    check("sync everything completes", await waitText(page, /Synced \d+ leads, \d+ deals, \d+ tasks, \d+ campaigns/, 40000));
    await shot(page, "02-after-sync");

    // Org health
    await clickButton(page, "Run check");
    check("org health check passes", await waitText(page, /Everything the sync needs is available/));

    // Pull with nothing changed
    await clickButton(page, "↓ Pull from Salesforce");
    check("pull with no changes says up to date", await waitText(page, /Already up to date/));

    // Rep changes lead status -> pull -> EventMail stage changes
    await selectIn(page, "What does the rep do?", "leadStatus");
    await selectIn(page, "Which record?", "lead-evt-01-p-02");
    await selectIn(page, "New value", "Working - Contacted");
    await clickButton(page, "Apply and pull now");
    check("pull brings the rep's lead status change in", await waitText(page, /Pulled from Salesforce \(\d+ records? checked\): 1 change brought into EventMail/));
    await shot(page, "03-after-first-pull");
    await nav(page, "Leads");
    let row = await rowCells(page, "Sarah Johnson");
    check("Sarah Johnson is now Contacted in the Leads table", /Contacted/.test(row ?? ""), row ?? "no row");
    check("the row shows the 'From Salesforce' chip and is still Synced (not 'Changed')", /From Salesforce/.test(row ?? "") && /Synced/.test(row ?? "") && !/Changed/.test(row ?? ""), row ?? "");
    await shot(page, "04-leads-after-pull");

    // Conflict: change locally AND in Salesforce
    await nav(page, "Pipeline");
    await page.evaluate(() => {
      const card = [...document.querySelectorAll(".pipeline-card")].find((c) => c.textContent.includes("Sarah Johnson"));
      const sel = card.querySelector("select");
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(sel, "Proposal");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await sleep(300);
    await nav(page, "Integrations");
    await selectIn(page, "What does the rep do?", "leadStatus");
    await selectIn(page, "Which record?", "lead-evt-01-p-02");
    await selectIn(page, "New value", "Closed - Not Converted");
    await clickButton(page, "Apply and pull now");
    check("both sides changed: a conflict is raised, nothing is overwritten", await waitText(page, /1 conflict needs your decision/), (await bodyText(page)).slice(0, 300));
    const conflictText = await bodyText(page);
    check("the conflict shows both values", /Sarah Johnson/.test(conflictText) && /Proposal/.test(conflictText) && /Lost/.test(conflictText));
    await shot(page, "05-conflict");
    await nav(page, "Leads");
    row = await rowCells(page, "Sarah Johnson");
    check("Leads shows the conflict badge and keeps EventMail's value meanwhile", /Conflict/.test(row ?? "") && /Proposal/.test(row ?? ""), row ?? "");
    await nav(page, "Integrations");
    await clickButton(page, "Use Salesforce");
    check("resolving with 'Use Salesforce' clears the conflict", await waitText(page, /Conflicts\s*\n?\s*0|0\s*\n\s*Conflicts/) || !/need your decision|needs your decision/.test(await bodyText(page)));
    await nav(page, "Leads");
    row = await rowCells(page, "Sarah Johnson");
    check("Sarah Johnson is now Lost", /Lost/.test(row ?? ""), row ?? "");

    // Persistence across a reload (leads are rebuilt from sample data on every load)
    await page.reload({ waitUntil: "networkidle2" });
    await nav(page, "Leads");
    row = await rowCells(page, "Sarah Johnson");
    check("after a page reload the pulled stage is still there and the row is still Synced", /Lost/.test(row ?? "") && /Synced/.test(row ?? "") && !/Changed/.test(row ?? ""), row ?? "");

    // Owner change from Salesforce
    await nav(page, "Integrations");
    await selectIn(page, "What does the rep do?", "leadOwner");
    await selectIn(page, "Which record?", "lead-evt-01-p-03");
    await selectIn(page, "New value", "005DEMOUSER0002");
    await clickButton(page, "Apply and pull now");
    check("owner reassigned in Salesforce is pulled", await waitText(page, /Pulled from Salesforce[^\n]*change/), (await bodyText(page)).slice(0, 200));
    await nav(page, "Leads");
    const owner = await page.evaluate(() => {
      const tr = [...document.querySelectorAll("tbody tr")].find((r) => r.textContent.includes("Michael Chen"));
      return tr ? [...tr.querySelectorAll("select")].map((s) => s.value).join("|") : null;
    });
    check("Michael Chen is now owned by Priya Nair", /Priya Nair/.test(owner ?? ""), String(owner));

    // Task completed in Salesforce
    await nav(page, "Integrations");
    await selectIn(page, "What does the rep do?", "taskStatus");
    await selectIn(page, "Which record?", "fu-lead-evt-01-p-04");
    await selectIn(page, "New value", "Completed");
    await clickButton(page, "Apply and pull now");
    check("task completed in Salesforce is pulled", await waitText(page, /Pulled from Salesforce[^\n]*change/));
    await nav(page, "Follow-ups");
    const fu = await rowCells(page, "Emily");
    check("the follow-up shows Done", /Done|Completed/.test(fu ?? ""), fu ?? "");

    // Sync log
    await nav(page, "Integrations");
    const logText = await bodyText(page);
    check("sync log lists pulled and pushed entries", /↓ Lead/.test(logText) && /↑ Lead/.test(logText));
    await shot(page, "06-final-integrations");

    // Encrypted token file
    const file = path.join("e:/Resona ai/marketing-and-sales/.data/sessions-salesforce.enc");
    const exists = fs.existsSync(file);
    check("session tokens are stored in an encrypted file", exists && !fs.readFileSync(file, "utf8").includes("demo@eventmail.app"));

    check("no browser console errors or page errors", problems.length === 0, problems.join(" || ").slice(0, 600));
  } catch (e) {
    check("script ran to the end", false, e.stack || String(e));
    await shot(page, "zz-failure").catch(() => {});
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
