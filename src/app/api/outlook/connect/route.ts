import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getOutlookConfig,
  OUTLOOK_SCOPES,
  OUTLOOK_TRACKING_SCOPES,
} from "@/lib/outlook/config";

export async function GET(req: NextRequest) {
  const config = getOutlookConfig();
  // ?tracking=1 asks for the extra Mail.Read permission used by delivery checks.
  const tracking = req.nextUrl.searchParams.get("tracking") === "1";

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

  // Remembered for the callback so the token request asks for the same scopes.
  if (tracking) {
    jar.set("eventmail_oauth_tracking", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  } else {
    jar.delete("eventmail_oauth_tracking");
  }

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set(
    "scope",
    tracking ? OUTLOOK_TRACKING_SCOPES : OUTLOOK_SCOPES,
  );
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
