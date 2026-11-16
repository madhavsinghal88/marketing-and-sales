import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getOutlookConfig, OUTLOOK_SCOPES } from "@/lib/outlook/config";
import { writeOutlookSession } from "@/lib/outlook/session";

export async function GET(req: NextRequest) {
  const config = getOutlookConfig();
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/?outlook=error&reason=${encodeURIComponent(error)}`,
    );
  }

  const jar = await cookies();
  const expected = jar.get("eventmail_oauth_state")?.value;
  jar.delete("eventmail_oauth_state");

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${origin}/?outlook=error&reason=invalid_state`);
  }

  const tokenBody = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    scope: OUTLOOK_SCOPES,
  });

  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/?outlook=error&reason=token_exchange`);
  }

  const token = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  let mailbox = "outlook-user";
  let displayName = "Outlook User";
  if (meRes.ok) {
    const me = (await meRes.json()) as {
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };
    mailbox = me.mail || me.userPrincipalName || mailbox;
    displayName = me.displayName || displayName;
  }

  await writeOutlookSession({
    mode: "live",
    mailbox,
    displayName,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  });

  return NextResponse.redirect(`${origin}/?outlook=connected`);
}
