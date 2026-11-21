import type { DeliveryInfo, DeliveryStatus, SequenceDay } from "../types";

/**
 * Microsoft Graph's sendMail returns an empty "202 Accepted", so it never tells us
 * whether the mail arrived. What we CAN verify from the sender's own mailbox:
 *   1. the message really is in Sent Items (Outlook accepted and sent it), and
 *   2. no "Undeliverable" bounce (NDR) came back for that recipient.
 * Neither proves the recipient opened it, so the UI also offers a manual
 * "Confirm received" for the one thing only a human can see: their inbox.
 */

export type GraphMessage = {
  subject?: string | null;
  from?: {
    emailAddress?: { address?: string | null; name?: string | null };
  } | null;
  toRecipients?: { emailAddress?: { address?: string | null } }[] | null;
  sentDateTime?: string | null;
  receivedDateTime?: string | null;
  bodyPreview?: string | null;
};

export type DeliveryCheckInput = {
  id: string;
  email: string;
  subject: string;
  sentAt: string; // ISO
};

export type DeliveryCheckResult = {
  id: string;
  status: DeliveryStatus;
  detail: string;
  checkedAt: string;
};

/** Delivery record stored on the participant right after a successful send. */
export function initialDelivery(
  row: { subject?: string; sentAt?: string; demo?: boolean },
  day: SequenceDay,
): DeliveryInfo | undefined {
  if (!row.subject || !row.sentAt) return undefined;
  return row.demo
    ? {
        status: "unverified",
        day,
        subject: row.subject,
        sentAt: row.sentAt,
        demo: true,
        detail: "Demo mode: no real email was sent.",
      }
    : {
        status: "awaiting",
        day,
        subject: row.subject,
        sentAt: row.sentAt,
        detail: "Accepted by Outlook. Delivery not checked yet.",
      };
}

/** Bounces usually land within seconds; wait this long before saying "delivered". */
export const BOUNCE_WAIT_MS = 2 * 60 * 1000;

const NDR_SUBJECT =
  /undeliver|delivery (has )?failed|delivery status notification|returned mail|mail delivery (failed|subsystem)|couldn.?t be delivered|could not be delivered|not delivered|failure notice/i;
const NDR_SENDER = /postmaster|mailer-daemon|microsoftexchange|mail delivery/i;

function lower(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export function isBounceFor(
  message: GraphMessage,
  email: string,
  sentAtMs: number,
): boolean {
  if (ms(message.receivedDateTime) < sentAtMs - 60_000) return false;

  const subject = message.subject ?? "";
  const sender = `${lower(message.from?.emailAddress?.address)} ${lower(message.from?.emailAddress?.name)}`;
  const looksLikeNdr = NDR_SUBJECT.test(subject) || NDR_SENDER.test(sender);
  if (!looksLikeNdr) return false;

  const needle = email.trim().toLowerCase();
  return (
    lower(message.bodyPreview).includes(needle) ||
    subject.toLowerCase().includes(needle)
  );
}

export function findSentItem(
  items: GraphMessage[],
  input: DeliveryCheckInput,
): GraphMessage | undefined {
  const email = input.email.trim().toLowerCase();
  const sentAtMs = ms(input.sentAt);
  return items.find((m) => {
    const toMe = (m.toRecipients ?? []).some(
      (r) => lower(r.emailAddress?.address) === email,
    );
    return (
      toMe &&
      (m.subject ?? "") === input.subject &&
      ms(m.sentDateTime) >= sentAtMs - 120_000
    );
  });
}

export function analyzeDelivery(
  input: DeliveryCheckInput,
  sentItems: GraphMessage[],
  inboxItems: GraphMessage[],
  now = new Date(),
): DeliveryCheckResult {
  const checkedAt = now.toISOString();
  const sentAtMs = ms(input.sentAt);

  const bounce = inboxItems.find((m) =>
    isBounceFor(m, input.email, sentAtMs),
  );
  if (bounce) {
    const reason = (bounce.bodyPreview ?? bounce.subject ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    return {
      id: input.id,
      status: "bounced",
      detail: `Bounced: ${reason || "recipient server rejected the message."}`,
      checkedAt,
    };
  }

  const sent = findSentItem(sentItems, input);
  const ageMs = now.getTime() - sentAtMs;

  if (!sent) {
    return ageMs > 10 * 60_000
      ? {
          id: input.id,
          status: "unverified",
          detail:
            "Not found in Sent Items. It may have been deleted, or sent from another mailbox.",
          checkedAt,
        }
      : {
          id: input.id,
          status: "awaiting",
          detail: "Not visible in Sent Items yet. Checking again shortly.",
          checkedAt,
        };
  }

  if (ageMs < BOUNCE_WAIT_MS) {
    return {
      id: input.id,
      status: "awaiting",
      detail: "Sent from Outlook. Waiting to see whether a bounce comes back.",
      checkedAt,
    };
  }

  return {
    id: input.id,
    status: "delivered",
    detail:
      "Sent from Outlook and no bounce came back, so it reached the recipient's mail server.",
    checkedAt,
  };
}

export class GraphReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readFolder(
  accessToken: string,
  graphBase: string,
  folder: "sentitems" | "inbox",
  sinceIso: string,
  fetchImpl: typeof fetch,
): Promise<GraphMessage[]> {
  const dateField = folder === "sentitems" ? "sentDateTime" : "receivedDateTime";
  const params = new URLSearchParams({
    $filter: `${dateField} ge ${sinceIso}`,
    $orderby: `${dateField} desc`,
    $top: "100",
    $select: "subject,from,toRecipients,sentDateTime,receivedDateTime,bodyPreview",
  });

  const res = await fetchImpl(
    // %20 (not "+") for spaces: Graph's OData parser is strictest about that.
    `${graphBase}/me/mailFolders/${folder}/messages?${params.toString().replace(/\+/g, "%20")}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new GraphReadError(
      `Graph ${folder} read failed (${res.status}): ${text.slice(0, 200)}`,
      res.status,
    );
  }
  const data = (await res.json()) as { value?: GraphMessage[] };
  return data.value ?? [];
}

/** Reads Sent Items + Inbox once, then evaluates every check against them. */
export async function checkDeliveries(
  accessToken: string,
  graphBase: string,
  checks: DeliveryCheckInput[],
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryCheckResult[]> {
  if (checks.length === 0) return [];

  const earliest = Math.min(...checks.map((c) => ms(c.sentAt)).filter(Boolean));
  const since = new Date((earliest || now.getTime()) - 5 * 60_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");

  const [sentItems, inboxItems] = await Promise.all([
    readFolder(accessToken, graphBase, "sentitems", since, fetchImpl),
    readFolder(accessToken, graphBase, "inbox", since, fetchImpl),
  ]);

  return checks.map((c) => analyzeDelivery(c, sentItems, inboxItems, now));
}
