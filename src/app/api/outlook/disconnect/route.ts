import { NextResponse } from "next/server";
import { clearOutlookSession } from "@/lib/outlook/session";

export async function POST() {
  await clearOutlookSession();
  return NextResponse.json({ ok: true });
}
