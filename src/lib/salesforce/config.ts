export const SALESFORCE_SCOPES = "api refresh_token offline_access";

export function getSalesforceConfig() {
  const clientId = process.env.SALESFORCE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET?.trim() ?? "";
  // login.salesforce.com for production / Developer Edition, test.salesforce.com for sandboxes,
  // or a My Domain URL (https://yourname.my.salesforce.com).
  const loginUrl = (
    process.env.SALESFORCE_LOGIN_URL?.trim() || "https://login.salesforce.com"
  ).replace(/\/+$/, "");
  const redirectUri =
    process.env.SALESFORCE_REDIRECT_URI?.trim() ||
    "http://localhost:3000/api/salesforce/callback";
  const apiVersion = process.env.SALESFORCE_API_VERSION?.trim() || "v62.0";
  const configured = Boolean(clientId && clientSecret);

  return {
    clientId,
    clientSecret,
    loginUrl,
    redirectUri,
    apiVersion,
    configured,
    authorizeUrl: `${loginUrl}/services/oauth2/authorize`,
    tokenUrl: `${loginUrl}/services/oauth2/token`,
  };
}
