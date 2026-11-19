import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export const OUTLOOK_COOKIE = "eventmail_outlook";

export type OutlookSession = {
  mode: "demo" | "live";
  mailbox: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  displayName?: string;
};

function getSecret() {
  return (
    process.env.OUTLOOK_SESSION_SECRET?.trim() ||
    process.env.MICROSOFT_CLIENT_SECRET?.trim() ||
    "eventmail-dev-session-secret-change-me"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

// Tokens are too large for a cookie (browsers drop cookies > ~4KB), so they live in
// server memory. The cookie only carries a signed session id. Dev/test setup: sessions
// are lost when the server restarts (just click Connect Outlook again).
const globalStore = globalThis as unknown as {
  __outlookSessions?: Map<string, OutlookSession>;
};
const store = (globalStore.__outlookSessions ??= new Map<string, OutlookSession>());

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

export async function readOutlookSession(): Promise<OutlookSession | null> {
  const jar = await cookies();
  const id = readSessionId(jar.get(OUTLOOK_COOKIE)?.value);
  return id ? (store.get(id) ?? null) : null;
}

export async function writeOutlookSession(session: OutlookSession) {
  const jar = await cookies();
  const id =
    readSessionId(jar.get(OUTLOOK_COOKIE)?.value) ?? randomUUID();
  store.set(id, session);
  jar.set(OUTLOOK_COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearOutlookSession() {
  const jar = await cookies();
  const id = readSessionId(jar.get(OUTLOOK_COOKIE)?.value);
  if (id) store.delete(id);
  jar.delete(OUTLOOK_COOKIE);
}
