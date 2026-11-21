import { NextRequest, NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { demoTasks } from "@/lib/salesforce/demoOrg";
import { errorResponse, notConnected, readList } from "@/lib/salesforce/routeKit";
import { attachSnapshots } from "@/lib/salesforce/remote";
import { loadSchema, syncTasks } from "@/lib/salesforce/sync";
import type { TaskPayload } from "@/lib/salesforce/mapping";

/** Create or update Salesforce Tasks (follow-ups and logged activities) on a lead. */
export async function POST(req: NextRequest) {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();

  const parsed = await readList<TaskPayload>(req, "tasks", 200);
  if ("response" in parsed) return parsed.response;

  if (ctx.demo) {
    return NextResponse.json({ mode: "demo", results: demoTasks(parsed.items) });
  }

  try {
    const schema = await loadSchema(ctx.rest, ctx.orgKey);
    const results = await attachSnapshots(
      ctx.rest,
      "task",
      await syncTasks(ctx.rest, schema, parsed.items),
    );
    return NextResponse.json({ mode: "live", results, retries: ctx.rest.stats.retries });
  } catch (e) {
    return errorResponse(e);
  }
}
