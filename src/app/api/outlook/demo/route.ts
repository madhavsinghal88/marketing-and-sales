import { NextResponse } from "next/server";
import { writeOutlookSession } from "@/lib/outlook/session";

/** Connect a simulated Outlook mailbox when Azure app credentials are not set. */
export async function POST() {
  await writeOutlookSession({
    mode: "demo",
    mailbox: "marketing@eventmail.app",
    displayName: "EventMail Demo",
  });

  return NextResponse.json({
    ok: true,
    mode: "demo",
    mailbox: "marketing@eventmail.app",
  });
}
