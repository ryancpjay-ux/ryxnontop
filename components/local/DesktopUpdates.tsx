"use client";
import { useEffect, useState } from "react";
import { updateNoticeSession } from "@/lib/update-notice";
type Status = { type: string; version?: string; percent?: number; summary?: string; message?: string };
type Props = { save: () => Promise<void>; active?: boolean; compact?: boolean; suspended?: boolean };
export default function DesktopUpdates({ save, active = false, compact = false, suspended = false }: Props) {
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [current, setCurrent] = useState("");
  const [preferences, setPreferences] = useState({ automatic: true, backgroundDownload: false });
  const [error, setError] = useState("");
  const [visibleVersion, setVisibleVersion] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [platform, setPlatform] = useState("desktop");
  const [applying, setApplying] = useState(false);
  useEffect(() => {
    const api = window.electronAPI;
    setPlatform(api?.platform === "darwin" ? "macOS" : api?.platform === "win32" ? "Windows" : "desktop");
    void api?.updaterGetStatus?.().then(setStatus).catch(() => setError("Update status is unavailable. Please retry."));
    void api?.updaterGetVersion?.().then(setCurrent).catch(() => {});
    void (api?.updaterGetPreferences ?? api?.windowsUpdaterPreferences)?.().then(setPreferences).catch(() => setError("Update preferences could not be loaded."));
    return api?.onUpdaterStatus?.(setStatus);
  }, []);
  useEffect(() => {
    if (!compact || suspended || !status.version || !["available", "downloaded"].includes(status.type)) return;
    if (status.version === visibleVersion || !updateNoticeSession.claim(status.version)) return;
    setVisibleVersion(status.version);
    setDismissed(false);
  }, [compact, active, suspended, status.type, status.version, visibleVersion]);
  const perform = (action: (() => Promise<unknown>) | undefined) => {
    setError("");
    if (action) void action().catch(error => setError(error instanceof Error ? error.message : "Update action failed. Please retry."));
    else setError("This update action requires the installed desktop app.");
  };
  const updatePreference = (key: "automatic" | "backgroundDownload", value: boolean) => perform(async () => {
    const next = { ...preferences, [key]: value };
    const saved = await (window.electronAPI?.updaterSavePreferences ?? window.electronAPI?.windowsUpdaterSavePreferences)?.(next);
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
  const beta = /-beta\.\d+$/.test(current);
  const description = status.type === "downloaded" ? `Version ${status.version} is ready. Restart when you're finished to install it.`
    : status.type === "downloading" ? `Downloading update · ${Math.round(status.percent ?? 0)}%`
    : status.type === "checking" ? `Checking ${beta ? "beta test" : "stable"} GitHub Releases…`
    : status.type === "available" ? `A new version of ryxnontop is available: ${status.version}.`
    : status.type === "not-available" ? `You have the latest ${beta ? "beta test" : "stable"} ${platform} release.`
    : status.type === "error" ? status.message ?? "Could not check for updates. Check your connection and retry."
    : `${beta ? "Beta test releases" : "Stable releases"} only. Updates preserve your saved credentials, preferences and history.`;
  if (compact && (suspended || dismissed || !visibleVersion || !["available", "downloaded", "downloading", "error", "checking"].includes(status.type))) return null;
  return <section className={compact ? "ryx-windows-update-notice" : "ryx-settings-card"} aria-label={`${platform} updates`}><h2>{compact ? "ryxnontop Update Available" : `${platform} updates`}</h2>
    {!compact && <p className="ryx-settings-caption">Installed {current || "…"} · {beta ? "Beta test" : "Stable"} channel</p>}
    <p role="status">{description}</p>
    {status.summary && <p className="ryx-settings-caption">{compact ? status.summary.slice(0, 220) : status.summary}</p>}
    {status.type === "downloading" && <progress aria-label="Update download progress" max={100} value={status.percent ?? 0} />}
    {!compact && <><label className="ryx-settings-option"><span>Automatically check for updates</span><input type="checkbox" checked={preferences.automatic} onChange={e => updatePreference("automatic", e.target.checked)} /></label>
      <label className="ryx-settings-option"><span>Download updates in the background</span><input type="checkbox" checked={preferences.backgroundDownload} onChange={e => updatePreference("backgroundDownload", e.target.checked)} /></label></>}
    <div className="ryx-settings-actions">
      {!compact && <button className="mist-soft-button" disabled={["checking", "downloading", "downloaded"].includes(status.type)} onClick={() => perform(window.electronAPI?.updaterCheck)}>Check for updates</button>}
      {(status.type === "available" || (compact && status.type === "error" && visibleVersion)) && <button className="mist-soft-button" onClick={() => perform(window.electronAPI?.updaterDownload ?? window.electronAPI?.windowsUpdaterDownload)}>Update now</button>}
      {status.type === "downloaded" && <button className="mist-soft-button" disabled={active || applying} onClick={install}>{applying ? "Saving…" : "Restart and install"}</button>}
      {compact && <button className="mist-soft-button" onClick={() => setDismissed(true)}>Remind me later</button>}
      <a href="https://github.com/ryancpjay-ux/ryxnontop/releases" target="_blank" rel="noreferrer">What’s New ↗</a>
    </div>
    {active && <p className="ryx-settings-caption">Finish Listen and Ask before restarting to install an update.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
