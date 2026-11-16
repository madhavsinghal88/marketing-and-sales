import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

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

export function encodeSession(session: OutlookSession): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(raw: string | undefined): OutlookSession | null {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as OutlookSession;
  } catch {
    return null;
  }
}

export async function readOutlookSession(): Promise<OutlookSession | null> {
  const jar = await cookies();
  return decodeSession(jar.get(OUTLOOK_COOKIE)?.value);
}

export async function writeOutlookSession(session: OutlookSession) {
  const jar = await cookies();
  jar.set(OUTLOOK_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearOutlookSession() {
  const jar = await cookies();
  jar.delete(OUTLOOK_COOKIE);
}
