import { contextBridge, ipcRenderer } from "electron";

type ScreenAccessStatus =
  | "not-determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown";

type ScreenCaptureResult =
  | { success: true; dataUrl: string }
  | { success: false; error: string };

type UpdaterStatusPayload =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "available"; version: string; summary?: string }
  | { type: "not-available"; version: string }
  | { type: "downloading"; percent: number }
  | { type: "downloaded"; version: string; summary?: string }
  | { type: "error"; message: string };

contextBridge.exposeInMainWorld("localCopilot", {
  ...(process.platform === "win32" ? {
    testConnection: (input: unknown) => ipcRenderer.invoke("windows:connection-test", input),
    transcriptionOpen: (input: unknown) => ipcRenderer.invoke("windows:transcription-open", input),
    transcriptionSend: (id: string, data: ArrayBuffer | string) => ipcRenderer.invoke("windows:transcription-send", id, data),
    transcriptionClose: (id: string) => ipcRenderer.invoke("windows:transcription-close", id),
    onTranscription: (callback: (event: { id: string; type: string; data?: string | number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; type: string; data?: string | number }) => callback(payload);
      ipcRenderer.on("windows:transcription-event", handler);
      return () => ipcRenderer.removeListener("windows:transcription-event", handler);
    },
  } : {}),
  loadWorkspace: () => ipcRenderer.invoke("local:workspace-load"),
  saveWorkspace: (snapshot: string) =>
    ipcRenderer.invoke("local:workspace-save", snapshot),
  saveWorkspaceNow: (snapshot: string) =>
    ipcRenderer.sendSync("local:workspace-save-now", snapshot) as {
      success: boolean;
    },
  clearWorkspace: () => ipcRenderer.invoke("local:workspace-clear"),
  saveAudio: (bytes: Uint8Array, mime: string) =>
    ipcRenderer.invoke("local:save-audio", bytes, mime),
  openAudio: (filename: string) =>
    ipcRenderer.invoke("local:open-audio", filename),
  clearAudio: () => ipcRenderer.invoke("local:clear-audio"),
  exportPDF: (input: { title: string; html: string }) =>
    ipcRenderer.invoke("local:export-pdf", input),
  shareNote: (text: string) => ipcRenderer.invoke("local:share-note", text),
  screens: () => ipcRenderer.invoke("local:screens"),
  setNetwork: (enabled: boolean) =>
    ipcRenderer.invoke("local:network", enabled),
  saveKeysNow: (keys: {
    geminiKey: string;
    deepgramKey: string;
    openaiKey?: string;
    anthropicKey?: string;
  }) =>
    ipcRenderer.sendSync("local:keys-save-now", keys) as { success: boolean },
  loadKeys: () => ipcRenderer.invoke("local:keys-load"),
  saveKeys: (keys: {
    geminiKey: string;
    deepgramKey: string;
    openaiKey?: string;
    anthropicKey?: string;
  }) => ipcRenderer.invoke("local:keys-save", keys),
  prepareAudio: (source: string) =>
    ipcRenderer.invoke("local:prepare-audio", source),
  permissions: () => ipcRenderer.invoke("local:permissions"),
  permission: (kind: string) => ipcRenderer.invoke("local:permission", kind),
  hide: () => ipcRenderer.invoke("local:hide"),
  reply: (input: unknown) => ipcRenderer.invoke("local:reply", input),
  cancel: (id: string) => ipcRenderer.invoke("local:cancel", id),
  onChunk: (
    callback: (chunk: {
      id: string;
      text: string;
      modelVersion?: string;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      chunk: { id: string; text: string; modelVersion?: string },
    ) => callback(chunk);
    ipcRenderer.on("local:chunk", handler);
    return () => ipcRenderer.removeListener("local:chunk", handler);
  },
});
contextBridge.exposeInMainWorld("electronAPI", {
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowAlwaysOnTop: (flag: boolean) =>
    ipcRenderer.invoke("window-always-on-top", flag),
  windowIsAlwaysOnTop: () => ipcRenderer.invoke("window-is-always-on-top"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  windowSetSize: (width: number, height: number) =>
    ipcRenderer.invoke("window-set-size", width, height),
  windowSetResizable: (resizable: boolean) =>
    ipcRenderer.invoke("window-set-resizable", resizable),
  windowSetIgnoreMouseEvents: (
    ignore: boolean,
    options?: { forward?: boolean },
  ) => ipcRenderer.invoke("window-set-ignore-mouse-events", ignore, options),
  windowFocus: () => ipcRenderer.invoke("window-focus"),
  windowSetFocusable: (focusable: boolean) =>
    ipcRenderer.invoke("window-set-focusable", focusable),
  onWindowFocus: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("window:focus", handler);
    return () => ipcRenderer.removeListener("window:focus", handler);
  },
  appQuit: () => ipcRenderer.invoke("app-quit"),
  appRelaunch: () => ipcRenderer.invoke("app-relaunch"),
  updaterGetVersion: () => ipcRenderer.invoke("updater:get-version"),
  updaterGetStatus: () => ipcRenderer.invoke("updater:get-status"),
  updaterCheck: () => ipcRenderer.invoke("updater:check"),
  updaterInstall: () => ipcRenderer.invoke("updater:install"),
  ...(process.platform === "win32" ? {
    windowsUpdaterPreferences: () => ipcRenderer.invoke("windows:updater-preferences"),
    windowsUpdaterSavePreferences: (input: unknown) => ipcRenderer.invoke("windows:updater-preferences-save", input),
    windowsUpdaterDownload: () => ipcRenderer.invoke("windows:updater-download"),
  } : {}),
  onUpdaterStatus: (callback: (status: UpdaterStatusPayload) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: UpdaterStatusPayload,
    ) => callback(status);
    ipcRenderer.on("updater:status", handler);
    return () => ipcRenderer.removeListener("updater:status", handler);
  },
  platform: process.platform,
  isElectron: true,
  supportsSystemAudio: true,
  screen: {
    getAccess: (): Promise<ScreenAccessStatus> =>
      ipcRenderer.invoke("screen:get-access"),
    openSettings: (): Promise<boolean> =>
      ipcRenderer.invoke("screen:open-settings"),
    triggerPrompt: (): Promise<ScreenAccessStatus> =>
      ipcRenderer.invoke("screen:trigger-prompt"),
    capture: (sourceId?: string, preview?: boolean): Promise<ScreenCaptureResult> =>
      ipcRenderer.invoke("screen:capture", sourceId, preview),
    onCaptureAndAsk: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("screen:capture-and-ask", handler);
      return () =>
        ipcRenderer.removeListener("screen:capture-and-ask", handler);
    },
  },
});

