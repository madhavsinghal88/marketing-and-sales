import { NextRequest, NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { demoSimulate, type DemoChange } from "@/lib/salesforce/demoOrg";
import { notConnected } from "@/lib/salesforce/routeKit";
import type { RemoteSnap } from "@/lib/salesforce/mapping";

/**
 * Demo mode only: act as a Salesforce rep. Changes a record in the pretend org so the
 * "Pull from Salesforce" flow can be shown without a real org.
 */
export async function POST(req: NextRequest) {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();
  if (!ctx.demo) {
    return NextResponse.json(
      { error: "Only available in demo mode. In a live org, make the change in Salesforce itself." },
      { status: 400 },
    );
  }

  let body: { change?: DemoChange; fallback?: RemoteSnap };
  try {
    body = (await req.json()) as { change?: DemoChange; fallback?: RemoteSnap };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const change = body.change;
  if (!change || typeof change.sfId !== "string" || !["lead", "deal", "task"].includes(change.kind)) {
    return NextResponse.json({ error: "change with kind and sfId is required" }, { status: 400 });
  }

  try {
    const snap = demoSimulate(change, body.fallback);
    return NextResponse.json({ ok: true, snapshot: snap });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 404 });
  }
}
