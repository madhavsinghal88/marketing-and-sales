"use client";

import { useEffect, useState } from "react";
import { SALES_OWNERS } from "@/lib/types";
import type { Deal, FollowUpTask, SalesLead } from "@/lib/types";
import { POLICY_LABELS, type PullPolicy } from "@/lib/salesforce/reconcile";
import type { AutoPullMinutes } from "@/lib/salesforce/settingsStore";
import type { HealthReport, SfUser } from "@/lib/salesforce/remote";
import type { SalesforceSyncApi } from "@/lib/salesforce/useSync";
import type { SyncLogEntry } from "@/lib/salesforce/syncStore";

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "↓ Pull from Salesforce": brings changes made by reps in Salesforce into EventMail. */
export function PullButton({ sf }: { sf: SalesforceSyncApi }) {
  return (
    <button
      type="button"
      className="btn btn--ghost sf-pull-btn"
      disabled={sf.busy !== null}
      title="Read what changed in Salesforce (stage, owner, task status) and bring it into EventMail"
      onClick={() => void sf.pull()}
    >
      {sf.busy ?? "↓ Pull from Salesforce"}
    </button>
  );
}

/* ——— Pull + conflict policy + auto-pull ——— */

const AUTO_OPTIONS: { value: AutoPullMinutes; label: string }[] = [
  { value: 0, label: "Off (manual only)" },
  { value: 1, label: "Every minute" },
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
];

