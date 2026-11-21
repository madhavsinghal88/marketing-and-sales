"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Participant } from "@/lib/types";
import {
  buildParticipant,
  emptyParticipantInput,
  parseInterests,
  TEMPLATE_CHOICES,
  validateParticipantInput,
  type NewParticipantInput,
  type ParticipantErrors,
} from "@/lib/participants";

type Props = {
  eventName: string;
  existing: Participant[];
  industries: string[];
  outlookConnected: boolean;
  outlookMode: "demo" | "live" | null;
  mailbox: string | null;
  onClose: () => void;
  /** Resolves true when the participant was added (and sent, if requested). */
  onAdd: (participant: Participant, opts: { sendNow: boolean }) => Promise<boolean>;
  onConnectOutlook: () => void;
};

function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "?";
}

export function AddParticipantPanel({
  eventName,
  existing,
  industries,
  outlookConnected,
  outlookMode,
  mailbox,
  onClose,
  onAdd,
  onConnectOutlook,
}: Props) {
  const uid = useId();
  const [form, setForm] = useState<NewParticipantInput>(emptyParticipantInput);
  const [errors, setErrors] = useState<ParticipantErrors>({});
  const [addAnother, setAddAnother] = useState(false);
  const [busy, setBusy] = useState<"add" | "send" | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const interests = useMemo(() => parseInterests(form.interests), [form.interests]);
  const isDemo = outlookMode === "demo";

  function set<K extends keyof NewParticipantInput>(
    key: K,
    value: NewParticipantInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "name" || key === "email") {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  async function submit(sendNow: boolean) {
    if (busy) return;
    const found = validateParticipantInput(form, existing);
    if (found.name || found.email) {
      setErrors(found);
      const first = found.name ? "name" : "email";
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }

    setBusy(sendNow ? "send" : "add");
    try {
      const ok = await onAdd(buildParticipant(form), { sendNow });
      if (!ok) return;
      if (addAnother) {
        setForm({ ...emptyParticipantInput(), template: form.template });
        setErrors({});
        document.getElementById(`${uid}-name`)?.focus();
      } else {
        onClose();
      }
    } finally {
      setBusy(null);
    }
  }

  const previewName = form.name.trim() || "New participant";
  const previewEmail = form.email.trim() || "name@company.com";

  return (
    <div
      className="panel-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <aside
        className="panel panel--add"
        role="dialog"
        aria-modal="true"
        aria-label="Add participant"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          className="add-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <div className="panel__head">
            <div>
              <p className="panel__eyebrow">Participants</p>
              <h2>Add participant</h2>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={busy !== null}
            >
              Close
            </button>
          </div>

          <p className="panel__hint">
            Adding to <strong>{eventName}</strong>. Use a real, reachable email
            address if you want to send a live email and verify delivery.
          </p>

          <div className="add-preview" aria-hidden>
            <span className="add-preview__avatar">{initials(form.name)}</span>
            <span className="add-preview__copy">
              <span className="add-preview__name">{previewName}</span>
              <span className="add-preview__email">{previewEmail}</span>
            </span>
          </div>

          <fieldset className="add-section">
            <legend>Contact</legend>
            <div className={`field ${errors.name ? "field--error" : ""}`}>
              <label htmlFor={`${uid}-name`}>
                Full name <span className="req">*</span>
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="e.g. Rahul Mehta"
                value={form.name}
                maxLength={120}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? `${uid}-name-err` : undefined}
                onChange={(e) => set("name", e.target.value)}
              />
              {errors.name ? (
                <span id={`${uid}-name-err`} className="field__error" role="alert">
                  {errors.name}
                </span>
              ) : null}
            </div>

            <div className={`field ${errors.email ? "field--error" : ""}`}>
              <label htmlFor={`${uid}-email`}>
                Email address <span className="req">*</span>
              </label>
              <input
                id={`${uid}-email`}
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="name@company.com"
                value={form.email}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? `${uid}-email-err` : undefined}
                onChange={(e) => set("email", e.target.value)}
              />
              {errors.email ? (
                <span id={`${uid}-email-err`} className="field__error" role="alert">
                  {errors.email}
                </span>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="add-section">
            <legend>Company details</legend>
            <div className="add-grid">
              <div className="field">
                <label htmlFor={`${uid}-company`}>Company</label>
                <input
                  id={`${uid}-company`}
                  type="text"
                  autoComplete="off"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`${uid}-title`}>Job title</label>
                <input
                  id={`${uid}-title`}
                  type="text"
                  autoComplete="off"
                  value={form.jobTitle}
                  onChange={(e) => set("jobTitle", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`${uid}-industry`}>Industry</label>
                <input
                  id={`${uid}-industry`}
                  type="text"
                  list={`${uid}-industries`}
                  autoComplete="off"
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                />
                <datalist id={`${uid}-industries`}>
                  {industries.map((i) => (
                    <option key={i} value={i} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor={`${uid}-location`}>Location</label>
                <input
                  id={`${uid}-location`}
                  type="text"
                  autoComplete="off"
                  placeholder="City, Country"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor={`${uid}-interests`}>Interests</label>
              <input
                id={`${uid}-interests`}
                type="text"
                autoComplete="off"
                placeholder="Comma separated, e.g. AI, Networking"
                value={form.interests}
                onChange={(e) => set("interests", e.target.value)}
              />
              {interests.length > 0 ? (
                <span className="add-chips">
                  {interests.map((tag) => (
                    <span key={tag} className="add-chip">
                      {tag}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="add-section">
            <legend>Outreach</legend>
            <div className="field">
              <label htmlFor={`${uid}-template`}>Template</label>
              <select
                id={`${uid}-template`}
                value={form.template}
                onChange={(e) => set("template", e.target.value)}
              >
                {TEMPLATE_CHOICES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-comment`}>Comment</label>
              <textarea
                id={`${uid}-comment`}
                rows={2}
                placeholder="Optional note for your team"
                value={form.comment}
                onChange={(e) => set("comment", e.target.value)}
              />
            </div>
          </fieldset>

          <div
            className={`add-send-note ${
              !outlookConnected
                ? "is-off"
                : isDemo
                  ? "is-demo"
                  : "is-live"
            }`}
          >
            {!outlookConnected ? (
              <>
                <span>Outlook is not connected, so nothing can be sent yet.</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={onConnectOutlook}
                >
                  Connect Outlook
                </button>
              </>
            ) : isDemo ? (
              <span>
                Demo mode: “Add &amp; send” is simulated and no real email
                leaves. Connect a real Outlook account to send for real.
              </span>
            ) : (
              <span>
                “Add &amp; send” sends the <strong>Day 1 welcome</strong> from{" "}
                <strong>{mailbox ?? "your mailbox"}</strong> to{" "}
                <strong>{form.email.trim() || "this address"}</strong>, a real
                inbox.
              </span>
            )}
          </div>

          <label className="add-another">
            <input
              type="checkbox"
              checked={addAnother}
              onChange={(e) => setAddAnother(e.target.checked)}
            />
            Keep this panel open to add another
          </label>

          <div className="panel__actions panel__actions--row">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={busy !== null}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--ghost"
              disabled={busy !== null}
            >
              {busy === "add" ? "Adding…" : "Add participant"}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy !== null || !outlookConnected}
              onClick={() => void submit(true)}
              title={
                outlookConnected
                  ? "Add and send the Day 1 welcome email now"
                  : "Connect Outlook to send"
              }
            >
              {busy === "send" ? "Sending…" : "Add & send Day 1 now"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
