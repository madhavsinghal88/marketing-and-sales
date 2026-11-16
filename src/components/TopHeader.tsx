type Props = {
  outlookConnected: boolean;
  outlookMode: "demo" | "live" | null;
  mailbox: string | null;
  oauthConfigured: boolean;
  connecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  userName: string;
};

export function TopHeader({
  outlookConnected,
  outlookMode,
  mailbox,
  oauthConfigured,
  connecting,
  onConnect,
  onDisconnect,
  userName,
}: Props) {
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="topbar">
      <h1 className="topbar__title">Event Email Automation</h1>

      <div className="topbar__right">
        {outlookConnected ? (
          <div className="outlook-connected">
            <button
              type="button"
              className="outlook-chip is-on"
              onClick={onDisconnect}
              title="Click to disconnect"
            >
              <span className="outlook-chip__check" aria-hidden>
                ✓
              </span>
              Outlook Connected
              {outlookMode === "demo" ? " (demo)" : ""}
            </button>
            {mailbox ? (
              <span className="outlook-mailbox" title={mailbox}>
                {mailbox}
              </span>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="outlook-chip"
            onClick={onConnect}
            disabled={connecting}
          >
            <span className="outlook-chip__check" aria-hidden>
              ○
            </span>
            {connecting
              ? "Connecting…"
              : oauthConfigured
                ? "Connect Outlook"
                : "Connect Outlook (demo)"}
          </button>
        )}

        <button type="button" className="icon-btn" aria-label="Notifications">
          🔔
        </button>

        <div className="user-chip">
          <span className="user-chip__avatar">{initials}</span>
          <span className="user-chip__name">{userName}</span>
        </div>
      </div>
    </header>
  );
}