export function TwoWayCard({ sf }: { sf: SalesforceSyncApi }) {
  const { settings } = sf;
  return (
    <section className="sf-card" aria-labelledby="sf-twoway-title">
      <header className="sf-card__head">
        <div>
          <h4 id="sf-twoway-title">Salesforce → EventMail (pull)</h4>
          <p>
            When a rep changes a lead status, an opportunity stage, an owner or completes a task in
            Salesforce, bring it back here. Pulling only reads Salesforce, it never changes it.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={sf.busy !== null}
          onClick={() => void sf.pull()}
        >
          {sf.busy ?? "↓ Pull from Salesforce"}
        </button>
      </header>

      <div className="sf-pull-meta">
        <span>
          Last pulled:{" "}
          <strong>{sf.lastPullAt ? timeLabel(sf.lastPullAt) : "never"}</strong>
        </span>
        <label className="sf-inline">
          Automatic pull
          <select
            value={settings.autoPullMinutes}
            onChange={(e) => sf.setAutoPull(Number(e.target.value) as AutoPullMinutes)}
          >
            {AUTO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="sf-policy">
        <legend>If both sides changed the same field, who wins?</legend>
        {(Object.keys(POLICY_LABELS) as PullPolicy[]).map((p) => (
          <label key={p} className={settings.policy === p ? "is-on" : ""}>
            <input
              type="radio"
              name="sf-policy"
              checked={settings.policy === p}
              onChange={() => sf.setPolicy(p)}
            />
            <span>
              <strong>{POLICY_LABELS[p].title}</strong>
              <small>{POLICY_LABELS[p].help}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}

/* ——— Open conflicts ——— */

const FIELD_LABEL = { stage: "Stage", owner: "Owner", done: "Status" } as const;

export function ConflictsCard({ sf }: { sf: SalesforceSyncApi }) {
  if (sf.conflicts.length === 0) return null;
  return (
    <section className="sf-card sf-card--warn" aria-labelledby="sf-conflicts-title">
      <header className="sf-card__head">
        <div>
          <h4 id="sf-conflicts-title">
            {sf.conflicts.length} {sf.conflicts.length === 1 ? "conflict needs" : "conflicts need"} your
            decision
          </h4>
          <p>
            These fields were changed in EventMail and in Salesforce. Nothing has been overwritten on
            either side. Pick the value to keep.
          </p>
        </div>
        <div className="sf-card__actions">
          <button type="button" className="btn btn--ghost" onClick={() => sf.resolveAllConflicts("eventmail")}>
            Keep EventMail for all
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => sf.resolveAllConflicts("salesforce")}>
            Use Salesforce for all
          </button>
        </div>
      </header>
      <ul className="sf-conflicts">
        {sf.conflicts.map((c) => (
          <li key={c.id}>
            <div className="sf-conflicts__what">
              <strong>{c.label}</strong>
              <span>
                {FIELD_LABEL[c.field]} · changed in Salesforce {c.source.toLowerCase()}
              </span>
            </div>
            <div className="sf-conflicts__values">
              <span className="sf-val sf-val--em">
                <small>EventMail</small>
                {c.local}
              </span>
              <span aria-hidden>↔</span>
              <span className="sf-val sf-val--sf">
                <small>Salesforce</small>
                {c.remote}
              </span>
            </div>
            <div className="sf-conflicts__buttons">
              <button type="button" className="btn btn--ghost" onClick={() => sf.resolveConflict(c.id, "eventmail")}>
                Keep EventMail
              </button>
              <button type="button" className="btn btn--primary" onClick={() => sf.resolveConflict(c.id, "salesforce")}>
                Use Salesforce
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ——— Owner mapping ——— */

function useSfUsers(enabled: boolean) {
  const [users, setUsers] = useState<SfUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(): Promise<SfUser[]> {
    setLoading(true);
    try {
      const res = await fetch("/api/salesforce/users");
      const data = (await res.json()) as { users?: SfUser[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not read Salesforce users.");
        return [];
      }
      setError(null);
      setUsers(data.users ?? []);
      return data.users ?? [];
    } catch {
      setError("Could not reach the server.");
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetch("/api/salesforce/users")
      .then(async (res) => ({ res, data: (await res.json()) as { users?: SfUser[]; error?: string } }))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (res.ok) {
          setUsers(data.users ?? []);
          setError(null);
        } else {
          setError(data.error ?? "Could not read Salesforce users.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server.");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { users, error, loading, reload: load };
}

export function OwnerMappingCard({ sf }: { sf: SalesforceSyncApi }) {
  const { users, error, loading, reload } = useSfUsers(sf.connected);
  const [message, setMessage] = useState<string | null>(null);
  const mapped = SALES_OWNERS.filter((o) => sf.ownerMap[o]).length;

  async function autoMatch() {
    const list = users.length ? users : await reload();
    const r = sf.autoMatchOwners(list);
    setMessage(
      r.matched.length
        ? `Linked ${r.matched.join(", ")}.${r.unmatched.length ? ` No Salesforce user named ${r.unmatched.join(", ")}.` : ""}`
        : r.unmatched.length
          ? `No Salesforce user has the same name as ${r.unmatched.join(", ")}. Pick them below.`
          : "Everyone is already linked.",
    );
  }

  return (
    <section className="sf-card" aria-labelledby="sf-owners-title">
      <header className="sf-card__head">
        <div>
          <h4 id="sf-owners-title">Owner mapping</h4>
          <p>
            Link each EventMail owner to a Salesforce user. Synced records are then assigned to that
            user, and an owner changed in Salesforce comes back as the matching EventMail owner.
          </p>
        </div>
        <div className="sf-card__actions">
          <span className={`sf-badge sf-badge--${mapped === SALES_OWNERS.length ? "synced" : "stale"}`}>
            {mapped}/{SALES_OWNERS.length} linked
          </span>
          <button type="button" className="btn btn--ghost" disabled={loading || users.length === 0} onClick={() => void autoMatch()}>
            Auto-match by name
          </button>
        </div>
      </header>
      {error ? <p className="sf-note sf-note--bad">{error}</p> : null}
      {message ? <p className="sf-note">{message}</p> : null}
      <table className="sf-owner-table">
        <thead>
          <tr>
            <th>EventMail owner</th>
            <th>Salesforce user</th>
          </tr>
        </thead>
        <tbody>
          {SALES_OWNERS.map((owner) => (
            <tr key={owner}>
              <td>{owner}</td>
              <td>
                <select
                  aria-label={`Salesforce user for ${owner}`}
                  value={sf.ownerMap[owner]?.sfUserId ?? ""}
                  onChange={(e) => {
                    const user = users.find((u) => u.id === e.target.value) ?? null;
                    sf.setOwnerLink(owner, user);
                    setMessage(null);
                  }}
                >
                  <option value="">Not linked</option>
                  {/* keep a saved link visible even if the user list has not loaded */}
                  {sf.ownerMap[owner] && !users.some((u) => u.id === sf.ownerMap[owner].sfUserId) ? (
                    <option value={sf.ownerMap[owner].sfUserId}>{sf.ownerMap[owner].sfName}</option>
                  ) : null}
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.email ? ` (${u.email})` : ""}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sf-note">
        After changing the links, click <strong>Sync everything</strong> to assign records that are
        already in Salesforce. Records a rep has already taken over are never reassigned.
      </p>
    </section>
  );
}

/* ——— Org health check ——— */

const ICON = { pass: "✓", warn: "!", fail: "✗" } as const;

export function OrgHealthCard({ sf }: { sf: SalesforceSyncApi }) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/salesforce/health");
      const data = (await res.json()) as { report?: HealthReport; error?: string };
      if (!res.ok || !data.report) setError(data.error ?? "Health check failed.");
      else setReport(data.report);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="sf-card" aria-labelledby="sf-health-title">
      <header className="sf-card__head">
        <div>
          <h4 id="sf-health-title">Org health check</h4>
          <p>
            Checks that the connected Salesforce user can do everything the sync needs (login, create
            and edit Leads, Opportunities, Tasks and Campaigns). Read-only: it creates nothing.
            {sf.mode === "demo" ? " In demo mode the result is simulated." : ""}
          </p>
        </div>
        <button type="button" className="btn btn--ghost" disabled={running} onClick={() => void run()}>
          {running ? "Checking…" : report ? "Re-run check" : "Run check"}
        </button>
      </header>
      {error ? <p className="sf-note sf-note--bad">{error}</p> : null}
      {report ? (
        <>
          <p className={`sf-note ${report.ok ? "sf-note--good" : "sf-note--bad"}`}>
            {report.ok ? "Everything the sync needs is available." : "Something needs fixing before the sync can fully work."}
            {report.apiUsage
              ? ` API calls today: ${report.apiUsage.used.toLocaleString()} of ${report.apiUsage.max.toLocaleString()}.`
              : ""}
          </p>
          <ul className="sf-health">
            {report.checks.map((c) => (
              <li key={c.id} className={`is-${c.status}`}>
                <span className="sf-health__icon" aria-label={c.status}>
                  {ICON[c.status]}
                </span>
                <div>
                  <strong>{c.label}</strong>
                  <span>{c.detail}</span>
                  {c.fix ? <em>Fix: {c.fix}</em> : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/* ——— Demo only: act as a Salesforce rep ——— */

type ActionId = "leadStatus" | "oppStage" | "taskStatus" | "leadOwner" | "deleteLead";

const LEAD_STATUSES = ["Open - Not Contacted", "Working - Contacted", "Closed - Converted", "Closed - Not Converted"];
const OPP_STAGES = ["Prospecting", "Qualification", "Needs Analysis", "Proposal/Price Quote", "Negotiation/Review", "Closed Won", "Closed Lost"];
const TASK_STATUSES = ["Completed", "In Progress", "Not Started"];

export function DemoRepCard({
  sf,
  entities,
}: {
  sf: SalesforceSyncApi;
  entities: { leads: SalesLead[]; deals: Deal[]; followUps: FollowUpTask[] };
}) {
  const { users } = useSfUsers(sf.mode === "demo");
  const [action, setAction] = useState<ActionId>("leadStatus");
  const [target, setTarget] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [working, setWorking] = useState(false);

  if (sf.mode !== "demo") return null;

  const isSynced = (v: { state: string; record?: { sfId?: string } }) =>
    (v.state === "synced" || v.state === "stale") && Boolean(v.record?.sfId);

  const syncedLeads = entities.leads.filter((l) => isSynced(sf.leadState(l)));
  const syncedDeals = entities.deals.filter((d) => isSynced(sf.dealState(d)));
  const syncedTasks = entities.followUps.filter((t) => isSynced(sf.taskState(t)));

  const targets: { key: string; label: string }[] =
    action === "oppStage"
      ? syncedDeals.map((d) => ({ key: d.id, label: `${d.company} - ${d.leadName} (${d.stage})` }))
      : action === "taskStatus"
        ? syncedTasks.map((t) => ({ key: t.id, label: `${t.channel}: ${t.leadName} (${t.status})` }))
        : syncedLeads.map((l) => ({ key: l.id, label: `${l.name} (${l.stage}, ${l.owner})` }));

  const values: { value: string; label: string }[] =
    action === "leadStatus"
      ? LEAD_STATUSES.map((v) => ({ value: v, label: v }))
      : action === "oppStage"
        ? OPP_STAGES.map((v) => ({ value: v, label: v }))
        : action === "taskStatus"
          ? TASK_STATUSES.map((v) => ({ value: v, label: v }))
          : action === "leadOwner"
            ? users.map((u) => ({ value: u.id, label: u.name }))
            : [];

  const key = targets.some((t) => t.key === target) ? target : (targets[0]?.key ?? "");
  const val = values.some((v) => v.value === value) ? value : (values[0]?.value ?? "");
  const needsValue = action !== "deleteLead";
  const ready = Boolean(key) && (!needsValue || Boolean(val));

  async function apply(thenPull: boolean) {
    setWorking(true);
    setMessage(null);
    const change =
      action === "leadStatus"
        ? { status: val }
        : action === "oppStage"
          ? { stage: val }
          : action === "taskStatus"
            ? { taskStatus: val }
            : action === "leadOwner"
              ? { ownerId: val }
              : { remove: true };
    const kind = action === "oppStage" ? "deal" : action === "taskStatus" ? "task" : "lead";
    const error = await sf.simulateRemote(kind, key, change);
    setWorking(false);
    if (error) {
      setMessage({ text: error, bad: true });
      return;
    }
    setMessage({
      text: thenPull
        ? "Changed in the demo Salesforce. Pulling now…"
        : "Changed in the demo Salesforce. Now click “Pull from Salesforce” to bring it into EventMail.",
    });
    if (thenPull) await sf.pull();
  }

  return (
    <section className="sf-card sf-card--demo" aria-labelledby="sf-demo-title">
      <header className="sf-card__head">
        <div>
          <h4 id="sf-demo-title">Demo: act as a Salesforce rep</h4>
          <p>
            Demo mode has no real Salesforce, so make a change here as if a sales rep did it in
            Salesforce, then pull it into EventMail. Records must be synced first.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" disabled={sf.busy !== null} onClick={() => void sf.resetDemo()}>
          Reset demo data
        </button>
      </header>
      <div className="sf-demo-form">
        <label>
          What does the rep do?
          <select value={action} onChange={(e) => setAction(e.target.value as ActionId)}>
            <option value="leadStatus">Change a lead&apos;s status</option>
            <option value="oppStage">Move an opportunity to another stage</option>
            <option value="taskStatus">Complete or reopen a task</option>
            <option value="leadOwner">Reassign a lead to another owner</option>
            <option value="deleteLead">Delete a lead in Salesforce</option>
          </select>
        </label>
        <label>
          Which record?
          <select value={key} onChange={(e) => setTarget(e.target.value)} disabled={targets.length === 0}>
            {targets.length === 0 ? <option value="">Sync some records first</option> : null}
            {targets.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {needsValue ? (
          <label>
            New value
            <select value={val} onChange={(e) => setValue(e.target.value)}>
              {values.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="sf-card__actions">
        <button type="button" className="btn btn--ghost" disabled={!ready || working} onClick={() => void apply(false)}>
          Apply in Salesforce
        </button>
        <button type="button" className="btn btn--primary" disabled={!ready || working || sf.busy !== null} onClick={() => void apply(true)}>
          Apply and pull now
        </button>
      </div>
      {message ? <p className={`sf-note ${message.bad ? "sf-note--bad" : ""}`}>{message.text}</p> : null}
    </section>
  );
}

/* ——— Sync log ——— */

const KIND_LABEL = { lead: "Lead", deal: "Opportunity", task: "Task", event: "Campaign", pull: "Pull" } as const;
type LogFilter = "all" | "pull" | "push" | "problems";

function entryDirection(e: SyncLogEntry): "pull" | "push" {
  return e.direction ?? "push";
}

export function SyncLog({ sf }: { sf: SalesforceSyncApi }) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const rows = sf.log.filter((e) =>
    filter === "all"
      ? true
      : filter === "problems"
        ? !e.ok || e.tone === "conflict"
        : entryDirection(e) === filter,
  );

  function exportLog() {
    const blob = new Blob([JSON.stringify(sf.log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "eventmail-salesforce-sync-log.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="sf-log">
      <div className="sf-log__head">
        <h4>Sync log</h4>
        <div className="sf-log__tools">
          {(["all", "pull", "push", "problems"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`sf-chip ${filter === f ? "is-on" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "pull" ? "↓ Pulled" : f === "push" ? "↑ Pushed" : "Problems"}
            </button>
          ))}
          {sf.summary.failed > 0 ? (
            <button type="button" className="btn btn--ghost" disabled={sf.busy !== null} onClick={() => void sf.retryFailed()}>
              Retry {sf.summary.failed} failed
            </button>
          ) : null}
          <button type="button" className="sf-link" disabled={sf.log.length === 0} onClick={exportLog}>
            Export
          </button>
          <button type="button" className="sf-link" disabled={sf.log.length === 0} onClick={sf.clearLog}>
            Clear
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="sf-log__empty">
          {sf.log.length === 0
            ? "Nothing synced yet. Use Sync on the Leads, Deals, Follow-ups or an event."
            : "No entries match this filter."}
        </p>
      ) : (
        <ul>
          {rows.map((entry) => (
            <li
              key={entry.id}
              className={[!entry.ok ? "is-bad" : "", entry.tone ? `tone-${entry.tone}` : ""].join(" ").trim()}
            >
              <span className="sf-log__time">{timeLabel(entry.at)}</span>
              <span className="sf-log__kind">
                {entryDirection(entry) === "pull" ? "↓" : "↑"} {KIND_LABEL[entry.kind]}
              </span>
              <span className="sf-log__label">{entry.label}</span>
              <span className="sf-log__msg">
                {entry.direction === "pull" ? entry.message : entry.ok ? `✓ ${entry.message}` : `✗ ${entry.message}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
