/**
 * Push EventMail data into Salesforce. Framework-free: everything goes through the
 * injected `SfRest`, so it can be tested against a mock Salesforce.
 *
 * Rules that apply to every object:
 *  - find the existing record first (email / name / lookup) so re-syncing UPDATES
 *    instead of creating duplicates;
 *  - one bad record never stops the batch: each gets its own ok / error result;
 *  - only a 401 (expired session) aborts the whole batch.
 */
import { SalesforceApiError, soql, type SfRest } from "./rest";
import {
  buildSchema,
  campaignStatusFor,
  closeDateFor,
  cleanCompany,
  dueDateFor,
  isValidEmail,
  newLeadBody,
  leadUpdateBody,
  oppStageFor,
  sameSfId,
  heldMessage,
  opportunityDescription,
  opportunityName,
  taskStatusFor,
  truncate,
  DEFAULT_SCHEMA,
  type CampaignPayload,
  type DealPayload,
  type ExistingLead,
  type HeldField,
  type LeadPayload,
  type SfSchema,
  type SyncResult,
  type TaskPayload,
} from "./mapping";

export type CampaignResult = SyncResult & {
  stats?: { added: number; alreadyMembers: number; missingLeads: number; failed: number };
};

const SF_ID = /^[a-zA-Z0-9]{15,18}$/;

/* ——— Errors ——— */

export function friendlyError(e: unknown): string {
  if (e instanceof SalesforceApiError) {
    switch (e.code) {
      case "REQUEST_LIMIT_EXCEEDED":
        return "Salesforce API limit reached. Try again later.";
      case "INVALID_SESSION_ID":
      case "HTTP_401":
        return "Salesforce session expired. Reconnect Salesforce and try again.";
      case "INSUFFICIENT_ACCESS_OR_READONLY":
      case "INSUFFICIENT_ACCESS":
      case "INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY":
        return `Your Salesforce user lacks permission for this: ${e.message}`;
      case "INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST":
        return `A value is not allowed by a restricted picklist in your org: ${e.message}`;
      case "INVALID_FIELD":
      case "INVALID_FIELD_FOR_INSERT_UPDATE":
        return `Salesforce rejected a field: ${e.message}`;
      case "INVALID_CROSS_REFERENCE_KEY":
        return `Salesforce rejected a linked record (for example an inactive or unknown owner). Check Owner mapping. ${e.message}`;
      case "REQUIRED_FIELD_MISSING":
        return `Your org requires a field EventMail does not send: ${e.message}`;
      case "FIELD_CUSTOM_VALIDATION_EXCEPTION":
        return `A validation rule in your org blocked this save: ${e.message}`;
      case "STRING_TOO_LONG":
        return `A value is too long for its Salesforce field: ${e.message}`;
      case "DUPLICATES_DETECTED":
        return `Salesforce flagged a duplicate: ${e.message}`;
      case "UNABLE_TO_LOCK_ROW":
        return "The record was locked by another Salesforce process. Try again in a moment.";
      case "STORAGE_LIMIT_EXCEEDED":
        return "Your Salesforce org is out of data storage.";
      case "NETWORK_ERROR":
      case "TIMEOUT":
        return `${e.message} Try again.`;
      case "HTTP_429":
      case "HTTP_503":
      case "SERVER_UNAVAILABLE":
        return "Salesforce is busy right now. Try again in a minute.";
      default:
        return `${e.code}: ${e.message}`;
    }
  }
  return e instanceof Error ? e.message : "Unknown error";
}

function rethrowIfSessionDead(e: unknown): void {
  if (e instanceof SalesforceApiError && e.status === 401) throw e;
}

