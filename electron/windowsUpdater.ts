// Compatibility exports for existing Windows callers; state lives in one desktop updater.
export { initDesktopUpdater as initWindowsUpdater, getDesktopUpdateStatus as getWindowsUpdateStatus,
  getUpdatePreferences as getWindowsUpdatePreferences, setUpdatePreferences as setWindowsUpdatePreferences,
  checkDesktopUpdates as checkWindowsUpdates, downloadDesktopUpdate as downloadWindowsUpdate,
  installDesktopUpdate as installWindowsUpdate } from "./desktopUpdater";
export type { UpdatePreferences as WindowsUpdatePreferences } from "./desktopUpdater";
export type { UpdaterStatus as WindowsUpdateStatus } from "./updater";
