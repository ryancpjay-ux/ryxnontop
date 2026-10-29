import { providerErrorMessage } from "./providerErrors";
export function windowsProviderError(status: number, retry: string | null, body: unknown, name: string) {
  const error = (body as {error?: {message?: string; details?: {reason?: string}[]}} | null)?.error;
  const message = String(error?.message ?? "");
  const reasons = error?.details?.map(item => item.reason ?? "").join(" ") ?? "";
  if (/API_KEY_INVALID|API_KEY_EXPIRED/i.test(reasons) || /API key not valid|invalid api key|api key.*expired/i.test(message))
    return `${name}: invalid or expired API key (${status}). Replace this provider's key in Settings and use Test API Connection. No model change can repair a rejected key.`;
  if (/API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED/i.test(reasons))
    return `${name}: this key's API restrictions block this desktop app (${status}). Check the key's service and application restrictions in your provider project.`;
  if (name === "Claude" && /not scoped to a workspace|anthropic-workspace-id/i.test(message))
    return "Claude: this key needs a workspace. Create a key scoped to your Claude workspace in the Claude Console, then replace it in API Connections.";
  if (/model.*(?:not found|not supported|unavailable|does not exist)/i.test(message))
    return `${name}: model unavailable (${status}). Select a model your API project can access.`;
  if (/insufficient.*quota|billing|credit balance/i.test(message))
    return `${name}: API credits or quota unavailable (${status}). Check API billing and usage.`;
  // Never echo an arbitrary server-supplied message containing possible credentials.
  return providerErrorMessage(status, retry, {error: {...error, message: undefined}}, name);
}
