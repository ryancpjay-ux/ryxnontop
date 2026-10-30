import { app, type BrowserWindow } from "electron";
import { initDesktopUpdater, getDesktopUpdateStatus, checkDesktopUpdates, installDesktopUpdate } from "./desktopUpdater";
export type UpdaterStatus =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "available"; version: string; summary?: string }
  | { type: "not-available"; version: string }
  | { type: "downloading"; percent: number; version?: string; summary?: string }
  | { type: "downloaded"; version: string; summary?: string }
  | { type: "error"; message: string };
export const getUpdaterStatus = getDesktopUpdateStatus;
export const getAppVersion = () => app.getVersion();
export function initAutoUpdater(..._args: [() => BrowserWindow | null]) { initDesktopUpdater(); }
export async function checkForUpdates(..._args: [boolean?]) { await checkDesktopUpdates(); }
export const installDownloadedUpdate = installDesktopUpdate;
