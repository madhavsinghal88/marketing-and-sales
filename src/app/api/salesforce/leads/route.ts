import { NextResponse } from "next/server";
import {
  fetchRecentLeads,
  getValidSalesforceSession,
} from "@/lib/salesforce/client";

/** Read-only proof of connection: returns the 5 most recent Salesforce leads. */
export async function GET() {
  const session = await getValidSalesforceSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Salesforce is not connected" },
      { status: 401 },
    );
  }

  const result = await fetchRecentLeads(session, 5);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
