import WebSocket from "ws";
import type { ProviderKeys } from "./credentials";
import { validateWindowsKey } from "./windowsKeys";
import { windowsProviderError } from "./windowsProviderErrors";
import { providerRequest, providerChunk } from "./providers";

export const SAVED_KEY = "__RYX_WINDOWS_SAVED_KEY__";
export type ConnectionService = "openai" | "gemini" | "anthropic" | "deepgram";
export const keyFields = { openai: "openaiKey", gemini: "geminiKey", deepgram: "deepgramKey", anthropic: "anthropicKey" } as const;
export function maskedWindowsKeys(keys: ProviderKeys): ProviderKeys {
  return Object.fromEntries(Object.entries(keys).map(([field, value]) => [field, value ? SAVED_KEY : ""])) as unknown as ProviderKeys;
}
export function mergeWindowsKeys(value: unknown, current: ProviderKeys): unknown {
  if (!value || typeof value !== "object") throw new Error("Invalid key settings.");
  return Object.fromEntries(Object.values(keyFields).map(field => {
    const entry = (value as Record<string, unknown>)[field];
    return [field, entry === SAVED_KEY ? current[field] ?? "" : entry ?? ""];
  }));
}
export function connectionKey(service: keyof typeof keyFields, value: string | undefined, keys: ProviderKeys) {
  return validateWindowsKey(value === undefined || value === SAVED_KEY ? keys[keyFields[service]] ?? "" : value, service);
}
export function deepgramFailure(status: number) {
  if (status === 401) return "Deepgram: invalid or revoked API key. Replace the Deepgram key in API Connections.";
  if (status === 403) return "Deepgram: insufficient speech-recognition permissions. Check the project's key permissions.";
  if (status === 402 || status === 429) return "Deepgram: account credits, quota, or rate limit reached. Check billing and usage before retrying.";
  if (status === 400) return "Deepgram: unsupported transcription settings. Check the selected language and Nova-3 support.";
  return `Deepgram: service or network failure (${status}). Check your connection and try again.`;
}
/** Trusted main-process header authentication: no API key in a URL or subprotocol. */
export function openDeepgram(key: string, language: string, timeoutMs = 12000, signal?: AbortSignal): Promise<WebSocket> {
  if (!/^[a-zA-Z-]{2,16}$/.test(language)) return Promise.reject(new Error("Deepgram: unsupported spoken language."));
  const params = new URLSearchParams({ model: "nova-3", language, smart_format: "true", no_delay: "true", interim_results: "true", endpointing: "200", utterance_end_ms: "1000", vad_events: "true" });
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, { headers: { Authorization: `Token ${validateWindowsKey(key, "deepgram")}` }, handshakeTimeout: timeoutMs, maxPayload: 1024 * 1024 });
    const abort = () => fail("Transcription cancelled.");
    const fail = (message: string) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); socket.terminate(); reject(new Error(message)); };
    const timer = setTimeout(() => fail("Deepgram: WebSocket connection timed out. Check the network or firewall."), timeoutMs);
    socket.once("unexpected-response", (_request, response) => { response.resume(); fail(deepgramFailure(response.statusCode ?? 0)); });
    socket.once("error", () => fail("Deepgram: WebSocket connection failed. Check your network, firewall, and API configuration."));
    socket.once("open", () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(socket); });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
export async function testWindowsConnection(service: ConnectionService, key: string, model: string, language = "multi", request = fetch, connect = openDeepgram) {
  const started = performance.now();
  const signal = AbortSignal.timeout(20000);
  try {
    if (service === "deepgram") {
      const auth = await request("https://api.deepgram.com/v1/auth/token", { headers: { Authorization: `Token ${validateWindowsKey(key, service)}` }, signal });
      await auth.body?.cancel();
      if (!auth.ok) throw new Error(deepgramFailure(auth.status));
      const socket = await connect(key, language);
      socket.send(JSON.stringify({ type: "CloseStream" }));
      socket.close();
      const cleanup = setTimeout(() => socket.terminate(), 1000); cleanup.unref();
      return { connected: true, message: "Key accepted · live speech-recognition connection opened. Speech transcription still requires an audio test.", firstMs: performance.now() - started };
    }
    if (!/^[a-zA-Z0-9._-]{1,128}$/.test(model)) throw new Error("Choose a valid model ID.");
    const prepared = providerRequest({ provider: service, key: validateWindowsKey(key, service), model, fast: true, windowsLatency: true, prompt: "Reply with only the word Ready." });
    const response = await request(prepared.url, { method: "POST", headers: prepared.headers, body: JSON.stringify(prepared.body), signal });
    if (!response.ok) {
      let body: unknown; try { body = await response.json(); } catch { body = null; }
      throw new Error(windowsProviderError(response.status, response.headers.get("retry-after"), body, service === "openai" ? "OpenAI" : service === "anthropic" ? "Claude" : "Gemini"));
    }
    if (!response.body) throw new Error("Provider returned an empty response.");
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
    try {
      while (true) {
        const chunk = await reader.read();
        pending += decoder.decode(chunk.value, { stream: !chunk.done });
        const lines = pending.split("\n"); pending = chunk.done ? "" : lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") continue;
          if (providerChunk(service, JSON.parse(raw)).text) return { connected: true, message: `${model} generated a response.`, firstMs: performance.now() - started };
        }
        if (chunk.done) break;
      }
    } finally { await reader.cancel(); }
    throw new Error("The selected model returned no text. Choose another supported model and retry.");
  } catch (error) {
    if (signal.aborted) throw new Error("Connection test timed out. Check the provider status and network.");
    if (error instanceof TypeError) throw new Error("Network connection failed. Check Windows network, proxy, or firewall settings.");
    throw error;
  }
}
