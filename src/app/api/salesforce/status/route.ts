import { NextResponse } from "next/server";
import { getSalesforceConfig } from "@/lib/salesforce/config";
import { getValidSalesforceSession } from "@/lib/salesforce/client";
import { DEMO_API_USER } from "@/lib/salesforce/demoOrg";

export async function GET() {
  const config = getSalesforceConfig();
  const session = await getValidSalesforceSession();

  return NextResponse.json({
    connected: Boolean(session),
    mode: session?.mode ?? null,
    username: session?.username ?? null,
    displayName: session?.displayName ?? null,
    instanceUrl: session?.instanceUrl ?? null,
    /** The Salesforce user EventMail is connected as (records it creates belong to them). */
    userId: session ? (session.mode === "demo" ? DEMO_API_USER : (session.userId ?? null)) : null,
    oauthConfigured: config.configured,
  });
}
