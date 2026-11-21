/**
 * Read-side of the Salesforce integration: fetch what Salesforce holds now for records we
 * pushed earlier (so changes made by reps can flow back), list Salesforce users for owner
 * mapping, and run an org health check. Framework-free: goes through the injected SfRest.
 */
import type { SfRest } from "./rest";
import type { RemoteSnap, SyncResult } from "./mapping";

export type RemoteKind = "lead" | "deal" | "task";

export type RemoteRequest = { kind: RemoteKind; key: string; sfId: string };

const SF_ID = /^[a-zA-Z0-9]{15,18}$/;

type Row = {
  Id: string;
  Status?: string | null;
  StageName?: string | null;
  IsConverted?: boolean | null;
  IsClosed?: boolean | null;
  IsWon?: boolean | null;
  ActivityDate?: string | null;
  OwnerId?: string | null;
  Owner?: { Name?: string | null } | null;
  LastModifiedDate?: string | null;
};

const QUERIES: Record<RemoteKind, { object: string; fields: string }> = {
  lead: {
    object: "Lead",
    fields: "Id, Status, IsConverted, OwnerId, Owner.Name, LastModifiedDate",
  },
  deal: {
    object: "Opportunity",
    fields: "Id, StageName, IsClosed, IsWon, OwnerId, Owner.Name, LastModifiedDate",
  },
  task: {
    object: "Task",
    fields: "Id, Status, IsClosed, ActivityDate, OwnerId, Owner.Name, LastModifiedDate",
  },
};

function toSnap(kind: RemoteKind, r: Row): RemoteSnap {
  const snap: RemoteSnap = {
    sfId: r.Id,
    ownerId: r.OwnerId ?? undefined,
    ownerName: r.Owner?.Name ?? undefined,
    modified: r.LastModifiedDate ?? undefined,
  };
  if (kind === "lead") {
    snap.status = r.Status ?? "";
    snap.converted = Boolean(r.IsConverted);
  } else if (kind === "deal") {
    snap.stage = r.StageName ?? "";
    snap.isClosed = Boolean(r.IsClosed);
    snap.isWon = Boolean(r.IsWon);
  } else {
    snap.taskStatus = r.Status ?? "";
    snap.isClosed = Boolean(r.IsClosed);
    snap.dueDate = r.ActivityDate ?? undefined;
  }
  return snap;
}

export type FetchRemoteResult = {
  /** Keyed by the id as we know it (15 or 18 chars, as stored). */
  snapshots: Record<string, RemoteSnap>;
  /** Ids Salesforce no longer returns (deleted, merged away, or no access). */
  missing: string[];
};

/** One query per object type per 100 ids. */
export async function fetchRemote(
  rest: SfRest,
  requests: RemoteRequest[],
): Promise<FetchRemoteResult> {
  const snapshots: Record<string, RemoteSnap> = {};
  const missing: string[] = [];

  for (const kind of ["lead", "deal", "task"] as const) {
    const ids = [
      ...new Set(
        requests.filter((r) => r.kind === kind && SF_ID.test(r.sfId)).map((r) => r.sfId),
      ),
    ];
    const q = QUERIES[kind];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const rows = await rest.query<Row>(
        `SELECT ${q.fields} FROM ${q.object} WHERE Id IN (${chunk.map((id) => `'${id}'`).join(",")})`,
      );
      // Salesforce may answer with the 18-char form of a 15-char id we stored.
      const byShort = new Map(rows.map((r) => [r.Id.slice(0, 15), r]));
      for (const id of chunk) {
        const row = byShort.get(id.slice(0, 15));
        if (row) snapshots[id] = toSnap(kind, row);
        else missing.push(id);
      }
    }
  }
  return { snapshots, missing };
}

/**
 * After a push, read back what Salesforce holds so the next pull can tell "a rep changed
 * this" from "this is what we wrote". Best effort: a failure here never fails the push.
 */
export async function attachSnapshots(
  rest: SfRest,
  kind: RemoteKind,
  results: SyncResult[],
): Promise<SyncResult[]> {
  const wanted = results.filter((r) => r.ok && r.sfId);
  if (wanted.length === 0) return results;
  try {
    const { snapshots } = await fetchRemote(
      rest,
      wanted.map((r) => ({ kind, key: r.key, sfId: r.sfId! })),
    );
    return results.map((r) =>
      r.ok && r.sfId && snapshots[r.sfId] ? { ...r, remote: snapshots[r.sfId] } : r,
    );
  } catch (e) {
    // A dead session must still abort; anything else just means "no baseline this time".
    if (typeof e === "object" && e && "status" in e && (e as { status: number }).status === 401) {
      throw e;
    }
    return results;
  }
}

/* ——— Salesforce users (owner mapping) ——— */

export type SfUser = { id: string; name: string; email: string; username?: string };

export async function listUsers(rest: SfRest): Promise<SfUser[]> {
  const rows = await rest.query<{
    Id: string;
    Name: string;
    Email?: string | null;
    Username?: string | null;
  }>(
    "SELECT Id, Name, Email, Username FROM User WHERE IsActive = true AND UserType = 'Standard' ORDER BY Name ASC LIMIT 200",
  );
  return rows.map((r) => ({
    id: r.Id,
    name: r.Name,
    email: r.Email ?? "",
    username: r.Username ?? undefined,
  }));
}

/* ——— Org health check ——— */

export type HealthCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  fix?: string;
};

export type HealthReport = {
  ok: boolean;
  checkedAt: string;
  checks: HealthCheck[];
  apiUsage?: { used: number; max: number };
};

