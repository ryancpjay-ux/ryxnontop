import {handleTrusted} from "../security/ipc";
import {centeredLayout} from "../windowLayout";
import { applyWindowsPrivacy } from "../windowsPrivacy";
import { app, BrowserWindow, ipcMain, screen, systemPreferences } from "electron";

const WINDOW_FOCUS_CHANNEL = "window:focus";

type WindowAccessor = () => BrowserWindow | null;

/** Window control IPC. Channel names and payload shapes are intentionally
 *  preserved verbatim — they are consumed by the preload script and any
 *  rename would silently break the renderer. */
export function registerWindowIpc(getWindow: WindowAccessor): void {
  let resizeTimer: ReturnType<typeof setInterval> | undefined;
  handleTrusted("window-minimize", () => {
    if (process.platform === "darwin") getWindow()?.hide();
    else getWindow()?.minimize();
  });

  handleTrusted("window-maximize", () => {
    const w = getWindow();
    if (w?.isMaximized()) {
      w.unmaximize();
      return false;
    } else {
      w?.maximize();
      return true;
    }
  });

  handleTrusted("window-close", () => {
    // app.quit honors renderer beforeunload, including final key/data saves.
    app.quit();
  });

  handleTrusted("window-always-on-top", (_, flag: boolean) => {
    getWindow()?.setAlwaysOnTop(flag);
    return flag;
  });

  handleTrusted("window-set-size", (_, width: number, height: number) => {
    const w = getWindow();
    if (!w) return;
    const [currentWidth, currentHeight] = w.getSize();
    const display = screen.getDisplayMatching(w.getBounds());
    const maxW = display.workAreaSize.width;
    const maxH = display.workAreaSize.height;
    const clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, Math.round(v)));
    const nextW =
      Number.isFinite(width) && width > 0
        ? clamp(width, 200, maxW)
        : currentWidth;
    const nextH =
      Number.isFinite(height) && height > 0
        ? clamp(height, 100, maxH)
        : currentHeight;
    if(resizeTimer) { clearInterval(resizeTimer);resizeTimer=undefined; }
    if (nextW !== currentWidth || nextH !== currentHeight) {
      const from=w.getBounds();
      const target=centeredLayout(from,display.workArea,nextW,nextH);
      if(systemPreferences.getAnimationSettings?.().prefersReducedMotion) { w.setBounds(target);return; }
      const start=Date.now();
      resizeTimer=setInterval(()=>{
        if(w.isDestroyed()) {clearInterval(resizeTimer);return;}
        const t=Math.min(1,(Date.now()-start)/180); const eased=1-Math.pow(1-t,3);
        w.setBounds({x:Math.round(from.x+(target.x-from.x)*eased),y:Math.round(from.y+(target.y-from.y)*eased),width:Math.round(from.width+(target.width-from.width)*eased),height:Math.round(from.height+(target.height-from.height)*eased)});
        if(t===1) {clearInterval(resizeTimer);resizeTimer=undefined;}
      },16);
    }
  });

  handleTrusted("window-set-resizable", (_, resizable: boolean) => {
    const w = getWindow();
    if (!w) return false;
    // setResizable on macOS also disables the green "zoom" button which is
    // exactly what we want in compact mode — no drag-edge resize, no zoom.
    w.setResizable(!!resizable);
    return w.isResizable();
  });

  // Used by the compact overlay to make most of its (transparent) surface
  // click-through so the user can click the app behind. The renderer
  // tracks mouse position over interactive regions (toolbar/drawers) and
  // flips this back to false when the cursor enters them. `forward: true`
  // keeps mousemove events flowing into the renderer even while ignored,
  // which is what lets that tracking work.
  handleTrusted(
    "window-set-ignore-mouse-events",
    (_, ignore: boolean, options?: { forward?: boolean }) => {
      const w = getWindow();
      if (!w) return;
      try {
        w.setIgnoreMouseEvents(!!ignore, options ?? undefined);
      } catch {
        /* destroyed mid-call — ignore */
      }
    },
  );

  handleTrusted("window-is-always-on-top", () => {
    return getWindow()?.isAlwaysOnTop() || false;
  });

  handleTrusted("window-is-maximized", () => {
    return getWindow()?.isMaximized() || false;
  });

  handleTrusted("window-focus", () => {
    const w = getWindow();
    if (!w) return;
    if (!w.isVisible()) w.show();
    w.focus();
  });

  handleTrusted("window-set-focusable", (_, focusable: boolean) => {
    const w = getWindow();
    if (!w) return true;
    try {
      w.setFocusable(!!focusable);
      if (process.platform === "win32") applyWindowsPrivacy(w);
      if (focusable) {
        w.focus();
      }
      return !!focusable;
    } catch {
      return true;
    }
  });
}

/** Notify renderer when the OS window gains focus (alt-tab back, etc.). */
export function attachWindowFocusNotifier(window: BrowserWindow): void {
  const notify = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(WINDOW_FOCUS_CHANNEL);
    }
  };
  window.on("focus", notify);
}
