import { NextRequest, NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { demoCampaign, errorResponse, notConnected } from "@/lib/salesforce/routeKit";
import { loadSchema, syncCampaign } from "@/lib/salesforce/sync";
import type { CampaignPayload } from "@/lib/salesforce/mapping";

/** Create or update one Salesforce Campaign for an event, and add the event's leads to it. */
export async function POST(req: NextRequest) {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();

  let body: { event?: CampaignPayload };
  try {
    body = (await req.json()) as { event?: CampaignPayload };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const event = body.event;
  if (!event || typeof event.key !== "string" || !event.name || !Array.isArray(event.members)) {
    return NextResponse.json({ error: "event with key, name and members is required" }, { status: 400 });
  }
  if (event.members.length > 500) {
    return NextResponse.json({ error: "At most 500 members per campaign sync" }, { status: 400 });
  }

  if (ctx.demo) return NextResponse.json({ mode: "demo", result: demoCampaign(event) });

  try {
    const schema = await loadSchema(ctx.rest, ctx.orgKey);
    const result = await syncCampaign(ctx.rest, schema, event);
    return NextResponse.json({ mode: "live", result });
  } catch (e) {
    return errorResponse(e);
  }
}
