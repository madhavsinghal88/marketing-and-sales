type IntegrationId =
  | "outlook"
  | "hubspot"
  | "salesforce"
  | "zoho"
  | "calendly"
  | "teams"
  | "heroku";

const INTEGRATIONS: {
  id: IntegrationId;
  name: string;
  purpose: string;
  status: "Available" | "Planned";
}[] = [
  {
    id: "outlook",
    name: "Microsoft Outlook",
    purpose: "Email sending and tracking",
    status: "Available",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    purpose: "CRM and sales pipeline",
    status: "Planned",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    purpose: "Enterprise CRM",
    status: "Planned",
  },
  {
    id: "zoho",
    name: "Zoho CRM",
    purpose: "Lead and deal management",
    status: "Planned",
  },
  {
    id: "calendly",
    name: "Calendly",
    purpose: "Meeting scheduling",
    status: "Planned",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    purpose: "Meeting and team communication",
    status: "Planned",
  },
  {
    id: "heroku",
    name: "Heroku",
    purpose: "Cloud app deploy and hosting",
    status: "Planned",
  },
];

function IntegrationLogo({ id }: { id: IntegrationId }) {
  switch (id) {
    case "outlook":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className="integration-logo__svg">
          <rect width="32" height="32" rx="7" fill="#0F6CBD" />
          <rect x="15" y="7" width="11" height="18" rx="1.5" fill="#fff" opacity="0.95" />
          <path
            d="M7 10.5h9.5v11H7c-1.1 0-2-.9-2-2v-7c0-1.1.9-2 2-2z"
            fill="#28A8EA"
          />
          <circle cx="11.8" cy="16" r="2.4" fill="#fff" />
        </svg>
      );
    case "hubspot":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className="integration-logo__svg">
          <rect width="32" height="32" rx="7" fill="#FF7A59" />
          <circle cx="16" cy="21" r="4.2" fill="#fff" />
          <circle cx="16" cy="10.5" r="2.2" fill="#fff" />
          <rect x="14.7" y="12.2" width="2.6" height="5.2" fill="#fff" />
          <circle cx="22.5" cy="14.5" r="2" fill="#fff" />
          <path
            d="M18.2 14.5h4.3"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "salesforce":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className="integration-logo__svg">
          <rect width="32" height="32" rx="7" fill="#00A1E0" />
          <ellipse cx="12" cy="16" rx="5.2" ry="4.4" fill="#fff" />
          <ellipse cx="18" cy="14.2" rx="5.5" ry="4.6" fill="#fff" />
          <ellipse cx="21.5" cy="17.5" rx="4.4" ry="3.8" fill="#fff" />
          <ellipse cx="14.5" cy="19" rx="4.2" ry="3.5" fill="#fff" />
        </svg>
      );
    case "zoho":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className="integration-logo__svg">
          <rect width="32" height="32" rx="7" fill="#E42527" />
          <text
            x="16"
            y="21"
            textAnchor="middle"
            fill="#fff"
            fontSize="11"
            fontWeight="700"
            fontFamily="Arial, sans-serif"
          >
            zoho
          </text>
        </svg>
      );
    case "calendly":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className="integration-logo__svg">
          <rect width="32" height="32" rx="7" fill="#006BFF" />
          <circle cx="16" cy="16" r="8" fill="none" stroke="#fff" strokeWidth="2.2" />
          <path
            d="M16 10.5v6l4 2.2"
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "teams":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className="integration-logo__svg">
          <rect width="32" height="32" rx="7" fill="#5059C9" />
          <rect x="8" y="11" width="11" height="13" rx="2" fill="#7B83EB" />
          <circle cx="13.5" cy="8.5" r="2.3" fill="#fff" />
          <circle cx="21.5" cy="11" r="2" fill="#B6BBF8" />
          <rect x="18" y="13.5" width="7" height="8.5" rx="1.5" fill="#fff" opacity="0.95" />
        </svg>
      );
    case "heroku":
      return (
        <svg viewBox="0 0 32 32" aria-hidden className="integration-logo__svg">
          <rect width="32" height="32" rx="7" fill="#430098" />
          <path
            d="M11 8h3.2v6.2c0 1.7.7 2.6 2.3 2.6.4 0 .8 0 1.2-.1V20c-.5.1-1.1.2-1.7.2-3.1 0-5-1.9-5-5.4V8zm7.4 0H22v12h-3.6V8z"
            fill="#fff"
          />
          <path
            d="M18.4 14.2c1.1-.9 2.4-1.4 3.6-1.4v3.1c-.8 0-1.7.3-2.5.9l-1.1.9v-3.5z"
            fill="#fff"
          />
        </svg>
      );
  }
}

type Props = {
  outlookConnected: boolean;
  onConnectOutlook: () => void;
};

export function IntegrationsView({
  outlookConnected,
  onConnectOutlook,
}: Props) {
  return (
    <section className="view-panel" aria-label="Integrations">
      <div className="view-panel__head">
        <div>
          <p className="view-panel__eyebrow">System</p>
          <h2>Integrations</h2>
          <p className="view-panel__sub">
            Connect email, CRM, and meeting tools used by marketing and sales.
          </p>
        </div>
      </div>

      <div className="integration-grid">
        {INTEGRATIONS.map((item) => (
          <article key={item.id} className="integration-card">
            <div className="integration-card__top">
              <div className="integration-card__brand">
                <span className="integration-logo" aria-hidden>
                  <IntegrationLogo id={item.id} />
                </span>
                <h3>{item.name}</h3>
              </div>
              <span
                className={`eng-pill ${item.status === "Available" ? "eng-pill--high" : "eng-pill--none"}`}
              >
                {item.id === "outlook" && outlookConnected
                  ? "Connected"
                  : item.status}
              </span>
            </div>
            <p>{item.purpose}</p>
            {item.id === "outlook" ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onConnectOutlook}
              >
                {outlookConnected ? "Manage Outlook" : "Connect Outlook"}
              </button>
            ) : (
              <p className="integration-card__note">Coming in a later phase</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
