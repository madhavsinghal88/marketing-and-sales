/**
 * Minimal Salesforce REST client. Framework-free (no Next imports) so it can be
 * tested against a mock server.
 *
 * Hardening: every request has a timeout, transient failures are retried with backoff
 * (honouring Retry-After), and a dead access token is refreshed once.
 */

export class SalesforceApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "SalesforceApiError";
    this.status = status;
    this.code = code;
  }
}

export type RestOptions = {
  instanceUrl: string;
  accessToken: string;
  apiVersion: string;
  /** Called once after a 401 to get a fresh access token (or null if impossible). */
  refresh?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** Retries after the first attempt for transient failures (default 3). */
  maxRetries?: number;
  /** Per-request timeout in ms (default 30s). */
  timeoutMs?: number;
  /** Injected so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
};

export type RestStats = { requests: number; retries: number };

export type SfRest = {
  query: <T = Record<string, unknown>>(soql: string) => Promise<T[]>;
  create: (sobject: string, body: Record<string, unknown>) => Promise<string>;
  update: (
    sobject: string,
    id: string,
    body: Record<string, unknown>,
  ) => Promise<void>;
  describe: (sobject: string) => Promise<DescribeResult>;
  /** Org API usage ("limits" resource). */
  limits: () => Promise<OrgLimits>;
  /** Counters for the current client (one per request batch). */
  stats: RestStats;
};

export type DescribeResult = {
  createable?: boolean;
  updateable?: boolean;
  queryable?: boolean;
  fields: {
    name: string;
    picklistValues?: { value: string; active?: boolean }[];
  }[];
};

export type OrgLimits = {
  DailyApiRequests?: { Max: number; Remaining: number };
} & Record<string, unknown>;

/** Escape a value for use inside a single-quoted SOQL string literal. */
export function soql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Error codes that mean "the same request will probably work in a moment". */
const RETRYABLE_CODES = new Set(["UNABLE_TO_LOCK_ROW", "SERVER_UNAVAILABLE"]);

export function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 10_000);
  }
  const base = 400 * 2 ** attempt; // 400, 800, 1600
  return Math.min(base + Math.floor(Math.random() * 200), 8_000);
}

export function createRest(opts: RestOptions): SfRest {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.instanceUrl.replace(/\/+$/, "");
  const api = `/services/data/${opts.apiVersion}`;
  const maxRetries = opts.maxRetries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const stats: RestStats = { requests: 0, retries: 0 };
  let token = opts.accessToken;

  async function request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const send = async (): Promise<Response> => {
      stats.requests += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await doFetch(`${base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
            // Our own email-based matching decides duplicates, so don't let the org's
            // standard duplicate rule block saves (it would raise DUPLICATES_DETECTED).
            ...(method !== "GET"
              ? { "Sforce-Duplicate-Rule-Header": "allowSave=true" }
              : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let refreshed = false;
    for (let attempt = 0; ; attempt += 1) {
      const canRetry = attempt < maxRetries;
      let res: Response;
      try {
        res = await send();
      } catch (e) {
        // The request may or may not have reached Salesforce. Retrying a read is always
        // safe; retrying a write could create a duplicate, so writes fail instead.
        if (method === "GET" && canRetry) {
          stats.retries += 1;
          await sleep(backoffMs(attempt, null));
          continue;
        }
        const timedOut = e instanceof Error && e.name === "AbortError";
        throw new SalesforceApiError(
          timedOut
            ? "Salesforce did not answer in time."
            : "Could not reach Salesforce (network error).",
          0,
          timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        );
      }

      if (res.status === 401 && opts.refresh && !refreshed) {
        refreshed = true;
        const fresh = await opts.refresh();
        if (fresh) {
          token = fresh;
          attempt -= 1; // a token refresh is not a retry
          continue;
        }
      }

      // 429/503 mean "slow down / not now": nothing was processed, so even writes may retry.
      // 502/504 are ambiguous for writes, so only reads retry on those.
      const safeToRetry =
        res.status === 429 ||
        res.status === 503 ||
        (method === "GET" && (res.status === 502 || res.status === 504));
      if (safeToRetry && canRetry) {
        stats.retries += 1;
        await sleep(backoffMs(attempt, res.headers.get("Retry-After")));
        continue;
      }

      if (res.status === 204) return null;

      const text = await res.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!res.ok) {
        const first = Array.isArray(data) ? (data[0] as Record<string, unknown>) : null;
        const code = String(first?.errorCode ?? `HTTP_${res.status}`);
        if (RETRYABLE_CODES.has(code) && canRetry) {
          stats.retries += 1;
          await sleep(backoffMs(attempt, res.headers.get("Retry-After")));
          continue;
        }
        throw new SalesforceApiError(
          String(first?.message ?? (typeof data === "string" ? data : "") ?? "").slice(0, 300) ||
            `Salesforce request failed (${res.status})`,
          res.status,
          code,
        );
      }
      return data;
    }
  }

  return {
    stats,
    async query<T>(q: string) {
      const data = (await request(
        "GET",
        `${api}/query?q=${encodeURIComponent(q)}`,
      )) as { records?: T[] };
      return data.records ?? [];
    },
    async create(sobject, body) {
      const data = (await request("POST", `${api}/sobjects/${sobject}`, body)) as {
        id: string;
      };
      return data.id;
    },
    async update(sobject, id, body) {
      await request("PATCH", `${api}/sobjects/${sobject}/${id}`, body);
    },
    async describe(sobject) {
      return (await request(
        "GET",
        `${api}/sobjects/${sobject}/describe`,
      )) as DescribeResult;
    },
    async limits() {
      return (await request("GET", `${api}/limits`)) as OrgLimits;
    },
  };
}
