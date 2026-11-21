/**
 * Owner mapping: EventMail owners are plain names; Salesforce owners are User ids.
 * Pure helpers so the browser, the routes and the tests share one definition.
 */
import type { SfUser } from "./remote";

export type OwnerLink = { sfUserId: string; sfName: string; sfEmail?: string };
/** EventMail owner name -> the Salesforce user that owner stands for. */
export type OwnerMap = Record<string, OwnerLink>;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "Last, First" -> "first last" so both spellings match. */
function nameKey(name: string): string {
  const n = norm(name);
  const comma = n.split(",");
  return comma.length === 2 ? `${comma[1].trim()} ${comma[0].trim()}` : n;
}

export function ownerSfIdFor(map: OwnerMap, owner: string): string | undefined {
  return map[owner]?.sfUserId;
}

/** Compare ids by their first 15 chars (the 18-char form only adds a case checksum). */
export function ownerForSfId(map: OwnerMap, sfUserId: string | undefined): string | undefined {
  if (!sfUserId) return undefined;
  const key = sfUserId.slice(0, 15);
  return Object.keys(map).find((o) => map[o].sfUserId.slice(0, 15) === key);
}

/**
 * Link every still-unmapped EventMail owner to the Salesforce user with the same name.
 * Existing links are kept. A Salesforce user is only used once.
 */
export function autoMatchOwners(
  owners: readonly string[],
  users: SfUser[],
  existing: OwnerMap,
): { map: OwnerMap; matched: string[]; unmatched: string[] } {
  const map: OwnerMap = { ...existing };
  const used = new Set(Object.values(map).map((l) => l.sfUserId.slice(0, 15)));
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const owner of owners) {
    if (map[owner]) continue;
    const want = nameKey(owner);
    const hit = users.find((u) => nameKey(u.name) === want && !used.has(u.id.slice(0, 15)));
    if (hit) {
      map[owner] = { sfUserId: hit.id, sfName: hit.name, sfEmail: hit.email || undefined };
      used.add(hit.id.slice(0, 15));
      matched.push(owner);
    } else {
      unmatched.push(owner);
    }
  }
  return { map, matched, unmatched };
}
