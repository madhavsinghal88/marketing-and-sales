import { NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { demoHealth } from "@/lib/salesforce/demoOrg";
import { notConnected } from "@/lib/salesforce/routeKit";
import { runHealthCheck } from "@/lib/salesforce/remote";

/**
 * Org health check: can the connected user do everything the sync needs?
 * Read-only (describe + query + limits), it never creates a record in the org.
 */
export async function GET() {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();
  if (ctx.demo) return NextResponse.json({ mode: "demo", report: demoHealth() });

  const report = await runHealthCheck(ctx.rest, { userId: ctx.session.userId });
  return NextResponse.json({ mode: "live", report });
}
