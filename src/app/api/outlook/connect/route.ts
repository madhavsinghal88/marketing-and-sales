import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOutlookConfig, OUTLOOK_SCOPES } from "@/lib/outlook/config";

export async function GET() {
  const config = getOutlookConfig();

  if (!config.configured) {
    return NextResponse.json(
      {
        error:
          "Microsoft OAuth is not configured. Use demo connect or set MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET.",
        demoAvailable: true,
      },
      { status: 400 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("eventmail_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", OUTLOOK_SCOPES);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
