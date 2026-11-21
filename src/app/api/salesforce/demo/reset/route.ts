import { NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { resetDemoOrg } from "@/lib/salesforce/demoOrg";
import { notConnected } from "@/lib/salesforce/routeKit";

/** Demo mode only: empty the pretend Salesforce so a walkthrough can start from scratch. */
export async function POST() {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();
  if (!ctx.demo) {
    return NextResponse.json({ error: "Only available in demo mode." }, { status: 400 });
  }
  resetDemoOrg();
  return NextResponse.json({ ok: true });
}
