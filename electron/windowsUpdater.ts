import type { UpdaterStatus } from "./updater";
import { app, BrowserWindow } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import fs from "fs";
import path from "path";
export type WindowsUpdatePreferences = { automatic: boolean; backgroundDownload: boolean };
export type WindowsUpdateStatus = UpdaterStatus;
let state: WindowsUpdateStatus = { type: "idle" };
let initialized = false;
let checking: Promise<void> | undefined;
let downloading: Promise<void> | undefined;
let preferences: WindowsUpdatePreferences = { automatic: true, backgroundDownload: false };
let available: { version: string; summary: string } | undefined;
const enabled = () => process.platform === "win32" && app.isPackaged && !process.env.DEV_PORT;
const preferencePath = () => path.join(app.getPath("userData"), "windows-updates.json");
function broadcast(next: WindowsUpdateStatus) {
  state = next;
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send("updater:status", next);
}
export const getWindowsUpdateStatus = () => state;
export const getWindowsUpdatePreferences = () => ({ ...preferences });
export function setWindowsUpdatePreferences(input: unknown) {
  if (process.platform !== "win32") throw new Error("Windows updates only.");
  if (!input || typeof input !== "object") throw new Error("Invalid update preferences.");
  const value = input as Record<string, unknown>;
  if (typeof value.automatic !== "boolean" || typeof value.backgroundDownload !== "boolean") throw new Error("Invalid update preferences.");
  const next = { automatic: value.automatic, backgroundDownload: value.backgroundDownload };
  fs.mkdirSync(path.dirname(preferencePath()), { recursive: true });
  fs.writeFileSync(`${preferencePath()}.tmp`, JSON.stringify(next));
  fs.renameSync(`${preferencePath()}.tmp`, preferencePath());
  preferences = next;
  // Downloads are started explicitly so changing a setting never interrupts an active transfer.
  if (next.backgroundDownload && state.type === "available") void downloadWindowsUpdate().catch(() => {});
  return getWindowsUpdatePreferences();
}
function summary(info: UpdateInfo) {
  const notes = typeof info.releaseNotes === "string" ? info.releaseNotes : (info.releaseNotes ?? []).map(note => note.note).join("\n");
  return notes.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
}
export function initWindowsUpdater() {
  if (!enabled() || initialized) return;
  initialized = true;
  try {
    const saved = JSON.parse(fs.readFileSync(preferencePath(), "utf8"));
    if (typeof saved.automatic === "boolean" && typeof saved.backgroundDownload === "boolean") preferences = { automatic: saved.automatic, backgroundDownload: saved.backgroundDownload };
  } catch { /* Default to checks enabled, optional downloads disabled. */ }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  const beta = /-beta\.\d+$/.test(app.getVersion());
  autoUpdater.channel = beta ? "beta" : "latest";
  autoUpdater.allowPrerelease = beta;
  // Setting channel enables downgrades in electron-updater; reset it afterwards.
  autoUpdater.allowDowngrade = false;
  autoUpdater.on("checking-for-update", () => broadcast({ type: "checking" }));
  autoUpdater.on("update-available", info => {
    available = { version: info.version, summary: summary(info) };
    broadcast({ type: "available", ...available });
    if (preferences.backgroundDownload) void downloadWindowsUpdate().catch(() => {});
  });
  autoUpdater.on("update-not-available", info => broadcast({ type: "not-available", version: info.version }));
  autoUpdater.on("download-progress", info => broadcast({ type: "downloading", ...available, percent: Math.max(0, Math.min(100, info.percent)) }));
  autoUpdater.on("update-downloaded", info => broadcast({ type: "downloaded", version: info.version, summary: summary(info) }));
  autoUpdater.on("error", () => broadcast({ type: "error", message: "Update failed. Check your network and retry. Your installed application has not been replaced." }));
  setTimeout(() => { if (preferences.automatic) void checkWindowsUpdates(); }, 30_000);
  setInterval(() => { if (preferences.automatic) void checkWindowsUpdates(); }, 8 * 60 * 60 * 1000);
}
export function checkWindowsUpdates(): Promise<void> {
  if (!enabled() || state.type === "downloaded" || state.type === "downloading" || downloading) return Promise.resolve();
  if (checking) return checking;
  checking = Promise.resolve().then(async () => {
    try { await autoUpdater.checkForUpdates(); }
    catch { broadcast({ type: "error", message: "Could not check stable releases. Check your network and try again." }); }
  }).finally(() => { checking = undefined; });
  return checking;
}
export function downloadWindowsUpdate(): Promise<void> {
  if (!enabled()) return Promise.reject(new Error("Updates require the installed Windows application."));
  if (downloading) return downloading;
  if (!available || !["available", "error"].includes(state.type)) return Promise.reject(new Error("Check for an available update first."));
  broadcast({ type: "downloading", ...available, percent: 0 });
  downloading = Promise.resolve().then(async () => {
    try { await autoUpdater.downloadUpdate(); }
    catch { broadcast({ type: "error", message: "Download failed or integrity verification failed. Retry; the current installation is unchanged." }); throw new Error("Update download failed. Please retry."); }
  }).finally(() => { downloading = undefined; });
  return downloading;
}
export function installWindowsUpdate() {
  if (enabled() && state.type === "downloaded") autoUpdater.quitAndInstall(true, true);
}
