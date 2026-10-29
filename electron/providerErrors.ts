type ErrorBody = { error?: { code?: string; type?: string; message?: string; details?: {retryDelay?: string; violations?: {quotaId?: string}[]}[] }; message?: string };
export function providerErrorMessage(status: number, retryAfter: string | null, body: unknown, name = "Gemini") {
 const error = (body as ErrorBody | null)?.error;
 const code = String(error?.code ?? error?.type ?? "");
 const detail = String(error?.message ?? (body as ErrorBody | null)?.message ?? "")
  .replace(/(?:sk-|AIza)[A-Za-z0-9_-]{12,}/g,"[redacted]").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,400);
 const suffix = detail ? ` ${detail}` : "";
 if (/insufficient_quota|billing|credit_balance/i.test(code + " " + detail)) return `${name}: API credits or quota unavailable${status ? ` (${status})` : ""}. Check API billing and usage; a chat subscription does not include API credits.`;
 if(status===401 || /authentication|invalid_api_key/i.test(code)) return `${name}: API key rejected (401). Check the key in Settings.`;
 if(status===403) return `${name}: account or model access denied (403). Check project permissions and model availability.${suffix}`;
 if(status===404 || /model_not_found|model.*not.*exist/i.test(code+" "+detail)) return `${name}: model unavailable (404). Select a model your API project can access.${suffix}`;
 if(status===429 || /rate_limit/i.test(code)) {
  const details=error?.details ?? [];
  const daily=details.some(d=>d.violations?.some(v=>/perday/i.test(v.quotaId??"")));
  const delay=Number(retryAfter)||Number(details.find(d=>d.retryDelay)?.retryDelay?.replace(/s$/,""));
  return daily ? `${name} daily quota reached (429). Check project usage. Your transcript is still saved.` : `${name} rate limit reached (429). ${Number.isFinite(delay)&&delay>0?`Retry after ${Math.ceil(delay)} seconds.`:"Wait for your project's quota window to reset, then retry."} Listen can keep transcribing.`;
 }
 if(status===400 || status===422 || /invalid_request|invalid_value|unsupported/i.test(code)) return `${name}: request or model setting rejected (${status||400}).${suffix || " Check the selected model and supported capabilities."}`;
 if(status===408 || status===504 || /timeout/i.test(code)) return `${name}: request timed out. Retry or select a faster model.`;
 if(status>=500) return `${name} is temporarily busy (${status}). Retry in a moment; your transcript is still available.`;
 return `${name} request failed${status?` (${status})`:""}${code?` [${code.slice(0,80)}]`:""}.${suffix || " Check API access and try again."}`;
}
// Retained for existing callers and tests.
export const geminiErrorMessage = providerErrorMessage;
