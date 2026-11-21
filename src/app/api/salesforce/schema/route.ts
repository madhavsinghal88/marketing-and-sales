import { NextRequest, NextResponse } from "next/server";
import { getSalesforceContext } from "@/lib/salesforce/client";
import { errorResponse, notConnected } from "@/lib/salesforce/routeKit";
import { loadSchema } from "@/lib/salesforce/sync";
import { CUSTOM_FIELDS } from "@/lib/salesforce/mapping";

/** Reports what this Salesforce org supports (custom fields, picklists) so the UI can show setup status. */
export async function GET(req: NextRequest) {
  const ctx = await getSalesforceContext();
  if (!ctx) return notConnected();

  if (ctx.demo) return NextResponse.json({ mode: "demo", schema: null });

  try {
    const force = req.nextUrl.searchParams.get("refresh") === "1";
    const schema = await loadSchema(ctx.rest, ctx.orgKey, force);
    return NextResponse.json({
      mode: "live",
      schema,
      customFieldNames: CUSTOM_FIELDS,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
