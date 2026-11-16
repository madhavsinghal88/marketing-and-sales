import { DEFAULT_TEMPLATE } from "@/data/mock";
import type { EmailTemplate } from "@/lib/types";

export const TEMPLATE_STORAGE_KEY = "eventmail.globalTemplate.v1";

export const MERGE_FIELDS = [
  { key: "name", token: "{{name}}", label: "Name" },
  { key: "email", token: "{{email}}", label: "Email" },
  { key: "event", token: "{{event}}", label: "Event" },
] as const;

export type MergeContext = {
  name: string;
  email: string;
  event: string;
};

export function applyMergeFields(
  text: string,
  ctx: MergeContext,
): string {
  return text
    .replaceAll("{{name}}", ctx.name)
    .replaceAll("{{email}}", ctx.email)
    .replaceAll("{{event}}", ctx.event);
}

export function loadTemplate(): EmailTemplate {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE;
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return DEFAULT_TEMPLATE;
    const parsed = JSON.parse(raw) as Partial<EmailTemplate>;
    if (
      typeof parsed.subject === "string" &&
      typeof parsed.body === "string"
    ) {
      return { subject: parsed.subject, body: parsed.body };
    }
  } catch {
    // ignore corrupt storage
  }
  return DEFAULT_TEMPLATE;
}

export function saveTemplate(template: EmailTemplate): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(template));
}