export async function runHealthCheck(
  rest: SfRest,
  opts: { userId?: string; now?: Date } = {},
): Promise<HealthReport> {
  const checks: HealthCheck[] = [];
  const add = (c: HealthCheck) => checks.push(c);
  let apiUsage: HealthReport["apiUsage"];

  // 1. Can we talk to the API with the saved token (this refreshes it if needed)?
  try {
    const limits = await rest.limits();
    const daily = limits.DailyApiRequests;
    if (daily) {
      apiUsage = { used: daily.Max - daily.Remaining, max: daily.Max };
    }
    const pct = daily ? (daily.Max - daily.Remaining) / daily.Max : 0;
    add({
      id: "api",
      label: "API access and login",
      status: pct > 0.9 ? "warn" : "pass",
      detail: daily
        ? `Connected. ${(daily.Max - daily.Remaining).toLocaleString()} of ${daily.Max.toLocaleString()} daily API calls used.`
        : "Connected.",
      fix: pct > 0.9 ? "You are close to the daily API limit. Syncs may be refused soon." : undefined,
    });
  } catch (e) {
    add({
      id: "api",
      label: "API access and login",
      status: "fail",
      detail: e instanceof Error ? e.message : "Could not reach Salesforce.",
      fix: "Click Disconnect, then Connect to Salesforce again. Check that the user has \"API Enabled\" on their profile.",
    });
    return { ok: false, checkedAt: (opts.now ?? new Date()).toISOString(), checks, apiUsage };
  }

  // 2. Object permissions (a failed describe means no access to the object at all).
  const objects: { name: string; label: string; need: ("createable" | "updateable")[]; fix: string }[] = [
    { name: "Lead", label: "Leads", need: ["createable", "updateable"], fix: "Give the user Create and Edit on Leads (profile or permission set)." },
    { name: "Opportunity", label: "Opportunities", need: ["createable", "updateable"], fix: "Give the user Create and Edit on Opportunities." },
    { name: "Task", label: "Tasks (follow-ups)", need: ["createable", "updateable"], fix: "Give the user Create and Edit on Activities/Tasks." },
    {
      name: "Campaign",
      label: "Campaigns (events)",
      need: ["createable"],
      fix: "In Setup, open Users, edit your user and tick \"Marketing User\", then re-check.",
    },
  ];
  for (const o of objects) {
    try {
      const d = await rest.describe(o.name);
      const missing = o.need.filter((n) => d[n] === false);
      add({
        id: `obj-${o.name}`,
        label: o.label,
        status: missing.length ? "fail" : "pass",
        detail: missing.length
          ? `The connected user cannot ${missing.map((m) => (m === "createable" ? "create" : "edit")).join(" or ")} ${o.name} records.`
          : `Can create and edit ${o.name} records.`,
        fix: missing.length ? o.fix : undefined,
      });
    } catch {
      add({
        id: `obj-${o.name}`,
        label: o.label,
        status: "fail",
        detail: `${o.name} is not available to the connected user.`,
        fix: o.fix,
      });
    }
  }

  // 3. Marketing User flag (precise reason when Campaigns fail).
  if (opts.userId && SF_ID.test(opts.userId)) {
    try {
      const rows = await rest.query<{ UserPermissionsMarketingUser?: boolean }>(
        `SELECT UserPermissionsMarketingUser FROM User WHERE Id = '${opts.userId}'`,
      );
      const flag = rows[0]?.UserPermissionsMarketingUser;
      if (flag !== undefined) {
        add({
          id: "marketing-user",
          label: "Marketing User checkbox",
          status: flag ? "pass" : "fail",
          detail: flag
            ? "The connected user is a Marketing User, so Campaigns can be created."
            : "The connected user is not a Marketing User, so event Campaigns will fail.",
          fix: flag ? undefined : "Setup, Users, edit your user, tick \"Marketing User\", save.",
        });
      }
    } catch {
      // not readable: the Campaign check above already covers the practical outcome
    }
  }

  // 4. Optional custom fields on Lead.
  try {
    const lead = await rest.describe("Lead");
    const names = new Set(lead.fields.map((f) => f.name));
    const have = ["EventMail_Score__c", "EventMail_Event__c", "EventMail_Last_Activity__c"].filter(
      (n) => names.has(n),
    );
    add({
      id: "custom-fields",
      label: "Optional custom fields",
      status: have.length === 3 ? "pass" : "warn",
      detail:
        have.length === 3
          ? "All 3 EventMail fields exist on Lead."
          : `${have.length}/3 EventMail fields exist. Score and event are saved in Description and Rating instead.`,
      fix: have.length === 3 ? undefined : "Optional. Create the 3 fields described in the setup note below.",
    });
  } catch {
    // already reported as a Lead failure
  }

  // 5. Users available for owner mapping.
  try {
    const users = await listUsers(rest);
    add({
      id: "users",
      label: "Salesforce users for owner mapping",
      status: users.length > 0 ? "pass" : "warn",
      detail: `${users.length} active user${users.length === 1 ? "" : "s"} can be mapped to EventMail owners.`,
      fix: users.length > 0 ? undefined : "Owner mapping needs permission to read Users.",
    });
  } catch {
    add({
      id: "users",
      label: "Salesforce users for owner mapping",
      status: "warn",
      detail: "Could not read the Salesforce user list.",
      fix: "Owner mapping needs permission to read Users.",
    });
  }

  return {
    ok: checks.every((c) => c.status !== "fail"),
    checkedAt: (opts.now ?? new Date()).toISOString(),
    checks,
    apiUsage,
  };
}
