import type { FollowUpTask, SalesActivity, SalesOwner } from "@/lib/types";
import { SALES_OWNERS } from "@/lib/types";

type Props = {
  tasks: FollowUpTask[];
  activities: SalesActivity[];
  onToggleDone: (taskId: string) => void;
  onReassign: (taskId: string, owner: SalesOwner) => void;
};

export function FollowUpsView({
  tasks,
  activities,
  onToggleDone,
  onReassign,
}: Props) {
  const openCount = tasks.filter((t) => t.status !== "Done").length;
  const overdueCount = tasks.filter((t) => t.status === "Overdue").length;

  return (
    <section className="view-panel" aria-label="Follow-ups">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">Sales</p>
          <h2>Follow-ups</h2>
          <p className="view-panel__sub">
            Assign leads to teammates, track reminders, and review call/email
            history.
          </p>
        </div>
      </div>

      <div className="sales-summary">
        <article>
          <strong>{tasks.length}</strong>
          <span>Tasks</span>
        </article>
        <article>
          <strong>{openCount}</strong>
          <span>Open</span>
        </article>
        <article>
          <strong>{overdueCount}</strong>
          <span>Overdue</span>
        </article>
        <article>
          <strong>{activities.length}</strong>
          <span>Recent activities</span>
        </article>
      </div>

      <div className="followup-layout">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Due</th>
                <th>Channel</th>
                <th>Owner</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <div className="person-cell">
                      <strong>{task.leadName}</strong>
                      <span>
                        {task.company} · {task.note}
                      </span>
                    </div>
                  </td>
                  <td>{task.dueLabel}</td>
                  <td>{task.channel}</td>
                  <td>
                    <select
                      className="inline-select"
                      value={task.owner}
                      onChange={(e) =>
                        onReassign(task.id, e.target.value as SalesOwner)
                      }
                    >
                      {SALES_OWNERS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span
                      className={`eng-pill eng-pill--${
                        task.status === "Done"
                          ? "high"
                          : task.status === "Overdue"
                            ? "low"
                            : "medium"
                      }`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => onToggleDone(task.id)}
                    >
                      {task.status === "Done" ? "Reopen" : "Mark done"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="activity-rail" aria-label="Activity history">
          <h3>Call / email history</h3>
          <ul className="activity-list">
            {activities.map((item) => (
              <li key={item.id}>
                <span className="activity-list__kind">{item.kind}</span>
                <div>
                  <strong>{item.leadName}</strong>
                  <p>{item.summary}</p>
                  <small>
                    {item.at} · {item.owner}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
