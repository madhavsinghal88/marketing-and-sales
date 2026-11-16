const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "▦", active: true },
  { id: "events", label: "Events", icon: "◎" },
  { id: "participants", label: "Participants", icon: "☺" },
  { id: "templates", label: "Email Templates", icon: "▤" },
  { id: "automation", label: "Automation", icon: "⚡" },
  { id: "reports", label: "Reports", icon: "▧" },
  { id: "settings", label: "Settings", icon: "⚙" },
] as const;

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  outlookConnected: boolean;
  mailbox: string;
  onOpenTemplates: () => void;
};

export function AppSidebar({
  collapsed,
  onToggle,
  outlookConnected,
  mailbox,
  onOpenTemplates,
}: Props) {
  return (
    <aside
      className={`sidebar ${collapsed ? "is-collapsed" : ""}`}
      aria-expanded={!collapsed}
    >
      <div className="sidebar__top">
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden>
            ✉
          </span>
          {!collapsed && <span className="sidebar__name">EventMail</span>}
        </div>
        <button
          type="button"
          className="sidebar__collapse"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"}
          title={collapsed ? "Expand" : "Minimize"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="sidebar__nav" aria-label="Main">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar__link ${"active" in item && item.active ? "is-active" : ""}`}
            title={item.label}
            onClick={() => {
              if (item.id === "templates") onOpenTemplates();
            }}
          >
            <span className="sidebar__icon" aria-hidden>
              {item.icon}
            </span>
            {!collapsed && <span className="sidebar__label">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div
          className={`sidebar__outlook ${outlookConnected ? "is-on" : "is-off"}`}
          title={
            outlookConnected
              ? `Outlook Connected — ${mailbox}`
              : `Outlook Disconnected — ${mailbox}`
          }
        >
          <span className="sidebar__outlook-dot" aria-hidden />
          {!collapsed && (
            <div>
              <p className="sidebar__outlook-title">
                {outlookConnected
                  ? "Outlook Connected"
                  : "Outlook Disconnected"}
              </p>
              <p className="sidebar__outlook-mail">{mailbox}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
