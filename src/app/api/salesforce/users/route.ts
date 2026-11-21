import { NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { DEMO_USERS } from "@/lib/salesforce/demoOrg";
import { errorResponse, notConnected } from "@/lib/salesforce/routeKit";
import { listUsers } from "@/lib/salesforce/remote";

/** Active Salesforce users, for mapping EventMail owners to Salesforce owners. */
export async function GET() {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();
  if (ctx.demo) return NextResponse.json({ mode: "demo", users: DEMO_USERS });

  try {
    return NextResponse.json({ mode: "live", users: await listUsers(ctx.rest) });
  } catch (e) {
    return errorResponse(e);
  }
}
