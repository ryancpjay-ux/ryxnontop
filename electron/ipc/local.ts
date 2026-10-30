import {handleTrusted} from "../security/ipc";
import {
  ipcMain,
  systemPreferences,
  shell,
  type BrowserWindow,
  session,
  app,
} from "electron";
import { isTrustedOrigin } from "../security/origin";

import {
  providerRequest,
  providerChunk,
  providerName,
  type AIProvider,
} from "../providers";
import { prepareAudioCapture } from "../audioPermissions";
import { createCredentialStore } from "../credentials";
import { createWindowsCredentialStore } from "../windowsCredentials";
import { windowsProviderError } from "../windowsProviderErrors";
import { windowsCaptureConsent } from "../windowsCapture";
import { createWorkspaceStore } from "../workspace";

import { maskedWindowsKeys, mergeWindowsKeys, connectionKey, testWindowsConnection, openDeepgram } from "../windowsConnections";
import type WebSocket from "ws";

const requests = new Map<string, AbortController>();
let networkEnabled = true;
const activeRenderers = new Set<number>();
const trackedRenderers = new WeakSet<object>();
let windowsWorkActive = () => false;
export function isDesktopWorkActive() { return requests.size > 0 || activeRenderers.size > 0 || windowsWorkActive(); }
export const isWindowsWorkActive = isDesktopWorkActive;

