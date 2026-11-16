"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EmailTemplate } from "@/lib/types";
import {
  MERGE_FIELDS,
  applyMergeFields,
  type MergeContext,
} from "@/lib/template";
import { DEFAULT_TEMPLATE } from "@/data/mock";

type Props = {
  open: boolean;
  template: EmailTemplate;
  preview: MergeContext;
  onChange: (template: EmailTemplate) => void;
  onSave: (template: EmailTemplate) => void;
  onClose: () => void;
};

type FocusField = "subject" | "body";

export function TemplatePanel({
  open,
  template,
  preview,
  onChange,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(template);
  const [focusField, setFocusField] = useState<FocusField>("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setDraft(template);
  }, [open, template]);

  const previewSubject = useMemo(
    () => applyMergeFields(draft.subject, preview),
    [draft.subject, preview],
  );
  const previewBody = useMemo(
    () => applyMergeFields(draft.body, preview),
    [draft.body, preview],
  );

  if (!open) return null;

  function update(next: EmailTemplate) {
    setDraft(next);
    onChange(next);
  }

  function insertToken(token: string) {
    const el = focusField === "subject" ? subjectRef.current : bodyRef.current;
    if (!el) {
      update({
        ...draft,
        [focusField]: `${draft[focusField]}${token}`,
      });
      return;
    }

    const start = el.selectionStart ?? draft[focusField].length;
    const end = el.selectionEnd ?? start;
    const value = draft[focusField];
    const nextValue = value.slice(0, start) + token + value.slice(end);
    update({ ...draft, [focusField]: nextValue });

    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside
        className="panel panel--template"
        role="dialog"
        aria-label="Global email template"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel__head">
          <div>
            <p className="panel__eyebrow">Global · all sends</p>
            <h2>Email template</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="panel__hint">
          One template drives every campaign send. Click a merge field to insert
          it at the cursor.
        </p>

        <div className="merge-chips" role="group" aria-label="Merge fields">
          {MERGE_FIELDS.map((field) => (
            <button
              key={field.key}
              type="button"
              className="merge-chip"
              onClick={() => insertToken(field.token)}
            >
              {field.token}
              <span>{field.label}</span>
            </button>
          ))}
        </div>

        <label className="field">
          <span>Subject</span>
          <input
            ref={subjectRef}
            type="text"
            value={draft.subject}
            onFocus={() => setFocusField("subject")}
            onChange={(e) => update({ ...draft, subject: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Body</span>
          <textarea
            ref={bodyRef}
            rows={10}
            value={draft.body}
            onFocus={() => setFocusField("body")}
            onChange={(e) => update({ ...draft, body: e.target.value })}
          />
        </label>

        <div className="template-preview">
          <div className="template-preview__head">
            <h3>Live preview</h3>
            <p>
              {preview.name} · {preview.event}
            </p>
          </div>
          <div className="template-preview__card">
            <p className="template-preview__subject">{previewSubject}</p>
            <pre className="template-preview__body">{previewBody}</pre>
          </div>
        </div>

        <div className="panel__actions panel__actions--row">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => update(DEFAULT_TEMPLATE)}
          >
            Reset default
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Save template
          </button>
        </div>
      </aside>
    </div>
  );
}