export interface ElectronAPI {
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<boolean>;
  windowClose: () => Promise<void>;
  windowAlwaysOnTop: (flag: boolean) => Promise<boolean>;
  windowIsAlwaysOnTop: () => Promise<boolean>;
  windowIsMaximized: () => Promise<boolean>;
  windowSetSize: (width: number, height: number) => Promise<void>;
  windowSetResizable: (resizable: boolean) => Promise<boolean>;
  windowSetIgnoreMouseEvents: (
    ignore: boolean,
    options?: { forward?: boolean },
  ) => Promise<void>;
  windowFocus: () => Promise<void>;
  windowSetFocusable?: (focusable: boolean) => Promise<boolean>;
  onWindowFocus?: (callback: () => void) => () => void;
  appQuit: () => Promise<void>;
  appRelaunch: () => Promise<void>;
  updaterGetVersion: () => Promise<string>;
  updaterGetStatus: () => Promise<UpdaterStatusPayload>;
  updaterCheck: () => Promise<void>;
  updaterInstall?: () => Promise<void>;
  windowsUpdaterPreferences?: () => Promise<{automatic: boolean; backgroundDownload: boolean}>;
  windowsUpdaterSavePreferences?: (input: {automatic: boolean; backgroundDownload: boolean}) => Promise<{automatic: boolean; backgroundDownload: boolean}>;
  windowsUpdaterDownload?: () => Promise<void>;
  onUpdaterStatus: (
    callback: (status: UpdaterStatusPayload) => void,
  ) => () => void;
  platform: string;
  isElectron: boolean;
  supportsSystemAudio: boolean;
  screen: {
    getAccess: () => Promise<ScreenAccessStatus>;
    openSettings: () => Promise<boolean>;
    triggerPrompt: () => Promise<ScreenAccessStatus>;
    capture: (sourceId?: string, preview?: boolean) => Promise<ScreenCaptureResult>;
    onCaptureAndAsk: (callback: () => void) => () => void;
  };
}
