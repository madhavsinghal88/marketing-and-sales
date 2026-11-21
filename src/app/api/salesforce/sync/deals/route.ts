import { NextRequest, NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { demoDeals } from "@/lib/salesforce/demoOrg";
import { errorResponse, notConnected, readList } from "@/lib/salesforce/routeKit";
import { attachSnapshots } from "@/lib/salesforce/remote";
import { loadSchema, syncDeals } from "@/lib/salesforce/sync";
import type { DealPayload } from "@/lib/salesforce/mapping";

/** Create or update Salesforce Opportunities (and their Accounts) from EventMail deals. */
export async function POST(req: NextRequest) {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();

  const parsed = await readList<DealPayload>(req, "deals", 100);
  if ("response" in parsed) return parsed.response;
  const deals = parsed.items.map((d) => ({
    ...d,
    value: Number.isFinite(d.value) ? d.value : 0,
  }));

  if (ctx.demo) {
    return NextResponse.json({ mode: "demo", results: demoDeals(deals) });
  }

  try {
    const schema = await loadSchema(ctx.rest, ctx.orgKey);
    const results = await attachSnapshots(
      ctx.rest,
      "deal",
      await syncDeals(ctx.rest, schema, deals),
    );
    return NextResponse.json({ mode: "live", results, retries: ctx.rest.stats.retries });
  } catch (e) {
    return errorResponse(e);
  }
}
