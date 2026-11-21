import { NextRequest, NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { demoFetch, type DemoPullItem } from "@/lib/salesforce/demoOrg";
import { errorResponse, notConnected } from "@/lib/salesforce/routeKit";
import { fetchRemote, type RemoteKind } from "@/lib/salesforce/remote";

const KINDS = new Set<RemoteKind>(["lead", "deal", "task"]);

/**
 * Read what Salesforce holds now for records EventMail pushed earlier, so changes made by
 * reps can flow back. Read-only: nothing is written to Salesforce here. The browser decides
 * what to apply (see lib/salesforce/reconcile.ts).
 */
export async function POST(req: NextRequest) {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();

  let body: { items?: DemoPullItem[] };
  try {
    body = (await req.json()) as { items?: DemoPullItem[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items is required" }, { status: 400 });
  }
  if (items.length > 1000) {
    return NextResponse.json({ error: "Pull at most 1000 records at a time" }, { status: 400 });
  }
  if (
    items.some(
      (i) => !i || !KINDS.has(i.kind) || typeof i.key !== "string" || typeof i.sfId !== "string",
    )
  ) {
    return NextResponse.json({ error: "Every item needs kind, key and sfId" }, { status: 400 });
  }

  const pulledAt = new Date().toISOString();
  if (ctx.demo) {
    return NextResponse.json({ mode: "demo", pulledAt, ...demoFetch(items) });
  }

  try {
    const result = await fetchRemote(ctx.rest, items);
    return NextResponse.json({
      mode: "live",
      pulledAt,
      ...result,
      retries: ctx.rest.stats.retries,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
