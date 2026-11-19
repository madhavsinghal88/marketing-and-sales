import type { Deal, SalesLead } from "@/lib/types";
import { formatMoney, pipelineSummary } from "@/lib/sales";

type Props = {
  leads: SalesLead[];
  deals: Deal[];
};

export function SalesReportsView({ leads, deals }: Props) {
  const summary = pipelineSummary(leads);
  const byOwner = Object.entries(
    leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.owner] = (acc[lead.owner] ?? 0) + 1;
      return acc;
    }, {}),
  );
  const wonValue = deals
    .filter((d) => d.stage === "Won")
    .reduce((sum, d) => sum + d.value, 0);
  const winRate =
    summary.closed > 0 ? Math.round((summary.won / summary.closed) * 100) : 0;

  const byEvent = Object.entries(
    leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.eventName] = (acc[lead.eventName] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <section className="view-panel" aria-label="Sales reports">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Analytics</p>
          <h2>Sales Reports</h2>
          <p className="view-panel__sub">
            Pipeline velocity signals, win rates, and rep activity across
            event-sourced leads.
          </p>
        </div>
      </div>

      <div className="sales-summary">
        <article>
          <strong>{winRate}%</strong>
          <span>Win rate</span>
        </article>
        <article>
          <strong>{formatMoney(wonValue)}</strong>
          <span>Won revenue</span>
        </article>
        <article>
          <strong>{summary.inPipeline}</strong>
          <span>Active pipeline</span>
        </article>
        <article>
          <strong>{summary.total}</strong>
          <span>Leads sourced</span>
        </article>
      </div>

      <div className="reports-grid">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {byOwner.map(([owner, count]) => (
                <tr key={owner}>
                  <td>{owner}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {byEvent.map(([eventName, count]) => (
                <tr key={eventName}>
                  <td>{eventName}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
