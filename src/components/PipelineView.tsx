import type { PipelineStage, SalesLead } from "@/lib/types";
import { PIPELINE_STAGES } from "@/lib/types";
import { groupLeadsByStage, pipelineSummary } from "@/lib/sales";

type Props = {
  leads: SalesLead[];
  onMoveStage: (leadId: string, stage: PipelineStage) => void;
};

export function PipelineView({ leads, onMoveStage }: Props) {
  const groups = groupLeadsByStage(leads);
  const summary = pipelineSummary(leads);

  return (
    <section className="view-panel" aria-label="Sales pipeline">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Sales</p>
          <h2>Sales Pipeline</h2>
          <p className="view-panel__sub">
            Track leads through New → Contacted → Qualified → Proposal →
            Negotiation → Won/Lost.
          </p>
        </div>
      </div>

      <div className="sales-summary">
        <article>
          <strong>{summary.total}</strong>
          <span>Total leads</span>
        </article>
        <article>
          <strong>{summary.qualified}</strong>
          <span>Qualified</span>
        </article>
        <article>
          <strong>{summary.inPipeline}</strong>
          <span>In pipeline</span>
        </article>
        <article>
          <strong>{summary.closed}</strong>
          <span>Closed</span>
        </article>
        <article>
          <strong>{summary.won}</strong>
          <span>Won</span>
        </article>
      </div>

      <div className="pipeline-board">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="pipeline-col">
            <div className="pipeline-col__head">
              <h3>{stage}</h3>
              <span>{groups[stage].length}</span>
            </div>
            <div className="pipeline-col__body">
              {groups[stage].map((lead) => (
                <article key={lead.id} className="pipeline-card">
                  <div className="pipeline-card__top">
                    <strong>{lead.name}</strong>
                    <span
                      className={`temp-pill temp-pill--${lead.temperature.toLowerCase()}`}
                    >
                      {lead.temperature}
                    </span>
                  </div>
                  <p>
                    {lead.company} · {lead.eventName}
                  </p>
                  <p className="pipeline-card__meta">
                    Score {lead.score} · {lead.owner}
                  </p>
                  <label className="pipeline-card__move">
                    Move to
                    <select
                      value={lead.stage}
                      onChange={(e) =>
                        onMoveStage(lead.id, e.target.value as PipelineStage)
                      }
                    >
                      {PIPELINE_STAGES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
              {groups[stage].length === 0 ? (
                <p className="pipeline-empty">No leads</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
