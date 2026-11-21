import { NextResponse } from "next/server";
import { clearSalesforceSession } from "@/lib/salesforce/session";

export async function POST() {
  await clearSalesforceSession();
  return NextResponse.json({ ok: true });
}
