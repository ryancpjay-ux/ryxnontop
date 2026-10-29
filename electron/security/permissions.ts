import { desktopCapturer, type Session } from "electron";
import { isTrustedOrigin } from "./origin";
import { windowsCaptureConsent } from "../windowsCapture";

/** Auto-grant media / display-capture permissions for our own app so the
 *  first getDisplayMedia() call does not silently fail. The OS-level
 *  Screen Recording permission (macOS) is still enforced by the system.
 *
 *  Only grants when the request comes from our own trusted renderer
 *  origin; OS-level Screen Recording / Microphone prompts still gate
 *  actual access. */
export function installPermissionRequestHandler(s: Session): void {
  s.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details?.requestingUrl || wc.getURL() || "";
    if (!isTrustedOrigin(origin)) {
      callback(false);
      return;
    }
    if (process.platform === "win32" && (permission === "media" || permission === "display-capture")) {
      void windowsCaptureConsent().request(permission === "display-capture" ? "screen" : "microphone").then(callback).catch(() => callback(false));
      return;
    }
    if (
      permission === "media" ||
      permission === "display-capture" ||
      permission === "notifications"
    ) {
      callback(true);
      return;
    }
    callback(false);
  });

  // Chromium's fast-path must allow trusted media/display requests to reach
  // macOS consent. It must never grant arbitrary remote renderers access.
  s.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    const trusted = isTrustedOrigin(wc?.getURL() || requestingOrigin || "");
    return (
      trusted &&
      (permission === "media" || (permission as string) === "display-capture")
    );
  });
}

/** Route renderer getDisplayMedia() calls to system audio loopback, so we
 *  capture loudspeaker output natively without requiring BlackHole /
 *  VB-Audio virtual devices. We still attach the primary screen as the
 *  required video source (Chromium rejects audio-only display media) while
 *  the renderer sends only audio tracks to transcription. */
export function installDisplayMediaHandler(s: Session): void {
  s.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (!isTrustedOrigin(request.frame?.url || request.securityOrigin)) {
        callback({});
        return;
      }
      try {
        if (process.platform === "win32" && !await windowsCaptureConsent().request("screen")) { callback({}); return; }
        const sources = await desktopCapturer.getSources({ types: ["screen"] });
        if (sources.length === 0) {
          callback({});
          return;
        }
        callback({ video: sources[0], audio: "loopback" });
      } catch (err) {
        console.error("Failed to provide loopback audio source:", err);
        callback({});
      }
    },
    { useSystemPicker: false },
  );
}
