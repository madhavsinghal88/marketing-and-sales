import type { Deal } from "@/lib/types";
import { formatMoney } from "@/lib/sales";
import type { SalesforceSyncApi } from "@/lib/salesforce/useSync";
import { SyncCell } from "./SalesforceSync";
import { PullButton } from "./SalesforceTwoWay";

type Props = {
  deals: Deal[];
  onToast: (message: string) => void;
  sf: SalesforceSyncApi;
};

export function DealsView({ deals, onToast, sf }: Props) {
  const openDeals = deals.filter(
    (d) => d.stage !== "Won" && d.stage !== "Lost",
  );
  const won = deals.filter((d) => d.stage === "Won");
  const pipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);
  const expected = openDeals.reduce((sum, d) => sum + d.expectedRevenue, 0);
  const closedWon = won.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className="view-panel" aria-label="Deals and opportunities">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Sales</p>
          <h2>Deals & Opportunities</h2>
          <p className="view-panel__sub">
            Record deal value, expected revenue, conversion probability, and
            closed outcomes.
          </p>
        </div>
        <div className="view-panel__buttons">
          <PullButton sf={sf} />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={sf.busy !== null || deals.length === 0}
            onClick={() => void sf.syncDeals(deals)}
            title="Create or update these deals as Salesforce Opportunities"
          >
            {sf.busy ?? `Sync ${deals.length} to Salesforce`}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              onToast("New deal form expands with CRM persistence later.")
            }
          >
            + New deal
          </button>
        </div>
      </div>

      <div className="sales-summary">
        <article>
          <strong>{formatMoney(pipelineValue)}</strong>
          <span>Open pipeline</span>
        </article>
        <article>
          <strong>{formatMoney(expected)}</strong>
          <span>Expected revenue</span>
        </article>
        <article>
          <strong>{formatMoney(closedWon)}</strong>
          <span>Closed won</span>
        </article>
        <article>
          <strong>{deals.length}</strong>
          <span>Opportunities</span>
        </article>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Event</th>
              <th>Stage</th>
              <th>Value</th>
              <th>Probability</th>
              <th>Expected</th>
              <th>Close</th>
              <th>Owner</th>
              <th>Salesforce</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.id}>
                <td>
                  <div className="person-cell">
                    <strong>{deal.leadName}</strong>
                    <span>{deal.company}</span>
                  </div>
                </td>
                <td>{deal.eventName}</td>
                <td>{deal.stage}</td>
                <td>{formatMoney(deal.value)}</td>
                <td>{deal.probability}%</td>
                <td>{formatMoney(deal.expectedRevenue)}</td>
                <td>{deal.closeLabel}</td>
                <td>{deal.owner}</td>
                <td>
                  <SyncCell
                    view={sf.dealState(deal)}
                    sf={sf}
                    onSync={() => void sf.syncDeals([deal])}
                    conflict={sf.conflictFor("lead", deal.leadId)}
                  />
                </td>
              </tr>
            ))}
            {deals.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  No deals yet — qualify leads in the pipeline to create
                  opportunities.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
