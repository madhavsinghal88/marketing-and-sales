import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createSessionStore, type SessionStore } from "../secureStore";

export const SALESFORCE_COOKIE = "eventmail_salesforce";

export type SalesforceSession = {
  mode: "demo" | "live";
  username: string;
  displayName?: string;
  orgId?: string;
  /** Salesforce user id of the connected user (from the OAuth identity URL). */
  userId?: string;
  instanceUrl?: string; // every API call goes here, not to login.salesforce.com
  accessToken?: string;
  refreshToken?: string;
};

function getSecret() {
  return (
    process.env.SALESFORCE_SESSION_SECRET?.trim() ||
    process.env.OUTLOOK_SESSION_SECRET?.trim() ||
    process.env.SALESFORCE_CLIENT_SECRET?.trim() ||
    "eventmail-dev-session-secret-change-me"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

// Tokens are too large for a cookie, so the cookie only carries a signed session id and
// the tokens live server-side in an encrypted store that survives server restarts.
const globalStore = globalThis as unknown as {
  __salesforceSessionStore?: SessionStore<SalesforceSession>;
};
const store = (globalStore.__salesforceSessionStore ??=
  createSessionStore<SalesforceSession>({ name: "salesforce", secret: getSecret() }));

function readSessionId(raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, signature] = raw.split(".");
  if (!id || !signature) return null;
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(sign(id));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return id;
}

export async function readSalesforceSession(): Promise<SalesforceSession | null> {
  const jar = await cookies();
  const id = readSessionId(jar.get(SALESFORCE_COOKIE)?.value);
  return id ? (store.get(id) ?? null) : null;
}

export async function writeSalesforceSession(session: SalesforceSession) {
  const jar = await cookies();
  const id =
    readSessionId(jar.get(SALESFORCE_COOKIE)?.value) ?? randomUUID();
  store.set(id, session);
  jar.set(SALESFORCE_COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSalesforceSession() {
  const jar = await cookies();
  const id = readSessionId(jar.get(SALESFORCE_COOKIE)?.value);
  if (id) store.delete(id);
  jar.delete(SALESFORCE_COOKIE);
}
