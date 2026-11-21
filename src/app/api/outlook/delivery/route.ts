import { NextRequest, NextResponse } from "next/server";
import { getOutlookConfig } from "@/lib/outlook/config";
import { getValidSession } from "@/lib/outlook/graph";
import {
  checkDeliveries,
  GraphReadError,
  type DeliveryCheckInput,
} from "@/lib/outlook/delivery";

type Body = { checks?: DeliveryCheckInput[] };

/** Checks Sent Items + bounce notices for mails sent earlier through /api/outlook/send. */
export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session) {
    return NextResponse.json(
      { error: "Outlook is not connected" },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const checks = (body.checks ?? []).filter(
    (c) => c && c.id && c.email && c.subject && c.sentAt,
  );
  if (checks.length === 0) {
    return NextResponse.json({ error: "No checks provided" }, { status: 400 });
  }
  if (checks.length > 100) {
    return NextResponse.json(
      { error: "Check at most 100 recipients at a time" },
      { status: 400 },
    );
  }

  const checkedAt = new Date().toISOString();

  // Demo sessions never send real mail, so there is nothing real to verify.
  if (session.mode === "demo") {
    return NextResponse.json({
      mode: "demo",
      canRead: false,
      results: checks.map((c) => ({
        id: c.id,
        status: "unverified",
        detail: "Demo mode: no real email was sent, so there is nothing to verify.",
        checkedAt,
      })),
    });
  }

  if (!session.canRead || !session.accessToken) {
    return NextResponse.json(
      {
        error:
          "Delivery tracking needs the Mail.Read permission. Re-connect Outlook with tracking enabled.",
        needsConsent: true,
      },
      { status: 403 },
    );
  }

  try {
    const results = await checkDeliveries(
      session.accessToken,
      getOutlookConfig().graphBase,
      checks,
    );
    return NextResponse.json({ mode: "live", canRead: true, results });
  } catch (err) {
    if (err instanceof GraphReadError && (err.status === 401 || err.status === 403)) {
      return NextResponse.json(
        {
          error:
            "Outlook rejected the mailbox read. Re-connect Outlook with tracking enabled (an admin may need to approve Mail.Read).",
          needsConsent: true,
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not check delivery right now",
      },
      { status: 502 },
    );
  }
}
