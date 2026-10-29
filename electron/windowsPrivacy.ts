import { app, BrowserWindow, globalShortcut, Menu, nativeImage, Tray, type BrowserWindowConstructorOptions } from "electron";

/** Electron's Windows toolbar type sets WS_EX_TOOLWINDOW without disabling focus. */
export function windowsOverlayOptions(platform: string = process.platform): Partial<BrowserWindowConstructorOptions> {
  return platform === "win32" ? { type: "toolbar", skipTaskbar: true } : {};
}

const protectedWindows = new WeakSet<BrowserWindow>();
/** Uses Electron's native SetWindowDisplayAffinity / taskbar APIs; never hides local content. */
export function applyWindowsPrivacy(window: BrowserWindow, platform: string = process.platform) {
  if (platform !== "win32" || window.isDestroyed()) return;
  try { window.setContentProtection(true); }
  catch { console.warn("Windows capture exclusion could not be requested."); }
  try { window.setSkipTaskbar(true); }
  catch { console.warn("Windows taskbar exclusion could not be requested."); }
}

export function protectWindowsWindow(window: BrowserWindow, platform: string = process.platform) {
  if (platform !== "win32" || window.isDestroyed()) return;
  applyWindowsPrivacy(window, platform);
  if (protectedWindows.has(window)) return;
  protectedWindows.add(window);
  const reapply = () => applyWindowsPrivacy(window, platform);
  // Affinity follows the HWND through normal bounds/DPI changes. Reassert after
  // visibility/fullscreen transitions, without doing COM work on every resize frame.
  window.on("show", reapply);
  window.on("restore", reapply);
  window.on("enter-full-screen", reapply);
  window.on("leave-full-screen", reapply);
  window.once("closed", () => {
    window.removeListener("show", reapply);
    window.removeListener("restore", reapply);
    window.removeListener("enter-full-screen", reapply);
    window.removeListener("leave-full-screen", reapply);
    protectedWindows.delete(window);
  });
}

export function installWindowsWindowPrivacy(platform: string = process.platform) {
  if (platform !== "win32") return;
  app.on("browser-window-created", (_event, window) => protectWindowsWindow(window, platform));
  for (const window of BrowserWindow.getAllWindows()) protectWindowsWindow(window, platform);
}

/** Tray + shortcut + existing second-launch activation keep a taskbar-free app accessible. */
export function installWindowsControls(
  getWindow: () => BrowserWindow | null,
  showWindow: () => void,
  iconPath: string,
  platform: string = process.platform,
) {
  if (platform !== "win32") return;
  const shortcut = "CommandOrControl+Shift+H";
  let tray: Tray | undefined;
  let shortcutRegistered = false;
  const toggle = () => {
    const window = getWindow();
    if (!window || window.isDestroyed() || window.isMinimized() || !window.isVisible()) showWindow();
    else window.hide();
  };
  try { shortcutRegistered = globalShortcut.register(shortcut, toggle); }
  catch { /* Tray and Start menu activation remain available. */ }
  try {
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({width:16,height:16}));
    tray.setToolTip(shortcutRegistered ? "ryxnontop · Ctrl+Shift+H to show/hide" : "ryxnontop · click to open (shortcut unavailable)");
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:"Open ryxnontop", click:showWindow},
      {label:"Hide window", click:() => getWindow()?.hide()},
      {type:"separator"},
      {label:"Quit ryxnontop", click:() => app.quit()},
    ]));
    tray.on("click", showWindow);
    tray.on("double-click", showWindow);
  } catch { console.warn("Windows tray unavailable. Use Ctrl+Shift+H or reopen ryxnontop from Start."); }
  if (!shortcutRegistered) console.warn("Windows show/hide shortcut unavailable. Use the tray or Start menu.");
  app.once("will-quit", () => {
    if (shortcutRegistered) globalShortcut.unregister(shortcut);
    tray?.destroy();
  });
}
