import { downloadWindowsUpdate, getWindowsUpdatePreferences, setWindowsUpdatePreferences } from "../windowsUpdater";
import {handleTrusted} from "../security/ipc";
import { app, ipcMain } from "electron";

import {
  checkForUpdates,
  getAppVersion,
  getUpdaterStatus,
  installDownloadedUpdate,
} from "../updater";

/** App lifecycle IPC: quit + relaunch + updater.
 *
 *  Relaunch is needed after macOS Screen Recording permission changes
 *  because TCC state is cached per-process until the next launch. */
export function registerAppIpc(): void {
  handleTrusted("app-quit", () => {
    app.quit();
  });

  handleTrusted("app-relaunch", () => {
    app.relaunch();
    app.quit();
  });

  if (process.platform === "win32") {
    handleTrusted("windows:updater-preferences", () => getWindowsUpdatePreferences());
    handleTrusted("windows:updater-preferences-save", (_event, input: unknown) => setWindowsUpdatePreferences(input));
    handleTrusted("windows:updater-download", () => downloadWindowsUpdate());
  }

  handleTrusted("updater:get-version", () => getAppVersion());

  handleTrusted("updater:get-status", () => getUpdaterStatus());

  handleTrusted("updater:check", () => checkForUpdates(true));

  handleTrusted("updater:install", () => {
    if (process.platform === "win32" && require("./local").isWindowsWorkActive()) throw new Error("Finish Listen and Ask before restarting to install the update.");
    installDownloadedUpdate();
  });
}
