"use client";

import { useEffect, useState } from "react";
import type { Deal, FollowUpTask, SalesLead } from "@/lib/types";
import type { Conflict } from "@/lib/salesforce/reconcile";
import type { SalesforceSyncApi, SyncView } from "@/lib/salesforce/useSync";
import {
  ConflictsCard,
  DemoRepCard,
  OrgHealthCard,
  OwnerMappingCard,
  SyncLog,
  TwoWayCard,
  timeLabel,
} from "./SalesforceTwoWay";

/** Status pill + action button for one record in a table row. */
export function SyncCell({
  view,
  sf,
  onSync,
  conflict,
}: {
  view: SyncView;
  sf: SalesforceSyncApi;
  onSync: () => void;
  /** An open conflict on this record, if any. */
  conflict?: Conflict;
}) {
  const { state, record } = view;
  const link = sf.linkFor(record);
  const disabled = sf.busy !== null;

  const label =
    state === "synced"
      ? "✓ Synced"
      : state === "stale"
        ? "↻ Changed"
        : state === "failed"
          ? "! Failed"
          : "Not synced";

  const title =
    state === "failed"
      ? record?.error
      : record
        ? `${record.action ?? "synced"} at ${timeLabel(record.at)}${record.note ? ` · ${record.note}` : ""}${record.demo ? " · demo" : ""}`
        : sf.connected
          ? "Not in Salesforce yet"
          : "Connect Salesforce to sync";

  const actionLabel =
    state === "none" ? "Sync" : state === "failed" ? "Retry" : state === "stale" ? "Re-sync" : null;

  return (
    <div className="sf-cell">
      <span className={`sf-badge sf-badge--${state}`} title={title}>
        {label}
        {record?.demo && state === "synced" ? " (demo)" : ""}
      </span>
      {conflict ? (
        <span
          className="sf-badge sf-badge--conflict"
          title={`${conflict.field === "done" ? "Status" : conflict.field} changed in EventMail (${conflict.local}) and in Salesforce (${conflict.remote}). Decide on the Integrations page.`}
        >
          ⚠ Conflict
        </span>
      ) : record?.pullNote ? (
        <span
          className="sf-badge sf-badge--pulled"
          title={`Updated from Salesforce${record.pulledAt ? ` at ${timeLabel(record.pulledAt)}` : ""}: ${record.pullNote}`}
        >
          ↓ From Salesforce
        </span>
      ) : null}
      <span className="sf-cell__actions">
        {actionLabel ? (
          <button type="button" className="sf-link" disabled={disabled} onClick={onSync}>
            {actionLabel}
          </button>
        ) : null}
        {link && state !== "failed" ? (
          <a className="sf-link" href={link} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        ) : null}
      </span>
    </div>
  );
}

type Schema = {
  loaded: boolean;
  leadStatuses: string[];
  oppStages: string[];
  custom: { score: boolean; event: boolean; lastActivity: boolean };
};

type SchemaResult = { schema: Schema | null; error: string | null };

async function fetchSchema(force: boolean): Promise<SchemaResult> {
  try {
    const res = await fetch(`/api/salesforce/schema${force ? "?refresh=1" : ""}`);
    const data = (await res.json()) as { schema?: Schema | null; error?: string };
    if (!res.ok) return { schema: null, error: data.error ?? "Could not read the org setup." };
    return { schema: data.schema ?? null, error: null };
  } catch {
    return { schema: null, error: "Could not reach the server." };
  }
}