/** Run fn over groups concurrently, but each group's items strictly in order. */
async function runGroups<T, R>(
  items: T[],
  groupOf: (item: T) => string,
  fn: (item: T) => Promise<R>,
  limit = 4,
): Promise<Map<T, R>> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = groupOf(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  const queue = [...groups.values()];
  const out = new Map<T, R>();
  async function worker() {
    for (let g = queue.shift(); g; g = queue.shift()) {
      for (const item of g) out.set(item, await fn(item));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
  return out;
}

/* ——— Schema (what this org supports) ——— */

const schemaCache = new Map<string, { at: number; schema: SfSchema }>();
const SCHEMA_TTL_MS = 5 * 60_000;

export async function loadSchema(
  rest: SfRest,
  orgKey: string,
  force = false,
): Promise<SfSchema> {
  const hit = schemaCache.get(orgKey);
  if (!force && hit && Date.now() - hit.at < SCHEMA_TTL_MS) return hit.schema;

  const safe = async (name: string) => {
    try {
      return await rest.describe(name);
    } catch (e) {
      rethrowIfSessionDead(e);
      return null;
    }
  };
  const [lead, opp, campaign] = await Promise.all([
    safe("Lead"),
    safe("Opportunity"),
    safe("Campaign"),
  ]);
  const schema = lead || opp || campaign ? buildSchema(lead, opp, campaign) : DEFAULT_SCHEMA;
  schemaCache.set(orgKey, { at: Date.now(), schema });
  return schema;
}

export function clearSchemaCache(): void {
  schemaCache.clear();
}

/* ——— Leads ——— */

async function findLead(rest: SfRest, email: string): Promise<ExistingLead | undefined> {
  const rows = await rest.query<ExistingLead>(
    `SELECT Id, Status, Title, Company, IsConverted, OwnerId FROM Lead WHERE Email = '${soql(email)}' ORDER BY CreatedDate DESC LIMIT 1`,
  );
  return rows[0];
}

export async function syncLeads(
  rest: SfRest,
  schema: SfSchema,
  leads: LeadPayload[],
): Promise<SyncResult[]> {
  const results = await runGroups(
    leads,
    (l) => l.email.trim().toLowerCase(), // same person in two events -> processed in order
    async (p): Promise<SyncResult> => {
      if (!isValidEmail(p.email)) {
        return { key: p.key, ok: false, error: "This lead has no valid email address." };
      }
      const email = p.email.trim().toLowerCase();
      try {
        const existing = await findLead(rest, email);
        if (existing) {
          if (existing.IsConverted) {
            return {
              key: p.key,
              ok: true,
              sfId: existing.Id,
              action: "skipped",
              note: "Already converted in Salesforce, left unchanged.",
            };
          }
          const body = leadUpdateBody(p, existing, schema);
          await rest.update("Lead", existing.Id, body);
          const wrote: SyncResult["wrote"] = [];
          if ("Status" in body) wrote.push("status");
          if ("OwnerId" in body) wrote.push("owner");
          const heldFields: HeldField[] =
            p.ownerSfId && p.writeOwner && !("OwnerId" in body) ? ["owner"] : [];
          return {
            key: p.key,
            ok: true,
            sfId: existing.Id,
            action: "updated",
            wrote,
            held: heldMessage(heldFields),
            heldFields,
          };
        }
        const id = await rest.create("Lead", newLeadBody(p, schema));
        return { key: p.key, ok: true, sfId: id, action: "created" };
      } catch (e) {
        rethrowIfSessionDead(e);
        return { key: p.key, ok: false, error: friendlyError(e) };
      }
    },
  );
  return leads.map((l) => results.get(l)!);
}

/* ——— Accounts + Opportunities ——— */

/**
 * Cache the in-flight promise (not the finished id): deals for the same company run in
 * parallel, and caching only the result would let each of them create its own Account.
 */
function ensureAccount(
  rest: SfRest,
  company: string,
  cache: Map<string, Promise<string>>,
): Promise<string | undefined> {
  const name = cleanCompany(company);
  if (name === "Not provided") return Promise.resolve(undefined);
  const key = name.toLowerCase();
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const rows = await rest.query<{ Id: string }>(
        `SELECT Id FROM Account WHERE Name = '${soql(name)}' ORDER BY CreatedDate ASC LIMIT 1`,
      );
      return rows[0]?.Id ?? (await rest.create("Account", { Name: name }));
    })();
    cache.set(key, pending);
    // If it fails, forget it so a later deal can retry.
    pending.catch(() => cache.delete(key));
  }
  return pending;
}

