/**
 * A small in-memory Salesforce for tests: just enough of the REST API (SOQL subset,
 * sobjects create/update, describe, limits, auth) to run the real sync/pull code against.
 * It can also misbehave on demand (rate limits, record locks, expired tokens, no access).
 */
export type Rec = Record<string, unknown> & { Id: string; _seq: number };

const PREFIX: Record<string, string> = {
  Lead: "00Q",
  Opportunity: "006",
  Account: "001",
  Task: "00T",
  Campaign: "701",
  CampaignMember: "00v",
  User: "005",
};

export type Fault = {
  /** Decides whether this fault applies to a request. */
  when: (method: string, path: string, body: unknown) => boolean;
  /** How many matching requests to fail (default 1). */
  times?: number;
  respond: () => Response;
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function createMockSalesforce(opts: { apiVersion?: string } = {}) {
  const version = opts.apiVersion ?? "v62.0";
  let seq = 0;
  const tables: Record<string, Rec[]> = {
    Lead: [],
    Opportunity: [],
    Account: [],
    Task: [],
    Campaign: [],
    CampaignMember: [],
    User: [],
  };
  const state = {
    token: "token-1",
    faults: [] as Fault[],
    requests: [] as { method: string; path: string; body: unknown }[],
    /** Object names the user may NOT create (permission tests). */
    noCreate: new Set<string>(),
    marketingUser: true,
    dailyMax: 15000,
    dailyUsed: 100,
  };

  const newId = (obj: string) => `${PREFIX[obj] ?? "000"}${String(++seq).padStart(12, "0")}`;

  function addUser(name: string, email: string, active = true): string {
    const id = newId("User");
    tables.User.push({ Id: id, _seq: seq, Name: name, Email: email, Username: email, IsActive: active, UserType: "Standard" });
    return id;
  }
  const apiUser = addUser("Integration User", "integration@example.com");

  /** Fields computed from others, as Salesforce does. */
  function project(obj: string, r: Rec): Record<string, unknown> {
    const out: Record<string, unknown> = { ...r };
    if (obj === "Opportunity") {
      out.IsClosed = r.StageName === "Closed Won" || r.StageName === "Closed Lost";
      out.IsWon = r.StageName === "Closed Won";
    }
    if (obj === "Task") out.IsClosed = r.Status === "Completed";
    if (obj === "Lead") out.IsConverted = Boolean(r.IsConverted);
    if (typeof r.OwnerId === "string") {
      const owner = tables.User.find((u) => u.Id === r.OwnerId);
      out["Owner.Name"] = owner?.Name ?? null;
    }
    out.UserPermissionsMarketingUser = state.marketingUser;
    return out;
  }

  const unq = (s: string) => s.replace(/\\(.)/g, "$1");

  function matches(obj: string, r: Rec, cond: string): boolean {
    let m = /^(\w+) = '((?:[^'\\]|\\.)*)'$/.exec(cond);
    if (m) {
      const have = project(obj, r)[m[1]];
      const want = unq(m[2]);
      return m[1] === "Id"
        ? String(have).slice(0, 15) === want.slice(0, 15)
        : String(have ?? "").toLowerCase() === want.toLowerCase();
    }
    m = /^(\w+) = (true|false)$/.exec(cond);
    if (m) return Boolean(project(obj, r)[m[1]]) === (m[2] === "true");
    m = /^(\w+) IN \((.*)\)$/.exec(cond);
    if (m) {
      const list = [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => unq(x[1]).toLowerCase());
      const have = String(project(obj, r)[m[1]] ?? "").toLowerCase();
      return m[1] === "Id" ? list.some((v) => v.slice(0, 15) === have.slice(0, 15)) : list.includes(have);
    }
    throw new Error(`mock: unsupported WHERE condition: ${cond}`);
  }

  function runQuery(q: string): Response {
    const m = /^SELECT (.+?) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (\w+) (ASC|DESC))?(?: LIMIT (\d+))?$/.exec(q);
    if (!m) throw new Error(`mock: unsupported SOQL: ${q}`);
    const [, fields, obj, where, , dir, limit] = m;
    const table = tables[obj];
    if (!table) return json(400, [{ errorCode: "INVALID_TYPE", message: `sObject type '${obj}' is not supported.` }]);
    let rows = table.filter((r) => (where ? where.split(" AND ").every((c) => matches(obj, r, c)) : true));
    rows = [...rows].sort((a, b) => (dir === "ASC" ? a._seq - b._seq : b._seq - a._seq));
    if (limit) rows = rows.slice(0, Number(limit));
    const wanted = fields.split(",").map((f) => f.trim());
    const records = rows.map((r) => {
      const p = project(obj, r);
      const rec: Record<string, unknown> = {};
      for (const f of wanted) {
        if (f.includes(".")) {
          const [rel, prop] = f.split(".");
          rec[rel] = { [prop]: p[f] ?? null };
        } else {
          rec[f] = p[f] ?? null;
        }
      }
      return rec;
    });
    return json(200, { totalSize: records.length, done: true, records });
  }

  function create(obj: string, body: Record<string, unknown>): Response {
    if (state.noCreate.has(obj)) {
      return json(403, [{ errorCode: "INSUFFICIENT_ACCESS_OR_READONLY", message: `You do not have access to create ${obj}.` }]);
    }
    if (obj === "Lead" && (!body.LastName || !body.Company)) {
      return json(400, [{ errorCode: "REQUIRED_FIELD_MISSING", message: "Required fields are missing: [LastName, Company]" }]);
    }
    if (obj === "CampaignMember") {
      const dup = tables.CampaignMember.some((r) => r.CampaignId === body.CampaignId && r.LeadId === body.LeadId);
      if (dup) return json(400, [{ errorCode: "DUPLICATE_VALUE", message: "Already a member" }]);
    }
    if (typeof body.OwnerId === "string" && !tables.User.some((u) => u.Id === body.OwnerId && u.IsActive)) {
      return json(400, [{ errorCode: "INVALID_CROSS_REFERENCE_KEY", message: "invalid cross reference id" }]);
    }
    const id = newId(obj);
    const defaults: Record<string, unknown> =
      obj === "Lead" ? { Status: "Open - Not Contacted", OwnerId: apiUser }
      : obj === "Opportunity" || obj === "Task" ? { OwnerId: apiUser }
      : {};
    tables[obj].push({ ...defaults, ...body, Id: id, _seq: seq });
    return json(201, { id, success: true, errors: [] });
  }

  function update(obj: string, id: string, body: Record<string, unknown>): Response {
    const rec = tables[obj]?.find((r) => r.Id === id);
    if (!rec) return json(404, [{ errorCode: "NOT_FOUND", message: "Provided external ID field does not exist or is not accessible" }]);
    if (typeof body.OwnerId === "string" && !tables.User.some((u) => u.Id === body.OwnerId && u.IsActive)) {
      return json(400, [{ errorCode: "INVALID_CROSS_REFERENCE_KEY", message: "invalid cross reference id" }]);
    }
    Object.assign(rec, body);
    return new Response(null, { status: 204 });
  }

  function describe(obj: string): Response {
    const table = tables[obj];
    if (!table) return json(404, [{ errorCode: "NOT_FOUND", message: "The requested resource does not exist" }]);
    const picklist = (values: string[]) => values.map((value) => ({ value, active: true }));
    const fields: { name: string; picklistValues?: { value: string; active: boolean }[] }[] = [{ name: "Id" }];
    if (obj === "Lead") {
      fields.push(
        { name: "Status", picklistValues: picklist(["Open - Not Contacted", "Working - Contacted", "Closed - Converted", "Closed - Not Converted"]) },
        { name: "Rating", picklistValues: picklist(["Hot", "Warm", "Cold"]) },
      );
    }
    if (obj === "Opportunity") {
      fields.push({
        name: "StageName",
        picklistValues: picklist(["Prospecting", "Qualification", "Needs Analysis", "Proposal/Price Quote", "Negotiation/Review", "Closed Won", "Closed Lost"]),
      });
    }
    if (obj === "Campaign") fields.push({ name: "Status", picklistValues: picklist(["Planned", "In Progress", "Completed", "Aborted"]) });
    return json(200, { name: obj, createable: !state.noCreate.has(obj), updateable: true, queryable: true, fields });
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const path = `${url.pathname}${url.search}`;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    state.requests.push({ method, path, body });

    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") !== `Bearer ${state.token}`) {
      return json(401, [{ errorCode: "INVALID_SESSION_ID", message: "Session expired or invalid" }]);
    }

    for (const f of state.faults) {
      if ((f.times ?? 1) > 0 && f.when(method, path, body)) {
        f.times = (f.times ?? 1) - 1;
        return f.respond();
      }
    }

    const api = `/services/data/${version}`;
    if (method === "GET" && url.pathname === `${api}/query`) return runQuery(url.searchParams.get("q") ?? "");
    if (method === "GET" && url.pathname === `${api}/limits`) {
      return json(200, { DailyApiRequests: { Max: state.dailyMax, Remaining: state.dailyMax - state.dailyUsed } });
    }
    let m = new RegExp(`^${api}/sobjects/(\\w+)/describe$`).exec(url.pathname);
    if (method === "GET" && m) return describe(m[1]);
    m = new RegExp(`^${api}/sobjects/(\\w+)$`).exec(url.pathname);
    if (method === "POST" && m) return create(m[1], body ?? {});
    m = new RegExp(`^${api}/sobjects/(\\w+)/(\\w+)$`).exec(url.pathname);
    if (method === "PATCH" && m) return update(m[1], m[2], body ?? {});
    return json(404, [{ errorCode: "NOT_FOUND", message: `mock: no route for ${method} ${path}` }]);
  }) as typeof fetch;

  return {
    fetchImpl,
    tables,
    state,
    apiUser,
    addUser,
    /** What a rep would do in the Salesforce UI. */
    edit(obj: string, id: string, patch: Record<string, unknown>) {
      const rec = tables[obj].find((r) => r.Id === id);
      if (!rec) throw new Error(`mock: no ${obj} ${id}`);
      Object.assign(rec, patch);
    },
    remove(obj: string, id: string) {
      tables[obj] = tables[obj].filter((r) => r.Id !== id);
    },
    find(obj: string, pred: (r: Rec) => boolean) {
      return tables[obj].find(pred);
    },
    expireToken() {
      state.token = `expired-${++seq}`;
    },
    fail(fault: Fault) {
      state.faults.push(fault);
    },
    writes() {
      return state.requests.filter((r) => r.method !== "GET");
    },
  };
}
