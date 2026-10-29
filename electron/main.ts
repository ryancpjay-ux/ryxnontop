import {
  app,
  BrowserWindow,
  globalShortcut,
  screen,
  session,
  shell,
} from "electron";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import { installSingleInstanceAndDeepLinks } from "./deepLink";
import {centeredLayout} from "./windowLayout";
import { windowsOverlayOptions, installWindowsWindowPrivacy, installWindowsControls } from "./windowsPrivacy";
import { registerAppIpc } from "./ipc/app";
import { registerCaptureAndAskShortcut, registerScreenIpc } from "./ipc/screen";
import { attachWindowFocusNotifier, registerWindowIpc } from "./ipc/window";
import {
  installCsp,
  installOriginHeaderInjection,
  pickCsp,
} from "./security/csp";
import {
  installDisplayMediaHandler,
  installPermissionRequestHandler,
} from "./security/permissions";
import {isSafeExternalUrl,canNavigateRenderer} from "./security/externalUrl";
import { isTrustedOrigin } from "./security/origin";
import { registerLocalIpc } from "./ipc/local";
import { registerLibraryIpc } from "./ipc/library";
import {
  loadRestoredBounds,
  loadWindowState,
  trackWindowState,
} from "./windowState";

// Keep the existing profile location so renaming preserves notes and settings.
app.setPath(
  "userData",
  process.env.RYXNONTOP_PROFILE_DIR
    ? path.resolve(process.env.RYXNONTOP_PROFILE_DIR)
    : path.join(app.getPath("appData"), "MistCopilotLocal"),
);
let mainWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// Electron 42 can return a silent CoreAudio Tap stream on custom capture
// sources. Use its documented ScreenCaptureKit path and normal macOS consent.
if (process.platform === "darwin") {
  app.commandLine.appendSwitch(
    "disable-features",
    "MacCatapLoopbackAudioForScreenShare",
  );
}

// Disable Windows MediaFoundation video capture when problematic on older drivers
if (process.platform === "win32") {
  app.commandLine.appendSwitch(
    "disable-features",
    "MediaFoundationVideoCapture",
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveIconPath(): string {
  return path.join(
    app.getAppPath(),
    app.isPackaged ? "out/icons/ryxnontop.png" : "public/icons/ryxnontop.png",
  );
}

function loadDisplayName(): string {
  const candidates = [
    path.join(__dirname, "../package.json"),
    path.join(app.getAppPath(), "package.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
          build?: { productName?: string };
        };
        const name = parsed.build?.productName;
        if (typeof name === "string" && name.length > 0) {
          return name;
        }
      }
    } catch {
      /* try next candidate */
    }
  }
  return "ryxnontop";
}

