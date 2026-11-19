import type { AppView } from "@/lib/types";

const NAV_SECTIONS: {
  label: string;
  items: { id: AppView; label: string; icon: string }[];
}[] = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "▦" },
      { id: "events", label: "Events", icon: "◎" },
      { id: "participants", label: "Participants", icon: "☺" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { id: "campaigns", label: "Email Campaigns", icon: "✉" },
      { id: "segments", label: "Audience & Segments", icon: "◎" },
      { id: "templates", label: "Templates", icon: "▤" },
      { id: "automation", label: "Automation", icon: "⚡" },
      { id: "landing-pages", label: "Landing Pages", icon: "▣" },
      { id: "forms", label: "Forms", icon: "☰" },
    ],
  },
  {
    label: "Sales",
    items: [
      { id: "leads", label: "Leads & Scoring", icon: "◆" },
      { id: "pipeline", label: "Sales Pipeline", icon: "▥" },
      { id: "followups", label: "Follow-ups", icon: "↻" },
      { id: "deals", label: "Deals & Opportunities", icon: "$" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { id: "analytics", label: "Campaign Analytics", icon: "▧" },
      { id: "sales-reports", label: "Sales Reports", icon: "▦" },
      { id: "roi", label: "ROI & Conversions", icon: "%" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "integrations", label: "Integrations", icon: "⧉" },
      { id: "settings", label: "Settings", icon: "⚙" },
    ],
  },
];

type Props = {
  collapsed: boolean;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onToggle: () => void;
  outlookConnected: boolean;
  mailbox: string;
  onOpenTemplates: () => void;
};

export function AppSidebar({
  collapsed,
  activeView,
  onNavigate,
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
          {!collapsed && (
            <div className="sidebar__brand-text">
              <span className="sidebar__name">Marketing & Sales</span>
            </div>
          )}
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
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="sidebar__section">
            {!collapsed && (
              <p className="sidebar__section-label">{section.label}</p>
            )}
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sidebar__link ${activeView === item.id ? "is-active" : ""}`}
                title={item.label}
                onClick={() => {
                  if (item.id === "templates") {
                    onOpenTemplates();
                  }
                  onNavigate(item.id);
                }}
              >
                <span className="sidebar__icon" aria-hidden>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="sidebar__label">{item.label}</span>
                )}
              </button>
            ))}
          </div>
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
