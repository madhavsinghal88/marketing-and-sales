import { NextRequest, NextResponse } from "next/server";
import { applyMergeFields } from "@/lib/template";
import { getValidSession, sendGraphMail } from "@/lib/outlook/graph";
import type { SequenceDay } from "@/lib/types";

type Recipient = {
  id: string;
  name: string;
  email: string;
};

type SendBody = {
  eventName: string;
  day: SequenceDay;
  template: { subject: string; body: string };
  recipients: Recipient[];
};

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session) {
    return NextResponse.json(
      { error: "Outlook is not connected" },
      { status: 401 },
    );
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body?.eventName ||
    !body?.day ||
    !body?.template?.subject ||
    !Array.isArray(body.recipients) ||
    body.recipients.length === 0
  ) {
    return NextResponse.json(
      { error: "eventName, day, template, and recipients are required" },
      { status: 400 },
    );
  }

  const results = [];
  for (const person of body.recipients) {
    const subject = applyMergeFields(body.template.subject, {
      name: person.name,
      email: person.email,
      event: body.eventName,
    });
    const text = applyMergeFields(body.template.body, {
      name: person.name,
      email: person.email,
      event: body.eventName,
    });

    const sent = await sendGraphMail(session, {
      toEmail: person.email,
      toName: person.name,
      subject,
      body: text,
    });

    results.push({
      id: person.id,
      email: person.email,
      day: body.day,
      ok: sent.ok,
      messageId: sent.messageId,
      error: sent.error,
      demo: sent.demo ?? false,
    });
  }

  const sentCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - sentCount;

  return NextResponse.json({
    mode: session.mode,
    mailbox: session.mailbox,
    sentCount,
    failedCount,
    results,
  });
}