async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const iconPath = resolveIconPath();

  // Restore last session's window position (and size when the renderer
  // doesn't override it) and overlay pin preference. Falls back to the
  // historical top-center default on first run.
  const restored = loadRestoredBounds();
  const savedAlwaysOnTop = loadWindowState().alwaysOnTop;
  const defaultWidth = Math.min(1380, width - 40);
  const defaultHeight = Math.min(820, height - 40);
  const workArea=restored?screen.getDisplayMatching(restored).workArea:screen.getPrimaryDisplay().workArea;
  const initial=centeredLayout(restored??workArea,workArea,restored?.width??defaultWidth,restored?.height??defaultHeight);

  mainWindow = new BrowserWindow({
    ...initial,
    frame: false,
    resizable: true,
    transparent: true,
    alwaysOnTop: savedAlwaysOnTop !== false,
    backgroundColor: "#00000000",
    hasShadow: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true,
      backgroundThrottling: false,
    },
    skipTaskbar: process.platform === "darwin",
    show: false,
    ...windowsOverlayOptions(),
  });

  trackWindowState(mainWindow);
  attachWindowFocusNotifier(mainWindow);

  const isPackaged = app.isPackaged && !process.env.DEV_PORT;
  installCsp(mainWindow.webContents.session, pickCsp(isPackaged));
  installOriginHeaderInjection(mainWindow.webContents.session);

  if (process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(false);
    // @ts-ignore - setSharingType exists on macOS 10.15+
    if (mainWindow.setSharingType) {
      // @ts-ignore
      mainWindow.setSharingType("none");
    }
    try {
      mainWindow.setContentProtection(true);
    } catch {
      // Content protection not available
    }
    // Stay visible even when the interviewer's app goes fullscreen (Zoom,
    // Meet, Teams). Content protection still hides us from any screen
    // recording / screen share happening on the remote side.
    try {
      mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
    } catch {
      // Not supported on this macOS version
    }
  }

  if (process.platform === "linux") {
    try {
      mainWindow.setContentProtection(true);
    } catch {
      // Content protection not available on this platform
    }
  }

  const buildPath = path.join(app.getAppPath(), "out");
  const isDev = !app.isPackaged || !!process.env.DEV_PORT;
  // Auto-open DevTools when ANY of these signal a debug session:
  //   - `isDev` (renderer pointed at `next dev`)
  //   - `ELECTRON_DEBUG=true` (set by `bun run electron:debug`)
  //   - a `.debug-build` marker file shipped alongside `main.js`
  //     (env vars don't survive a packaged binary, so the marker is
  //     how `bun run electron:build:debug` flags a distributable
  //     debug artifact at build time).
  // Detached mode so the overlay window keeps its declared 1000×600
  // even with DevTools visible — otherwise DevTools docks inside and
  // steals half the UI.
  const debugMarker = (() => {
    try {
      return fs.existsSync(path.join(__dirname, "DEBUG_BUILD"));
    } catch {
      return false;
    }
  })();
  const debugMode = process.env.ELECTRON_DEBUG === "true" || debugMarker;

  const devPort = process.env.DEV_PORT || "3000";
  const indexFile = path.join(buildPath, "index.html");
  try {
    if (isDev) {
      const devUrl = `http://localhost:${devPort}`;
      await mainWindow.loadURL(devUrl);
    } else {
      await mainWindow.loadFile(indexFile);
    }
    if (debugMode) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } catch (error) {
    console.error("Error loading window content:", error);
    mainWindow.show();
    const safeMsg = escapeHtml(
      error instanceof Error ? error.message : String(error),
    );
    // Render via data URL with an explicit charset; content is fully escaped.
    // The retry button reloads the real target (dev URL / index.html) so a
    // transient failure (e.g. `next dev` not up yet) is recoverable in-app.
    const retryTarget = isDev
      ? `http://localhost:${devPort}`
      : pathToFileURL(indexFile).href;
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<!doctype html><html><body style="font-family:system-ui;background:#141210;color:#edeceb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;max-width:32rem;padding:2rem"><h1 style="font-size:1.1rem;margin:0 0 .5rem">Error loading application</h1><p style="opacity:.7;font-size:.85rem;margin:0 0 1.25rem">${safeMsg}</p><button onclick="location.href='${retryTarget}'" style="background:#34d399;color:#0a0a0a;border:none;padding:.55rem 1.1rem;border-radius:.5rem;font-weight:600;font-size:.85rem;cursor:pointer">Retry</button></div></body></html>`,
      )}`,
    );
  }

  // Lock navigation to trusted origins. Any attempt to navigate the main
  // window elsewhere (e.g. via a hijacked link) is cancelled, and
  // window.open is blocked — external links are opened in the default
  // browser instead.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!canNavigateRenderer(url,buildPath,isDev ? `http://localhost:${devPort}` : undefined)) {
      event.preventDefault();
      if(isSafeExternalUrl(url)) void shell.openExternal(url).catch(()=>console.error("Could not open external link."));
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if(isSafeExternalUrl(url)) void shell.openExternal(url).catch(()=>console.error("Could not open external link."));
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => {
    // Whole-window opacity is not used for "see-through" (that is CSS backdrop only).
    mainWindow?.setOpacity(1);
    mainWindow?.show();
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 3000);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow().catch(() =>
      console.error("Could not reopen the app window."),
    );
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(async () => {
  app.setName(loadDisplayName());
  // The Dock is outside our protected window. Accessory mode hides its icon
  // and minimized previews; Applications/Spotlight and the hotkey still reopen us.
  if (process.platform === "darwin") {
    app.setActivationPolicy("accessory");
    app.dock?.hide();
  }

  installPermissionRequestHandler(session.defaultSession);
  installDisplayMediaHandler(session.defaultSession);
  if (process.platform === "win32") {
    installWindowsWindowPrivacy();
    installWindowsControls(getMainWindow, showMainWindow, resolveIconPath());
  }

  createWindow().catch((error) => {
    console.error("Failed to create Electron window:", error);
    app.quit();
  });

  if (process.platform !== "win32") globalShortcut.register("CommandOrControl+Shift+H", () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else showMainWindow();
  });

  registerCaptureAndAskShortcut(getMainWindow);

  app.on("activate", showMainWindow);
});

app.on("window-all-closed", () => {
  app.quit();
});

registerWindowIpc(getMainWindow);
registerScreenIpc(getMainWindow);
registerAppIpc();
registerLocalIpc(getMainWindow);
registerLibraryIpc(getMainWindow);

// Clean up global shortcuts on quit. We must guard with `app.isReady()`
// because `app.quit()` is called synchronously in the single-instance
// branch below, BEFORE the ready event fires. Touching globalShortcut
// before ready throws "globalShortcut cannot be used until the app is
// ready", which then bubbles up as an uncaughtException at startup.
app.on("will-quit", () => {
  if (!app.isReady()) return;
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    console.error("Failed to unregister global shortcuts:", err);
  }
});

installSingleInstanceAndDeepLinks(getMainWindow, showMainWindow);

// Log and swallow top-level errors so a single failing handler does not
// crash the whole process silently. Keep messages generic to avoid leaking
// tokens from thrown errors.
process.on("uncaughtException", (err) => {
  console.error("[electron main] uncaughtException; see the app error state.");
});
process.on("unhandledRejection", (reason) => {
  console.error("[electron main] unhandledRejection; operation did not complete.");
});
