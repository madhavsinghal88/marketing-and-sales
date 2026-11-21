import { NextRequest, NextResponse } from "next/server";
import { SalesforceApiError } from "./rest";
import { friendlyError, type CampaignResult } from "./sync";
import { hashOf, type CampaignPayload, type SyncResult } from "./mapping";

export const notConnected = () =>
  NextResponse.json({ error: "Salesforce is not connected" }, { status: 401 });

/** Reads `{ [field]: [...] }` from the request, enforcing a size limit. */
export async function readList<T extends { key: string }>(
  req: NextRequest,
  field: string,
  max: number,
): Promise<{ items: T[] } | { response: NextResponse }> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return { response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
  const items = body?.[field];
  if (!Array.isArray(items) || items.length === 0) {
    return { response: NextResponse.json({ error: `${field} is required` }, { status: 400 }) };
  }
  if (items.length > max) {
    return {
      response: NextResponse.json(
        { error: `Send at most ${max} ${field} per request` },
        { status: 400 },
      ),
    };
  }
  if (items.some((i) => !i || typeof (i as { key?: unknown }).key !== "string")) {
    return {
      response: NextResponse.json({ error: `Every item needs a key` }, { status: 400 }),
    };
  }
  return { items: items as T[] };
}

/** A dead session aborts the whole batch; anything else is reported as a gateway error. */
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof SalesforceApiError && e.status === 401) {
    return NextResponse.json(
      { error: "Salesforce session expired. Reconnect Salesforce.", needsReconnect: true },
      { status: 401 },
    );
  }
  return NextResponse.json({ error: friendlyError(e) }, { status: 502 });
}

/** Demo mode never talks to Salesforce: return plausible fake ids so the whole UI can be shown. */
export function demoResults(keys: string[], kind: string): SyncResult[] {
  return keys.map((key) => ({
    key,
    ok: true,
    sfId: `demo-${kind}-${hashOf([key])}`,
    action: "created",
    note: "Demo mode: nothing was sent to Salesforce.",
  }));
}

export function demoCampaign(event: CampaignPayload): CampaignResult {
  return {
    key: event.key,
    ok: true,
    sfId: `demo-campaign-${hashOf([event.key])}`,
    action: "created",
    note: `Demo mode: ${event.members.length} members simulated.`,
    stats: {
      added: event.members.length,
      alreadyMembers: 0,
      missingLeads: 0,
      failed: 0,
    },
  };
}