export function registerLocalIpc(getWindow: () => BrowserWindow | null) {
  const credentials = process.platform === "win32" ? createWindowsCredentialStore() : createCredentialStore();
  const workspace = createWorkspaceStore();
  handleTrusted("local:activity", (event, active: unknown) => {
    if (typeof active !== "boolean") throw new Error("Invalid activity status.");
    const sender = event.sender;
    if (active && !activeRenderers.has(sender.id)) {
      activeRenderers.add(sender.id);
      if (!trackedRenderers.has(sender)) {
        trackedRenderers.add(sender);
        sender.once("destroyed", () => activeRenderers.delete(sender.id));
      }
    } else if (!active) activeRenderers.delete(sender.id);
  });
  const saveKeys = (value: unknown) => credentials.save(process.platform === "win32" ? mergeWindowsKeys(value, credentials.load()) : value);
  const openingSockets = new Map<string, { owner: number; controller: AbortController }>();
  const sockets = new Map<string, { socket: WebSocket; owner: number }>();
  if (process.platform === "win32") {
    windowsWorkActive = () => requests.size > 0 || openingSockets.size > 0 || sockets.size > 0;
  }
  if (["win32", "darwin"].includes(process.platform)) {
    handleTrusted("desktop:connection-test", async (_event, input: { service: "openai" | "gemini" | "anthropic" | "deepgram"; key?: string; model: string; language?: string }) => {
      if (!networkEnabled) throw new Error("Enable network access in Privacy before testing connections.");
      if (!input || !["openai", "gemini", "anthropic", "deepgram"].includes(input.service)) throw new Error("Invalid connection service.");
      return testWindowsConnection(input.service, connectionKey(input.service, input.key, credentials.load()), input.model, input.language);
    });
  }
  if (process.platform === "win32") {
    handleTrusted("windows:connection-test", async (_event, input: { service: "openai" | "gemini" | "anthropic" | "deepgram"; key?: string; model: string; language?: string }) => {
      if (!networkEnabled) throw new Error("Enable network access in Privacy before testing connections.");
      if (!input || !["openai", "gemini", "anthropic", "deepgram"].includes(input.service)) throw new Error("Invalid connection service.");
      return testWindowsConnection(input.service, connectionKey(input.service, input.key, credentials.load()), input.model, input.language);
    });
    handleTrusted("windows:transcription-open", async (event, input: { id: string; language: string }) => {
      if (!networkEnabled) throw new Error("Listen is unavailable in offline mode.");
      if (!input || typeof input.id !== "string" || input.id.length > 128) throw new Error("Invalid transcription session.");
      if (sockets.has(input.id) || openingSockets.has(input.id)) throw new Error("Transcription session already exists.");
      if ([...sockets.values(), ...openingSockets.values()].some(item => item.owner === event.sender.id)) throw new Error("Stop the existing Listen session before starting another.");
      const controller = new AbortController();
      openingSockets.set(input.id, { owner: event.sender.id, controller });
      const cancelOpening = () => controller.abort(); event.sender.once("destroyed", cancelOpening);
      let socket: WebSocket;
      try { socket = await openDeepgram(connectionKey("deepgram", undefined, credentials.load()), input.language, 12000, controller.signal); }
      finally { openingSockets.delete(input.id); event.sender.removeListener("destroyed", cancelOpening); }
      if (!networkEnabled || event.sender.isDestroyed()) { socket.terminate(); throw new Error("Transcription cancelled."); }
      sockets.set(input.id, { socket, owner: event.sender.id });
      const send = (type: string, data?: string | number) => { if (!event.sender.isDestroyed()) event.sender.send("windows:transcription-event", { id: input.id, type, data }); };
      const destroy = () => socket.terminate(); event.sender.once("destroyed", destroy);
      socket.on("message", data => send("message", data.toString()));
      socket.on("error", () => send("error", "Deepgram connection interrupted."));
      socket.once("close", code => { sockets.delete(input.id); event.sender.removeListener("destroyed", destroy); send("close", code); });
    });
    handleTrusted("windows:transcription-send", (event, id: string, data: ArrayBuffer | string) => {
      const item = sockets.get(id); if (!item || item.owner !== event.sender.id || item.socket.readyState !== 1) return;
      if (typeof data === "string") { if (!['KeepAlive', 'CloseStream', 'Finalize'].includes(JSON.parse(data).type)) throw new Error("Invalid transcription message."); item.socket.send(data); }
      else if (data instanceof ArrayBuffer && data.byteLength <= 1024 * 1024) item.socket.send(Buffer.from(data));
      else throw new Error("Invalid audio chunk.");
    });
    handleTrusted("windows:transcription-close", (event, id: string) => {
      const opening = openingSockets.get(id); if (opening?.owner === event.sender.id) opening.controller.abort();
      const item = sockets.get(id); if (item?.owner === event.sender.id) { item.socket.terminate(); sockets.delete(id); }
    });
  }
  handleTrusted("local:workspace-load", (event) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    return workspace.load();
  });
  handleTrusted("local:workspace-save", (event, snapshot: string) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    workspace.save(snapshot);
  });
  ipcMain.on("local:workspace-save-now", (event, snapshot: string) => {
    try {
      if (!isTrustedOrigin(event.sender.getURL()))
        throw new Error("Untrusted origin");
      workspace.save(snapshot);
      event.returnValue = { success: true };
    } catch {
      event.returnValue = { success: false };
    }
  });
  handleTrusted("local:workspace-clear", async (event) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    workspace.clear();
    await session.defaultSession.clearStorageData({
      storages: ["localstorage"],
    });
  });
  // Renderer WebSockets use Electron networking; main-process AI requests have
  // the explicit guard below and are aborted when this switch is changed.
  if (app?.whenReady)
    void app.whenReady().then(() => {
      require("../updater").initAutoUpdater(getWindow);
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
        (details, callback) => {
          let local = false;
          try {
            const url = new URL(details.url);
            local =
              url.hostname === "localhost" ||
              url.hostname === "127.0.0.1" ||
              url.hostname === "[::1]";
          } catch {
            /* blocked below */
          }
          callback({ cancel: !networkEnabled && !local });
        },
      );
    });
  handleTrusted("local:network", (event, enabled: boolean) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    if (typeof enabled !== "boolean")
      throw new Error("Invalid network setting");
    networkEnabled = enabled;
    if (!enabled) { for (const request of requests.values()) request.abort(); for (const item of sockets.values()) item.socket.terminate(); sockets.clear(); for (const item of openingSockets.values()) item.controller.abort(); }
  });
  ipcMain.on("local:keys-save-now", (event, keys: unknown) => {
    try {
      if (!isTrustedOrigin(event.sender.getURL()))
        throw new Error("Untrusted origin");
      saveKeys(keys);
      event.returnValue = { success: true };
    } catch {
      event.returnValue = { success: false };
    }
  });
  handleTrusted("local:keys-load", (event) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    const keys = credentials.load();
    return process.platform === "win32" ? maskedWindowsKeys(keys) : keys;
  });
  handleTrusted("local:keys-save", (event, keys: unknown) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    saveKeys(keys);
  });
  handleTrusted("local:prepare-audio", async (event, source: string) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    if (process.platform === "win32") {
      if (source !== "microphone" && source !== "system") throw new Error("Invalid audio source.");
      if (!await windowsCaptureConsent().request(source === "microphone" ? "microphone" : "screen")) throw new Error("Capture access was not approved. Press Start to allow it when ready.");
    }
    await prepareAudioCapture(source);
  });
  handleTrusted("local:permissions", (event) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    return {
      microphone:
        process.platform === "darwin"
          ? systemPreferences.getMediaAccessStatus("microphone")
          : "granted",
      accessibility:
        process.platform === "darwin"
          ? systemPreferences.isTrustedAccessibilityClient(false)
          : true,
    };
  });
  handleTrusted("local:permission", async (event, kind: string) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    if (process.platform === "win32") {
      if(kind === "microphone") {
        windowsCaptureConsent().revoke("microphone");
        await shell.openExternal("ms-settings:privacy-microphone");
      }
      if(kind === "system-audio") await shell.openExternal("ms-settings:sound");
      return;
    }
    if (process.platform !== "darwin") return;
    if (kind === "microphone") {
      if (
        systemPreferences.getMediaAccessStatus("microphone") ===
        "not-determined"
      ) {
        await systemPreferences.askForMediaAccess("microphone");
      } else if (
        systemPreferences.getMediaAccessStatus("microphone") !== "granted"
      ) {
        await shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        );
      }
    } else if (kind === "accessibility") {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      );
    }
  });
  handleTrusted("local:cancel", (event, id: string) => {
    if (!isTrustedOrigin(event.sender.getURL())) return;
    requests.get(id)?.abort();
  });
  handleTrusted(
    "local:reply",
    async (
      event,
      input: {
        id: string;
        provider?: AIProvider;
        key: string;
        model: string;
        prompt: string;
        fast?: boolean;
        image?: string;
      },
    ) => {
      if (!isTrustedOrigin(event.sender.getURL()))
        throw new Error("Untrusted origin");
      if (!networkEnabled)
        throw new Error(
          "The app is offline. Enable network access in Privacy to use AI.",
        );
      if (
        !input || typeof input !== "object" ||
        typeof input.id !== "string" || !input.id || input.id.length>128 ||
        typeof input.key !== "string" || !input.key || input.key.length>8192 ||
        typeof input.model !== "string" || input.model.length>128 ||
        typeof input.prompt !== "string" ||
        (input.image !== undefined && typeof input.image !== "string") ||
        !/^[a-zA-Z0-9._-]+$/.test(input.model) ||
        input.prompt.length > 180000
      )
        throw new Error("Check your API key, model, and context size.");
      const controller = new AbortController();
      requests.get(input.id)?.abort();
      requests.set(input.id, controller);
      const onDestroyed = () => controller.abort();
      event.sender.once?.("destroyed", onDestroyed);
      let timedOut=false;
      const timeout = setTimeout(() => {timedOut=true;controller.abort();}, 45000);
      try {
        const provider = input.provider ?? "gemini";
        const prepared = providerRequest(process.platform === "win32" ? {...input, windowsLatency: true, key: connectionKey(provider, input.key, credentials.load())} : {...input, windowsLatency: true});
        const response = await fetch(prepared.url, {
          method: "POST",
          signal: controller.signal,
          headers: prepared.headers,
          body: JSON.stringify(prepared.body),
        });
        if (!response.ok) {
          let body: unknown = null;
          try {
            body = await response.json();
          } catch {
            /* Non-JSON proxy errors. */
          }
          throw new Error(
            windowsProviderError(
              response.status,
              response.headers?.get("retry-after") ?? null,
              body,
              providerName(provider),
            ),
          );
        }
        if (!response.body)
          throw new Error(
            `${providerName(provider)} returned an empty response.`,
          );
        let pending = "";
        let answer = "";
        const decoder = new TextDecoder();
        const consume = (line: string) => {
          if (!line.startsWith("data:")) return;
          const payload = line.slice(5).trimStart();
          if (payload.trim() === "[DONE]") return;
          const data = JSON.parse(payload);
          const { text, modelVersion } = providerChunk(provider, data);
          answer += text;
          if ((text || modelVersion) && !event.sender.isDestroyed())
            event.sender.send("local:chunk", {
              id: input.id,
              text,
              modelVersion:
                typeof modelVersion === "string"
                  ? modelVersion.slice(0, 120)
                  : undefined,
            });
        };
        for await (const chunk of response.body) {
          pending += decoder.decode(chunk, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) consume(line.trimEnd());
        }
        if (pending.trim()) consume(pending.trimEnd());
        if (!answer)
          throw new Error("No answer returned. Try rephrasing your question.");
        return answer;
      } catch(error) {
        if(timedOut) throw new Error("AI request timed out after 45 seconds. Try a faster model or check the provider status.");
        if(controller.signal.aborted) throw new Error("Request cancelled.");
        if(process.platform === "win32" && error instanceof TypeError) throw new Error("Network connection failed. Check your Windows network, proxy, or firewall and retry.");
        throw error;
      } finally {
        clearTimeout(timeout);
        if(requests.get(input.id)===controller) requests.delete(input.id);
        event.sender.removeListener?.("destroyed", onDestroyed);
      }
    },
  );
  handleTrusted("local:hide", (event) => {
    if (isTrustedOrigin(event.sender.getURL())) getWindow()?.hide();
  });
}