export async function syncDeals(
  rest: SfRest,
  schema: SfSchema,
  deals: DealPayload[],
  now = new Date(),
): Promise<SyncResult[]> {
  const accounts = new Map<string, Promise<string>>();
  const results = await runGroups(
    deals,
    (d) => opportunityName(d).toLowerCase(),
    async (p): Promise<SyncResult> => {
      try {
        const name = opportunityName(p);
        const stageName = oppStageFor(p.stage, schema);
        const existing = (
          await rest.query<{
            Id: string;
            IsClosed?: boolean;
            StageName?: string | null;
            OwnerId?: string | null;
          }>(
            `SELECT Id, IsClosed, StageName, OwnerId FROM Opportunity WHERE Name = '${soql(name)}' ORDER BY CreatedDate DESC LIMIT 1`,
          )
        )[0];

        if (existing) {
          if (existing.IsClosed) {
            return {
              key: p.key,
              ok: true,
              sfId: existing.Id,
              action: "skipped",
              note: "Already closed in Salesforce, left unchanged.",
            };
          }
          // A stage or owner a rep set in Salesforce stands: EventMail only overwrites what
          // it changed itself, and only if Salesforce still holds what we last saw there.
          const writeStage =
            p.writeStage !== false &&
            (p.baselineStage === undefined || existing.StageName === p.baselineStage);
          const writeOwner = Boolean(
            p.ownerSfId &&
              p.writeOwner &&
              (p.baselineOwnerId === undefined || sameSfId(existing.OwnerId, p.baselineOwnerId)),
          );
          await rest.update("Opportunity", existing.Id, {
            ...(writeStage ? { StageName: stageName } : {}),
            Amount: p.value,
            Description: opportunityDescription(p),
            ...(writeOwner ? { OwnerId: p.ownerSfId } : {}),
          });
          const wrote: SyncResult["wrote"] = [];
          if (writeStage) wrote.push("stage");
          if (writeOwner) wrote.push("owner");
          const heldFields: HeldField[] = [];
          if (p.writeStage !== false && !writeStage) heldFields.push("stage");
          if (p.ownerSfId && p.writeOwner && !writeOwner) heldFields.push("owner");
          return {
            key: p.key,
            ok: true,
            sfId: existing.Id,
            action: "updated",
            wrote,
            held: heldMessage(heldFields),
            heldFields,
          };
        }

        const accountId = await ensureAccount(rest, p.company, accounts);
        const id = await rest.create("Opportunity", {
          Name: name,
          StageName: stageName,
          CloseDate: closeDateFor(p.stage, p.closeLabel, now),
          Amount: p.value,
          Description: opportunityDescription(p),
          ...(accountId ? { AccountId: accountId } : {}),
          ...(p.ownerSfId ? { OwnerId: p.ownerSfId } : {}),
        });
        return { key: p.key, ok: true, sfId: id, action: "created" };
      } catch (e) {
        rethrowIfSessionDead(e);
        return { key: p.key, ok: false, error: friendlyError(e) };
      }
    },
  );
  return deals.map((d) => results.get(d)!);
}

/* ——— Tasks (follow-ups and logged activities) ——— */

async function leadIdsByEmail(
  rest: SfRest,
  emails: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(isValidEmail))];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const list = chunk.map((e) => `'${soql(e)}'`).join(",");
    const rows = await rest.query<{ Id: string; Email: string }>(
      `SELECT Id, Email FROM Lead WHERE Email IN (${list}) AND IsConverted = false ORDER BY CreatedDate ASC`,
    );
    for (const r of rows) map.set(r.Email.toLowerCase(), r.Id); // newest wins (ordered ASC)
  }
  return map;
}

export async function syncTasks(
  rest: SfRest,
  _schema: SfSchema,
  tasks: TaskPayload[],
  now = new Date(),
): Promise<SyncResult[]> {
  const needLookup = tasks.filter((t) => !t.leadSfId || !SF_ID.test(t.leadSfId));
  const looked = await leadIdsByEmail(rest, needLookup.map((t) => t.leadEmail));

  const results = await runGroups(
    tasks,
    (t) => t.leadEmail.toLowerCase(),
    async (p): Promise<SyncResult> => {
      const whoId =
        p.leadSfId && SF_ID.test(p.leadSfId)
          ? p.leadSfId
          : looked.get(p.leadEmail.trim().toLowerCase());
      if (!whoId) {
        return {
          key: p.key,
          ok: false,
          error: "This lead is not in Salesforce yet. Sync the lead first.",
        };
      }
      try {
        const subject = truncate(p.subject, 255);
        const fields: Record<string, unknown> = {
          Subject: subject,
          Description: p.description,
          Priority: p.priority,
          ActivityDate: dueDateFor(p.dueLabel, now),
        };
        const status = taskStatusFor(p.done);
        const existing = (
          await rest.query<{ Id: string; Status?: string | null; OwnerId?: string | null }>(
            `SELECT Id, Status, OwnerId FROM Task WHERE WhoId = '${whoId}' AND Subject = '${soql(subject)}' ORDER BY CreatedDate DESC LIMIT 1`,
          )
        )[0];
        if (existing) {
          const writeStatus =
            p.writeStatus !== false &&
            (p.baselineStatus === undefined || existing.Status === p.baselineStatus);
          const writeOwner = Boolean(
            p.ownerSfId &&
              p.writeOwner &&
              (p.baselineOwnerId === undefined || sameSfId(existing.OwnerId, p.baselineOwnerId)),
          );
          await rest.update("Task", existing.Id, {
            ...fields,
            ...(writeStatus ? { Status: status } : {}),
            ...(writeOwner ? { OwnerId: p.ownerSfId } : {}),
          });
          const wrote: SyncResult["wrote"] = [];
          if (writeStatus) wrote.push("taskStatus");
          if (writeOwner) wrote.push("owner");
          const heldFields: HeldField[] = [];
          if (p.writeStatus !== false && !writeStatus) heldFields.push("done");
          if (p.ownerSfId && p.writeOwner && !writeOwner) heldFields.push("owner");
          return {
            key: p.key,
            ok: true,
            sfId: existing.Id,
            action: "updated",
            wrote,
            held: heldMessage(heldFields),
            heldFields,
          };
        }
        const id = await rest.create("Task", {
          ...fields,
          Status: status,
          WhoId: whoId,
          ...(p.ownerSfId ? { OwnerId: p.ownerSfId } : {}),
        });
        return { key: p.key, ok: true, sfId: id, action: "created" };
      } catch (e) {
        rethrowIfSessionDead(e);
        return { key: p.key, ok: false, error: friendlyError(e) };
      }
    },
  );
  return tasks.map((t) => results.get(t)!);
}

