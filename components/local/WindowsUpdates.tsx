"use client";
import { useEffect, useState } from "react";
type Status = { type: string; version?: string; percent?: number; summary?: string; message?: string };
type Props = { save: () => Promise<void>; active?: boolean; compact?: boolean };
export default function WindowsUpdates({ save, active = false, compact = false }: Props) {
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [current, setCurrent] = useState("");
  const [preferences, setPreferences] = useState({ automatic: true, backgroundDownload: false });
  const [error, setError] = useState("");
  const [later, setLater] = useState("");
  const [applying, setApplying] = useState(false);
  useEffect(() => {
    const api = window.electronAPI;
    void api?.updaterGetStatus?.().then(setStatus).catch(() => setError("Update status is unavailable. Please retry."));
    void api?.updaterGetVersion?.().then(setCurrent).catch(() => {});
    void api?.windowsUpdaterPreferences?.().then(setPreferences).catch(() => setError("Update preferences could not be loaded."));
    return api?.onUpdaterStatus?.(setStatus);
  }, []);
  const perform = (action: (() => Promise<unknown>) | undefined) => {
    setError("");
    if (action) void action().catch(error => setError(error instanceof Error ? error.message : "Update action failed. Please retry."));
    else setError("This update action requires the installed Windows app.");
  };
  const updatePreference = (key: "automatic" | "backgroundDownload", value: boolean) => perform(async () => {
    const next = { ...preferences, [key]: value };
    const saved = await window.electronAPI?.windowsUpdaterSavePreferences?.(next);
    if (saved) setPreferences(saved);
  });
  const install = () => {
    if (active || applying) return;
    setApplying(true);
    perform(async () => {
      try { await save(); await window.electronAPI?.updaterInstall?.(); }
      finally { setApplying(false); }
    });
  };
  const description = status.type === "downloaded" ? `Version ${status.version} is ready. Restart when you're finished to install it.`
    : status.type === "downloading" ? `Downloading update · ${Math.round(status.percent ?? 0)}%`
    : status.type === "checking" ? "Checking stable GitHub Releases…"
    : status.type === "available" ? `A new version of ryxnontop is available: ${status.version}.`
    : status.type === "not-available" ? "You have the latest stable Windows release."
    : status.type === "error" ? status.message ?? "Could not check for updates. Check your connection and retry."
    : "Stable releases only. Updates preserve your saved credentials, preferences and history.";
  if (compact && (active || !["available", "downloaded", "downloading"].includes(status.type) || later === `${status.type}:${status.version}`)) return null;
  return <section className={compact ? "ryx-windows-update-notice" : "ryx-settings-card"} aria-label="Windows updates"><h2>{compact ? "ryxnontop update" : "Windows updates"}</h2>
    {!compact && <p className="ryx-settings-caption">Installed {current || "…"} · Stable channel</p>}
    <p role="status">{description}</p>
    {status.summary && <p className="ryx-settings-caption">{status.summary}</p>}
    {status.type === "downloading" && <progress aria-label="Update download progress" max={100} value={status.percent ?? 0} />}
    {!compact && <><label className="ryx-settings-option"><span>Automatically check for updates</span><input type="checkbox" checked={preferences.automatic} onChange={e => updatePreference("automatic", e.target.checked)} /></label>
      <label className="ryx-settings-option"><span>Download updates in the background</span><input type="checkbox" checked={preferences.backgroundDownload} onChange={e => updatePreference("backgroundDownload", e.target.checked)} /></label></>}
    <div className="ryx-settings-actions">
      {!compact && <button className="mist-soft-button" disabled={["checking", "downloading", "downloaded"].includes(status.type)} onClick={() => perform(window.electronAPI?.updaterCheck)}>Check for updates</button>}
      {status.type === "available" && <button className="mist-soft-button" onClick={() => perform(window.electronAPI?.windowsUpdaterDownload)}>Update now</button>}
      {status.type === "downloaded" && <button className="mist-soft-button" disabled={active || applying} onClick={install}>{applying ? "Saving…" : "Restart and install"}</button>}
      {compact && <button className="mist-soft-button" onClick={() => setLater(`${status.type}:${status.version}`)}>Later</button>}
      <a href="https://github.com/ryancpjay-ux/ryxnontop/releases" target="_blank" rel="noreferrer">View what’s new ↗</a>
    </div>
    {!compact && active && <p className="ryx-settings-caption">Finish Listen and Ask before restarting to install an update.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
