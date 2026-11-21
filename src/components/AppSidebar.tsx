import type { ReactNode } from "react";
import type { AppView } from "@/lib/types";

const NAV_SECTIONS: {
  label: string;
  items: { id: AppView; label: string }[];
}[] = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard" },
      { id: "events", label: "Events" },
      { id: "participants", label: "Participants" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { id: "campaigns", label: "Email Campaigns" },
      { id: "segments", label: "Audience & Segments" },
      { id: "templates", label: "Templates" },
      { id: "automation", label: "Automation" },
      { id: "landing-pages", label: "Landing Pages" },
      { id: "forms", label: "Forms" },
    ],
  },
  {
    label: "Sales",
    items: [
      { id: "leads", label: "Leads & Scoring" },
      { id: "pipeline", label: "Sales Pipeline" },
      { id: "followups", label: "Follow-ups" },
      { id: "deals", label: "Deals & Opportunities" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { id: "analytics", label: "Campaign Analytics" },
      { id: "sales-reports", label: "Sales Reports" },
      { id: "roi", label: "ROI & Conversions" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "integrations", label: "Integrations" },
      { id: "settings", label: "Settings" },
    ],
  },
];

/** One consistent set of outline icons (24px grid, 1.8 stroke) so every item matches. */
const ICONS: Partial<Record<AppView, ReactNode>> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.8" />
      <rect x="14" y="3" width="7" height="5" rx="1.8" />
      <rect x="14" y="12" width="7" height="9" rx="1.8" />
      <rect x="3" y="16" width="7" height="5" rx="1.8" />
    </>
  ),
  events: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.8" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
    </>
  ),
  participants: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" />
      <path d="M16 4.7a3.3 3.3 0 0 1 0 6.1M18 14.3c2 .7 3.5 2.6 3.5 4.9" />
    </>
  ),
  campaigns: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.8" />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
    </>
  ),
  segments: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9h9" />
    </>
  ),
  templates: (
    <>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  automation: <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12l1-8z" />,
  "landing-pages": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.8" />
      <path d="M3 9h18M8 14h8" />
    </>
  ),
  forms: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.8" />
      <path d="M9 2.5h6v3H9zM9 11h6M9 15h6" />
    </>
  ),
  leads: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c0-3.3 3-6 6.5-6" />
      <path d="m15 17.5 2 2 4-4.5" />
    </>
  ),
  pipeline: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.6" />
      <rect x="10" y="4" width="5" height="10" rx="1.6" />
      <rect x="17" y="4" width="4" height="13" rx="1.6" />
    </>
  ),
  followups: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  deals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.6 9.3c-.5-.8-1.4-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.2 0-2.1-.5-2.6-1.3M12 6v2M12 16v2" />
    </>
  ),
  analytics: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  "sales-reports": (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  roi: (
    <>
      <path d="M19 5 5 19" />
      <circle cx="7" cy="7" r="2.3" />
      <circle cx="17" cy="17" r="2.3" />
    </>
  ),
  integrations: (
    <>
      <path d="M9.5 14.5l5-5" />
      <path d="m11 6.5 1.2-1.2a3.5 3.5 0 0 1 5 5L16 11.5M13 17.5l-1.2 1.2a3.5 3.5 0 0 1-5-5L8 12.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
};

function NavIcon({ id }: { id: AppView }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[id] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

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
                aria-current={activeView === item.id ? "page" : undefined}
                onClick={() => {
                  if (item.id === "templates") {
                    onOpenTemplates();
                  }
                  onNavigate(item.id);
                }}
              >
                <span className="sidebar__icon" aria-hidden>
                  <NavIcon id={item.id} />
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
