import { NextResponse } from "next/server";
import { writeSalesforceSession } from "@/lib/salesforce/session";

/** Connect a simulated Salesforce org when Connected App credentials are not set. */
export async function POST() {
  await writeSalesforceSession({
    mode: "demo",
    username: "demo@eventmail.app",
    displayName: "Salesforce Demo",
  });

  return NextResponse.json({
    ok: true,
    mode: "demo",
    username: "demo@eventmail.app",
  });
}
