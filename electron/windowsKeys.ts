/** Windows clipboard cleanup; never logs keys or changes another platform's storage. */
export function normalizeWindowsKey(value: string): string {
  let key = value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (key.length >= 2 && ["\"", "'", "`"].includes(key[0]) && key[key.length - 1] === key[0])
    key = key.slice(1, -1).trim();
  return key;
}
export function validateWindowsKey(value: string, provider: string): string {
  const key = normalizeWindowsKey(value);
  const name = provider === "deepgram" ? "Deepgram" : provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Claude" : "Gemini";
  if (!key || /\s|[^\x21-\x7E]/.test(key) || /^https?:\/\//i.test(key))
    throw new Error(`${name}: paste only the API key in Settings, without a URL, spaces, or line breaks.`);
  // Deepgram documents ["token", apiKey] for browser WebSocket authentication.
  if (provider === "deepgram" && (key === "token" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)))
    throw new Error("Deepgram: invalid key format. Paste the raw Deepgram API key in Settings > Listen; not a Gemini/OpenAI key or a link.");
  return key;
}
