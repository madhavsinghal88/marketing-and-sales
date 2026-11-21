import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getSalesforceConfig,
  SALESFORCE_SCOPES,
} from "@/lib/salesforce/config";

// Must match the cookie names read in ../callback/route.ts
const SF_STATE_COOKIE = "eventmail_sf_state";
const SF_PKCE_COOKIE = "eventmail_sf_pkce";

export async function GET() {
  const config = getSalesforceConfig();

  if (!config.configured) {
    return NextResponse.json(
      {
        error:
          "Salesforce OAuth is not configured. Use demo connect or set SALESFORCE_CLIENT_ID / SALESFORCE_CLIENT_SECRET.",
        demoAvailable: true,
      },
      { status: 400 },
    );
  }

  const state = randomBytes(16).toString("hex");
  // PKCE: keep the random verifier server-side (cookie), send only its hash to Salesforce.
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const jar = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  jar.set(SF_STATE_COOKIE, state, cookieOpts);
  jar.set(SF_PKCE_COOKIE, verifier, cookieOpts);

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", SALESFORCE_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(url.toString());
}
