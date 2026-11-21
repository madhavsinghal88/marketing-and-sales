import { NextRequest, NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { demoLeads } from "@/lib/salesforce/demoOrg";
import { errorResponse, notConnected, readList } from "@/lib/salesforce/routeKit";
import { attachSnapshots } from "@/lib/salesforce/remote";
import { loadSchema, syncLeads } from "@/lib/salesforce/sync";
import type { LeadPayload } from "@/lib/salesforce/mapping";

/** Create or update Salesforce Leads (matched by email, so no duplicates). */
export async function POST(req: NextRequest) {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();

  const parsed = await readList<LeadPayload>(req, "leads", 100);
  if ("response" in parsed) return parsed.response;

  if (ctx.demo) {
    return NextResponse.json({ mode: "demo", results: demoLeads(parsed.items) });
  }

  try {
    const schema = await loadSchema(ctx.rest, ctx.orgKey);
    const results = await attachSnapshots(
      ctx.rest,
      "lead",
      await syncLeads(ctx.rest, schema, parsed.items),
    );
    return NextResponse.json({ mode: "live", results, retries: ctx.rest.stats.retries });
  } catch (e) {
    return errorResponse(e);
  }
}