/* ——— Campaign (an event) + its members (the event's leads) ——— */

export async function syncCampaign(
  rest: SfRest,
  schema: SfSchema,
  event: CampaignPayload,
): Promise<CampaignResult> {
  let campaignId: string;
  let action: "created" | "updated";
  try {
    const status = campaignStatusFor(event.status, schema);
    const existing = (
      await rest.query<{ Id: string }>(
        `SELECT Id FROM Campaign WHERE Name = '${soql(truncate(event.name, 80))}' ORDER BY CreatedDate DESC LIMIT 1`,
      )
    )[0];
    if (existing) {
      campaignId = existing.Id;
      action = "updated";
      if (status) await rest.update("Campaign", campaignId, { Status: status });
    } else {
      campaignId = await rest.create("Campaign", {
        Name: truncate(event.name, 80),
        IsActive: true,
        ...(status ? { Status: status } : {}),
      });
      action = "created";
    }
  } catch (e) {
    rethrowIfSessionDead(e);
    const denied =
      e instanceof SalesforceApiError &&
      (e.code.startsWith("INSUFFICIENT_ACCESS") ||
        e.code === "INVALID_TYPE" ||
        e.code === "NOT_FOUND");
    return {
      key: event.key,
      ok: false,
      error: denied
        ? "Your Salesforce user cannot create Campaigns. In Salesforce open Setup, Users, edit your user and tick \"Marketing User\", then try again."
        : friendlyError(e),
    };
  }

  try {
    const needLookup = event.members.filter((m) => !m.leadSfId || !SF_ID.test(m.leadSfId));
    const looked = await leadIdsByEmail(rest, needLookup.map((m) => m.email));
    const leadIds = new Map<string, string>(); // leadKey -> Salesforce lead id
    let missing = 0;
    for (const m of event.members) {
      const id =
        m.leadSfId && SF_ID.test(m.leadSfId) ? m.leadSfId : looked.get(m.email.trim().toLowerCase());
      if (id) leadIds.set(m.leadKey, id);
      else missing += 1;
    }

    const already = new Set(
      (
        await rest.query<{ LeadId: string | null }>(
          `SELECT LeadId FROM CampaignMember WHERE CampaignId = '${campaignId}'`,
        )
      )
        .map((r) => r.LeadId)
        .filter((x): x is string => Boolean(x))
        .map((x) => x.slice(0, 15)),
    );

    const toAdd = [...new Set(leadIds.values())].filter((id) => !already.has(id.slice(0, 15)));
    let added = 0;
    let failed = 0;
    for (let i = 0; i < toAdd.length; i += 4) {
      const batch = toAdd.slice(i, i + 4);
      const outcomes = await Promise.all(
        batch.map(async (leadId) => {
          try {
            await rest.create("CampaignMember", { CampaignId: campaignId, LeadId: leadId });
            return true;
          } catch (e) {
            rethrowIfSessionDead(e);
            // A duplicate means someone added them in the meantime: fine.
            return e instanceof SalesforceApiError && e.code === "DUPLICATE_VALUE";
          }
        }),
      );
      added += outcomes.filter(Boolean).length;
      failed += outcomes.filter((o) => !o).length;
    }

    const alreadyMembers = new Set(leadIds.values()).size - toAdd.length;
    const stats = { added, alreadyMembers, missingLeads: missing, failed };
    return {
      key: event.key,
      ok: failed === 0,
      sfId: campaignId,
      action,
      stats,
      note: `${added} added, ${alreadyMembers} already in campaign${missing ? `, ${missing} not in Salesforce yet` : ""}`,
      error: failed ? `${failed} member(s) could not be added.` : undefined,
    };
  } catch (e) {
    rethrowIfSessionDead(e);
    return {
      key: event.key,
      ok: false,
      sfId: campaignId,
      action,
      error: `Campaign saved, but adding members failed: ${friendlyError(e)}`,
    };
  }
}
