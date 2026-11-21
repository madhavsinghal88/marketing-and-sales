/**
 * Session store that survives a server restart.
 *
 * OAuth tokens used to live only in server memory, so every restart disconnected Outlook and
 * Salesforce. This keeps the same Map-like API but also writes the sessions to an
 * AES-256-GCM encrypted file (key derived from the session secret) and re-reads it when
 * another server worker changes it.
 *
 * - Not a database: one small file per integration, fine for a single server. For several
 *   servers, put the same interface in front of Postgres/Redis.
 * - If the file cannot be written (read-only host) it silently stays memory-only.
 * - If the secret changes, the old file cannot be decrypted and is treated as empty:
 *   users simply reconnect. Tokens are never written in plain text.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import fs from "fs";
import path from "path";

type Entry<T> = { v: T; at: number };

const MAX_AGE_MS = 35 * 24 * 60 * 60 * 1000; // cookies last 30 days

export type SessionStore<T> = {
  get: (id: string) => T | undefined;
  set: (id: string, value: T) => void;
  delete: (id: string) => void;
  /** Where the encrypted file lives (null = memory only). Used by tests and diagnostics. */
  readonly file: string | null;
};

export type StoreOptions = {
  name: string;
  secret: string;
  /** Directory for the encrypted file. Default: <cwd>/.data (or SESSION_STORE_DIR). */
  dir?: string;
  /** Disable the file (memory only). */
  memoryOnly?: boolean;
};

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "eventmail-session-store-v1", 32);
}

export function encryptJson(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptJson<T>(payload: string, secret: string): T | null {
  try {
    const [version, iv, tag, data] = payload.trim().split(".");
    if (version !== "v1" || !iv || !tag || !data) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(secret),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const text = Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function createSessionStore<T>(opts: StoreOptions): SessionStore<T> {
  const dir =
    opts.dir ?? process.env.SESSION_STORE_DIR?.trim() ?? path.join(process.cwd(), ".data");
  const file = opts.memoryOnly ? null : path.join(dir, `sessions-${opts.name}.enc`);
  const memory = new Map<string, Entry<T>>();
  let loadedMtime = -1;

  function prune() {
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const [id, e] of memory) if (e.at < cutoff) memory.delete(id);
  }

  /** Re-read the file if it changed on disk (another worker, or a restart). */
  function refresh() {
    if (!file) return;
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs === loadedMtime) return;
      const data = decryptJson<Record<string, Entry<T>>>(fs.readFileSync(file, "utf8"), opts.secret);
      loadedMtime = stat.mtimeMs;
      if (data && typeof data === "object") {
        for (const [id, e] of Object.entries(data)) {
          // Never let an older copy on disk replace a newer one already in memory.
          const have = memory.get(id);
          if (!have || have.at <= e.at) memory.set(id, e);
        }
      }
    } catch {
      // no file yet, or unreadable: memory is still the source of truth
    }
  }

  function flush() {
    if (!file) return;
    try {
      prune();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, encryptJson(Object.fromEntries(memory), opts.secret), {
        mode: 0o600,
      });
      fs.renameSync(tmp, file);
      loadedMtime = fs.statSync(file).mtimeMs;
    } catch {
      // read-only filesystem etc.: keep working in memory
    }
  }

  return {
    file,
    get(id) {
      refresh();
      return memory.get(id)?.v;
    },
    set(id, value) {
      refresh();
      memory.set(id, { v: value, at: Date.now() });
      flush();
    },
    delete(id) {
      refresh();
      if (memory.delete(id)) flush();
    },
  };
}
