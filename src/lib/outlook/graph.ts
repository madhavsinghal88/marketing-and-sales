import { getOutlookConfig } from "./config";
import {
  readOutlookSession,
  writeOutlookSession,
  type OutlookSession,
} from "./session";

export type SendMailInput = {
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
};

export type SendMailResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
  demo?: boolean;
};

async function refreshAccessToken(
  session: OutlookSession,
): Promise<OutlookSession | null> {
  if (!session.refreshToken) return null;
  const config = getOutlookConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    scope: session.canRead
      ? "offline_access User.Read Mail.Send Mail.Read"
      : "offline_access User.Read Mail.Send",
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const next: OutlookSession = {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  await writeOutlookSession(next);
  return next;
}

export async function getValidSession(): Promise<OutlookSession | null> {
  let session = await readOutlookSession();
  if (!session) return null;
  if (session.mode === "demo") return session;

  if (
    session.expiresAt &&
    session.expiresAt < Date.now() + 60_000 &&
    session.refreshToken
  ) {
    session = (await refreshAccessToken(session)) ?? session;
  }

  if (!session.accessToken) return null;
  return session;
}

export async function sendGraphMail(
  session: OutlookSession,
  input: SendMailInput,
): Promise<SendMailResult> {
  if (session.mode === "demo") {
    return {
      ok: true,
      demo: true,
      messageId: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  if (!session.accessToken) {
    return { ok: false, error: "Missing Outlook access token" };
  }

  const res = await fetch(`${getOutlookConfig().graphBase}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: "Text",
          content: input.body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: input.toEmail,
              name: input.toName,
            },
          },
        ],
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `Graph sendMail failed (${res.status}): ${text.slice(0, 240)}`,
    };
  }

  // sendMail returns 202 with empty body; synthesize an id for board tracking
  return {
    ok: true,
    messageId: `graph-${Date.now()}-${input.toEmail}`,
  };
}
