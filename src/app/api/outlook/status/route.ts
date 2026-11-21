import { NextResponse } from "next/server";
import { getOutlookConfig } from "@/lib/outlook/config";
import { getValidSession } from "@/lib/outlook/graph";

export async function GET() {
  const config = getOutlookConfig();
  const session = await getValidSession();

  return NextResponse.json({
    connected: Boolean(session),
    mode: session?.mode ?? null,
    mailbox: session?.mailbox ?? null,
    displayName: session?.displayName ?? null,
    canRead: Boolean(session?.canRead),
    oauthConfigured: config.configured,
  });
}
