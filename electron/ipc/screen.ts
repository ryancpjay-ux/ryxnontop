import {handleTrusted} from "../security/ipc";
import { windowsCaptureConsent } from "../windowsCapture";
import {
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} from "electron";

type WindowAccessor = () => BrowserWindow | null;

export type ScreenAccessStatus =
  | "not-determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown";

/** macOS gates screen capture behind a TCC permission; everywhere else
 *  capture is unconditionally allowed. We treat lookup failures as
 *  `unknown` so the renderer can still attempt a capture (which will
 *  surface a real OS error if it actually fails). */
export function getScreenAccess(): ScreenAccessStatus {
  if (process.platform === "win32") return windowsCaptureConsent().allowed("screen") ? "granted" : "not-determined";
  if (process.platform !== "darwin") return "granted";
  try {
    return systemPreferences.getMediaAccessStatus(
      "screen",
    ) as ScreenAccessStatus;
  } catch {
    return "unknown";
  }
}

/** Register screen-related IPC handlers + the "capture and ask" global
 *  hotkey. Channel names and payload shapes are preserved verbatim. */
export function registerScreenIpc(getWindow: WindowAccessor): void {
  // Screen Recording permission + silent snapshot capture for "Ask AI with
  // screenshot". On macOS, a single getSources() call triggers the native
  // permission dialog the first time, then subsequent calls are silent.
  handleTrusted("screen:get-access", () => getScreenAccess());

  handleTrusted("screen:open-settings", async () => {
    if (process.platform === "darwin") {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      );
      return true;
    }
    if (process.platform === "win32") {
      windowsCaptureConsent().revoke("screen");
      await shell.openExternal("ms-settings:privacy-graphicscaptureprogrammatic");
      return true;
    }
    return false;
  });

  handleTrusted("screen:trigger-prompt", async () => {
    if (process.platform === "win32") return await windowsCaptureConsent().request("screen") ? "granted" : "denied";
    // Calling getSources() is what causes macOS to display the permission
    // prompt the first time. We discard the result.
    try {
      await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      });
    } catch {
      // Permission denied or not available
    }
    return getScreenAccess();
  });

  handleTrusted("screen:capture", async (_event, sourceId?: string, preview = false) => {
    // Silent full-screen snapshot. Unlike getDisplayMedia() this is a
    // one-shot frame grab; on macOS 13+ it does not engage the continuous
    // recording indicator for longer than the single frame.
    try {
      if (process.platform === "win32" && !windowsCaptureConsent().allowed("screen")) {
        if (preview || !await windowsCaptureConsent().request("screen")) return {success:false as const, error:"Screen access was not approved. Open Permissions to allow screen capture."};
      }
      if (getScreenAccess() !== "granted") return { success:false as const, error:"Access required: Enable Screen & System Audio Recording in System Settings." };
      const w = getWindow();
      const targetDisplay = w
        ? screen.getDisplayMatching(w.getBounds())
        : screen.getPrimaryDisplay();
      const displays = screen.getAllDisplays();
      const width = Math.max(
        ...displays.map((display) =>
          Math.round(display.size.width * display.scaleFactor),
        ),
      );
      const height = Math.max(
        ...displays.map((display) =>
          Math.round(display.size.height * display.scaleFactor),
        ),
      );
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: preview ? 960 : width,
          height: preview ? 600 : height,
        },
      });

      const targetId = String(targetDisplay.id);
      const primary = sourceId
        ? sources.find((s) => s.id === sourceId)
        : (sources.find((s) => String(s.display_id) === targetId) ??
          sources.find((s) => s.display_id) ??
          sources[0]);
      if (!primary || primary.thumbnail.isEmpty()) {
        if (process.platform === "win32") windowsCaptureConsent().revoke("screen");
        return { success: false as const, error: "No screen source available" };
      }

      // Downscale to keep the payload reasonable for the LLM (max ~2560px long edge)
      const maxLongEdge = 2560;
      const captured = primary.thumbnail.getSize();
      const longEdge = Math.max(captured.width, captured.height);
      const img =
        longEdge > maxLongEdge
          ? primary.thumbnail.resize({
              width: Math.round(captured.width * (maxLongEdge / longEdge)),
              height: Math.round(captured.height * (maxLongEdge / longEdge)),
            })
          : primary.thumbnail;

      const dataUrl = typeof img.toJPEG === "function" ? `data:image/jpeg;base64,${img.toJPEG(preview ? 70 : 85).toString("base64")}` : img.toDataURL();
      return { success: true as const, dataUrl };
    } catch (err) {
      if (process.platform === "win32") windowsCaptureConsent().revoke("screen");
      return {
        success: false as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/** Register the global hotkey that captures the screen and focuses the
 *  Ask AI tab. Works even when another app (Zoom, browser, etc.) has
 *  focus, so the user can trigger from the interview without switching
 *  windows. */
export function registerCaptureAndAskShortcut(getWindow: WindowAccessor): void {
  try {
    globalShortcut.register("CommandOrControl+Shift+1", () => {
      const w = getWindow();
      if (!w) return;
      if (!w.isVisible()) w.show();
      w.focus();
      w.webContents.send("screen:capture-and-ask");
    });
  } catch (err) {
    console.error("Failed to register global shortcut:", err);
  }
}