/** Summary, sync + pull controls, owner mapping, org health and the sync log (Integrations page). */
export function SalesforceSyncPanel({
  sf,
  totals,
  entities,
}: {
  sf: SalesforceSyncApi;
  totals: { leads: number; deals: number; tasks: number; events: number };
  entities: { leads: SalesLead[]; deals: Deal[]; followUps: FollowUpTask[] };
}) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const live = sf.mode === "live";

  function applySchemaResult(r: SchemaResult) {
    setSchemaError(r.error);
    if (!r.error) setSchema(r.schema);
  }

  async function recheck() {
    setChecking(true);
    applySchemaResult(await fetchSchema(true));
    setChecking(false);
  }

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    void fetchSchema(false).then((r) => {
      if (!cancelled) applySchemaResult(r);
    });
    return () => {
      cancelled = true;
    };
    // applySchemaResult only calls state setters, which are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const customCount = schema ? Object.values(schema.custom).filter(Boolean).length : 0;

  return (
    <div className="sf-panel">
      <div className="sf-panel__head">
        <div>
          <h3>Salesforce sync</h3>
          <p>
            Two-way: push EventMail data into Salesforce, and pull what reps change there back.
            Re-syncing updates records and never creates duplicates or overwrites a rep&apos;s edit.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={sf.busy !== null}
          onClick={() => void sf.syncEverything()}
        >
          {sf.busy ?? "↑ Sync everything"}
        </button>
      </div>

      <div className="sf-tiles">
        {(
          [
            ["Leads", sf.summary.leads, totals.leads],
            ["Opportunities", sf.summary.deals, totals.deals],
            ["Tasks", sf.summary.tasks, totals.tasks],
            ["Campaigns", sf.summary.events, totals.events],
          ] as const
        ).map(([name, done, total]) => (
          <article key={name}>
            <strong>
              {done}
              <small> / {total}</small>
            </strong>
            <span>{name} synced</span>
          </article>
        ))}
        <article className={sf.summary.failed ? "is-bad" : ""}>
          <strong>{sf.summary.failed}</strong>
          <span>Failed</span>
        </article>
        <article className={sf.summary.conflicts ? "is-warn" : ""}>
          <strong>{sf.summary.conflicts}</strong>
          <span>Conflicts</span>
        </article>
      </div>

      <TwoWayCard sf={sf} />
      <ConflictsCard sf={sf} />
      <DemoRepCard sf={sf} entities={entities} />
      <OwnerMappingCard sf={sf} />
      <OrgHealthCard sf={sf} />

      {live ? (
        <div className="sf-setup">
          <div className="sf-setup__row">
            <strong>Optional custom fields</strong>
            {schemaError ? (
              <span className="sf-badge sf-badge--failed">{schemaError}</span>
            ) : schema ? (
              <span className={`sf-badge sf-badge--${customCount === 3 ? "synced" : "stale"}`}>
                Custom fields {customCount}/3
              </span>
            ) : (
              <span className="sf-badge sf-badge--none">Checking…</span>
            )}
            <button
              type="button"
              className="sf-link"
              disabled={checking}
              onClick={() => void recheck()}
            >
              {checking ? "Checking…" : "Re-check"}
            </button>
          </div>
          <p className="sf-setup__text">
            {schema && customCount === 3
              ? "All three optional EventMail fields exist, so score, event and last activity are saved in their own fields."
              : "Works without any setup: score and event are written into each lead's Description and Rating. To get dedicated fields, create the three optional custom fields below, then click Re-check."}
          </p>
          {schema && customCount < 3 ? (
            <details className="sf-setup__details">
              <summary>Optional custom fields to create on Lead</summary>
              <ul>
                <li>
                  <code>EventMail Score</code> (Number, 3 digits, 0 decimals) · API name{" "}
                  <code>EventMail_Score__c</code> {schema.custom.score ? "✓" : ""}
                </li>
                <li>
                  <code>EventMail Event</code> (Text, 255) · API name{" "}
                  <code>EventMail_Event__c</code> {schema.custom.event ? "✓" : ""}
                </li>
                <li>
                  <code>EventMail Last Activity</code> (Text, 255) · API name{" "}
                  <code>EventMail_Last_Activity__c</code> {schema.custom.lastActivity ? "✓" : ""}
                </li>
              </ul>
              <p>
                Salesforce: Setup, Object Manager, Lead, Fields &amp; Relationships, New. Make them
                visible to your profile.
              </p>
            </details>
          ) : null}
        </div>
      ) : null}

      <SyncLog sf={sf} />
    </div>
  );
}
