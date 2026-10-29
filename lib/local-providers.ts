export type Provider = "gemini" | "openai" | "anthropic";
export const providerLabels: Record<Provider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Claude (Anthropic)",
};
export const defaultModels: Record<Provider, string> = {
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-5.4-mini",
  anthropic: "claude-haiku-5-5",
};
export const modelPresets: Record<Provider, string[]> = {
  gemini: ["gemini-3.5-flash-lite", "gemini-3.8-flash"],
  openai: ["gpt-5.4-mini", "gpt-6-astra"],
  anthropic: ["claude-haiku-5-5", "claude-sonnet-5-5"],
};
