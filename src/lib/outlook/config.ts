export const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Send",
].join(" ");

/**
 * Delivery tracking is opt-in: reading Sent Items / bounces needs Mail.Read, and some
 * company tenants require admin approval for it. Normal sending keeps working
 * with Mail.Send only.
 */
export const OUTLOOK_TRACKING_SCOPES = `${OUTLOOK_SCOPES} Mail.Read`;

export function getOutlookConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "";
  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || "common";
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI?.trim() ||
    "http://localhost:3000/api/outlook/callback";
  const configured = Boolean(clientId && clientSecret);

  return {
    clientId,
    clientSecret,
    tenant,
    redirectUri,
    configured,
    graphBase:
      process.env.MICROSOFT_GRAPH_BASE_URL?.trim().replace(/\/+$/, "") ||
      "https://graph.microsoft.com/v1.0",
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}
