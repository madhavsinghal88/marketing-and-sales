import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSalesforceConfig } from "@/lib/salesforce/config";
import { writeSalesforceSession } from "@/lib/salesforce/session";

export async function GET(req: NextRequest) {
  const config = getSalesforceConfig();
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/?salesforce=error&reason=${encodeURIComponent(reason)}`,
    );

  const jar = await cookies();
  const expected = jar.get("eventmail_sf_state")?.value;
  const verifier = jar.get("eventmail_sf_pkce")?.value;
  jar.delete("eventmail_sf_state");
  jar.delete("eventmail_sf_pkce");

  if (error) return fail(error);
  if (!code || !state || !expected || state !== expected || !verifier) {
    return fail("invalid_state");
  }

  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) return fail("token_exchange");

  const token = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    instance_url: string;
    id?: string; // identity URL: https://login.salesforce.com/id/<orgId>/<userId>
  };

  let username = "salesforce-user";
  let displayName = "Salesforce User";
  let orgId: string | undefined;
  // https://login.salesforce.com/id/<orgId>/<userId>
  const userId = token.id?.split("/").filter(Boolean).pop();

  if (token.id) {
    try {
      const idRes = await fetch(token.id, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (idRes.ok) {
        const me = (await idRes.json()) as {
          username?: string;
          display_name?: string;
          organization_id?: string;
        };
        username = me.username || username;
        displayName = me.display_name || displayName;
        orgId = me.organization_id;
      }
    } catch {
      // identity lookup is best-effort; the connection itself is valid
    }
  }

  await writeSalesforceSession({
    mode: "live",
    username,
    displayName,
    orgId,
    userId,
    instanceUrl: token.instance_url,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
  });

  return NextResponse.redirect(`${origin}/?salesforce=connected`);
}
