export const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Send",
].join(" ");

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
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}
