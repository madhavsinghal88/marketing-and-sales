import { getSalesforceConfig } from "./config";
import { createRest, type SfRest } from "./rest";
import {
  clearSalesforceSession,
  readSalesforceSession,
  writeSalesforceSession,
  type SalesforceSession,
} from "./session";

export type SalesforceLead = {
  id: string;
  name: string;
  company: string;
  email: string;
  status: string;
};

export type LeadsResult = {
  ok: boolean;
  demo?: boolean;
  leads?: SalesforceLead[];
  error?: string;
};

const DEMO_LEADS: SalesforceLead[] = [
  {
    id: "00Q-demo-1",
    name: "Rahul Mehta",
    company: "Northwind Traders",
    email: "rahul.mehta@northwind.example",
    status: "Open - Not Contacted",
  },
  {
    id: "00Q-demo-2",
    name: "Ananya Iyer",
    company: "Globex Corporation",
    email: "ananya.iyer@globex.example",
    status: "Working - Contacted",
  },
  {
    id: "00Q-demo-3",
    name: "Daniel Okafor",
    company: "Initech",
    email: "daniel.okafor@initech.example",
    status: "Working - Contacted",
  },
  {
    id: "00Q-demo-4",
    name: "Priya Nair",
    company: "Umbrella Labs",
    email: "priya.nair@umbrella.example",
    status: "Open - Not Contacted",
  },
  {
    id: "00Q-demo-5",
    name: "Alex Rivera",
    company: "Stark Industries",
    email: "alex.rivera@stark.example",
    status: "Closed - Converted",
  },
];

/** Exchange the refresh token for a new access token. Salesforce does not rotate it. */
async function refreshAccessToken(
  session: SalesforceSession,
): Promise<SalesforceSession | null> {
  if (!session.refreshToken) return null;
  const config = getSalesforceConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: session.refreshToken,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    // The refresh token itself was rejected (revoked, expired, user disconnected the app).
    // Retrying can never work, so drop the dead session: the UI then shows "disconnected"
    // and asks for a reconnect instead of failing every sync.
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 400 && (err.error === "invalid_grant" || err.error === "inactive_user")) {
      await clearSalesforceSession();
    }
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    instance_url?: string;
  };
  const next: SalesforceSession = {
    ...session,
    accessToken: data.access_token,
    instanceUrl: data.instance_url ?? session.instanceUrl,
  };
  await writeSalesforceSession(next);
  return next;
}

export type SalesforceContext =
  | { demo: true; session: SalesforceSession; orgKey: "demo"; rest: null }
  | { demo: false; session: SalesforceSession; orgKey: string; rest: SfRest };

/** Everything a sync route needs: the session plus a REST client that refreshes itself on 401. */
export async function getSalesforceContext(): Promise<SalesforceContext | null> {
  const session = await getValidSalesforceSession();
  if (!session) return null;
  if (session.mode === "demo") {
    return { demo: true, session, orgKey: "demo", rest: null };
  }

  const { apiVersion } = getSalesforceConfig();
  let current = session;
  const rest = createRest({
    instanceUrl: session.instanceUrl!,
    accessToken: session.accessToken!,
    apiVersion,
    refresh: async () => {
      const next = await refreshAccessToken(current);
      if (!next) return null;
      current = next;
      return next.accessToken ?? null;
    },
  });
  return { demo: false, session, orgKey: session.instanceUrl!, rest };
}

export async function getValidSalesforceSession(): Promise<SalesforceSession | null> {
  const session = await readSalesforceSession();
  if (!session) return null;
  if (session.mode === "demo") return session;
  if (!session.accessToken || !session.instanceUrl) return null;
  return session;
}

/**
 * Call the Salesforce REST API. Salesforce doesn't tell us when an access token
 * expires, so on a 401 we refresh once and retry.
 */
async function sfFetch(
  session: SalesforceSession,
  path: string,
): Promise<{ res: Response; session: SalesforceSession }> {
  const call = (s: SalesforceSession) =>
    fetch(`${s.instanceUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${s.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

  let current = session;
  let res = await call(current);
  if (res.status === 401) {
    const refreshed = await refreshAccessToken(current);
    if (refreshed) {
      current = refreshed;
      res = await call(current);
    }
  }
  return { res, session: current };
}

export async function fetchRecentLeads(
  session: SalesforceSession,
  limit = 5,
): Promise<LeadsResult> {
  if (session.mode === "demo") {
    return { ok: true, demo: true, leads: DEMO_LEADS.slice(0, limit) };
  }
  if (!session.accessToken || !session.instanceUrl) {
    return { ok: false, error: "Missing Salesforce access token" };
  }

  const { apiVersion } = getSalesforceConfig();
  const soql = `SELECT Id, Name, Company, Email, Status FROM Lead ORDER BY CreatedDate DESC LIMIT ${Math.max(1, Math.min(limit, 50))}`;
  const { res } = await sfFetch(
    session,
    `/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`,
  );

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `Salesforce query failed (${res.status}): ${text.slice(0, 240)}`,
    };
  }

  const data = (await res.json()) as {
    records: {
      Id: string;
      Name: string | null;
      Company: string | null;
      Email: string | null;
      Status: string | null;
    }[];
  };

  return {
    ok: true,
    leads: data.records.map((r) => ({
      id: r.Id,
      name: r.Name ?? "",
      company: r.Company ?? "",
      email: r.Email ?? "",
      status: r.Status ?? "",
    })),
  };
}
