"use client";

import { useMemo, useState } from "react";
import type {
  LeadTemperature,
  SalesLead,
  SalesOwner,
} from "@/lib/types";
import { SALES_OWNERS } from "@/lib/types";
import { pipelineSummary } from "@/lib/sales";
import type { SalesforceSyncApi } from "@/lib/salesforce/useSync";
import { SyncCell } from "./SalesforceSync";
import { PullButton } from "./SalesforceTwoWay";

type Props = {
  leads: SalesLead[];
  onAssignOwner: (leadId: string, owner: SalesOwner) => void;
  onOpenPipeline: () => void;
  sf: SalesforceSyncApi;
};

export function LeadsView({ leads, onAssignOwner, onOpenPipeline, sf }: Props) {
  const [temp, setTemp] = useState<LeadTemperature | "">("");
  const [owner, setOwner] = useState<SalesOwner | "">("");
  const summary = pipelineSummary(leads);

  const filtered = useMemo(() => {
    return leads
      .filter((lead) => (temp ? lead.temperature === temp : true))
      .filter((lead) => (owner ? lead.owner === owner : true))
      .sort((a, b) => b.score - a.score);
  }, [leads, temp, owner]);

  return (
    <section className="view-panel" aria-label="Leads and scoring">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Sales</p>
          <h2>Leads & Scoring</h2>
          <p className="view-panel__sub">
            Scores from email engagement, event participation, replies, and
            interest. Hot / Warm / Cold tags help prioritize outreach.
          </p>
        </div>
        <div className="view-panel__buttons">
          <PullButton sf={sf} />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={sf.busy !== null || filtered.length === 0}
            onClick={() =>
              void sf.syncLeads(
                filtered,
                temp || owner ? "current filter" : "all leads",
              )
            }
            title="Create or update these leads in Salesforce"
          >
            {sf.busy ?? `Sync ${filtered.length} to Salesforce`}
          </button>
          <button type="button" className="btn btn--primary" onClick={onOpenPipeline}>
            Open pipeline
          </button>
        </div>
      </div>

      <div className="sales-summary">
        <article>
          <strong>{summary.total}</strong>
          <span>Total leads</span>
        </article>
        <article>
          <strong>{leads.filter((l) => l.temperature === "Hot").length}</strong>
          <span>Hot</span>
        </article>
        <article>
          <strong>{leads.filter((l) => l.temperature === "Warm").length}</strong>
          <span>Warm</span>
        </article>
        <article>
          <strong>{leads.filter((l) => l.temperature === "Cold").length}</strong>
          <span>Cold</span>
        </article>
        <article>
          <strong>{summary.qualified}</strong>
          <span>Qualified+</span>
        </article>
      </div>

      <div className="segment-chipbar">
        <label>
          Temperature
          <select
            value={temp}
            onChange={(e) => setTemp(e.target.value as LeadTemperature | "")}
          >
            <option value="">All</option>
            <option value="Hot">Hot</option>
            <option value="Warm">Warm</option>
            <option value="Cold">Cold</option>
          </select>
        </label>
        <label>
          Owner
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value as SalesOwner | "")}
          >
            <option value="">All owners</option>
            {SALES_OWNERS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span className="segment-chipbar__count">
          {filtered.length} leads
        </span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Event</th>
              <th>Score</th>
              <th>Temp</th>
              <th>Stage</th>
              <th>Owner</th>
              <th>Last activity</th>
              <th>Salesforce</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <div className="person-cell">
                    <strong>{lead.name}</strong>
                    <span>
                      {lead.jobTitle} · {lead.company}
                    </span>
                  </div>
                </td>
                <td>{lead.eventName}</td>
                <td>
                  <div className="score-cell">
                    <div className="score-bar">
                      <span style={{ width: `${lead.score}%` }} />
                    </div>
                    <strong>{lead.score}</strong>
                  </div>
                </td>
                <td>
                  <span
                    className={`temp-pill temp-pill--${lead.temperature.toLowerCase()}`}
                  >
                    {lead.temperature}
                  </span>
                </td>
                <td>{lead.stage}</td>
                <td>
                  <select
                    className="inline-select"
                    value={lead.owner}
                    onChange={(e) =>
                      onAssignOwner(lead.id, e.target.value as SalesOwner)
                    }
                  >
                    {SALES_OWNERS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{lead.lastActivity}</td>
                <td>
                  <SyncCell
                    view={sf.leadState(lead)}
                    sf={sf}
                    onSync={() => void sf.syncLeads([lead])}
                    conflict={sf.conflictFor("lead", lead.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
