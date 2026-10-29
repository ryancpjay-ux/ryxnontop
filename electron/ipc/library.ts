import {handleTrusted} from "../security/ipc";
import { windowsCaptureConsent } from "../windowsCapture";
import { windowsOverlayOptions } from "../windowsPrivacy";
import {
  app,
  BrowserWindow,
  ShareMenu,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  shell,
} from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { isTrustedOrigin } from "../security/origin";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function registerLibraryIpc(getWindow: () => BrowserWindow | null) {
  handleTrusted(
    "local:save-audio",
    async (event, bytes: Uint8Array, mime: string) => {
      if (!isTrustedOrigin(event.sender.getURL()))
        throw new Error("Untrusted origin");
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 140000000)
        throw new Error("Audio recording is too large.");
      const directory = path.join(app.getPath("userData"), "recordings");
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const filename = `${Date.now()}-${randomUUID()}.${mime.includes("mp4") ? "m4a" : "webm"}`;
      await fs.writeFile(path.join(directory, filename), bytes, {
        mode: 0o600,
      });
      return filename;
    },
  );
  handleTrusted("local:open-audio", async (event, filename: string) => {
    if (
      !isTrustedOrigin(event.sender.getURL()) ||
      !/^[0-9]+-[a-f0-9-]+\.(webm|m4a)$/.test(filename)
    )
      throw new Error("Invalid recording.");
    const error = await shell.openPath(
      path.join(app.getPath("userData"), "recordings", filename),
    );
    if (error) throw new Error("Could not open this recording.");
  });
  handleTrusted("local:clear-audio", async (event) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    await fs.rm(path.join(app.getPath("userData"), "recordings"), {
      recursive: true,
      force: true,
    });
  });
  handleTrusted(
    "local:export-pdf",
    async (event, input: { title: string; html: string }) => {
      if (!isTrustedOrigin(event.sender.getURL()))
        throw new Error("Untrusted origin");
      if (
        typeof input?.title !== "string" ||
        typeof input?.html !== "string" ||
        input.html.length > 2000000
      )
        throw new Error("Invalid note export.");
      const owner = getWindow();
      const options = {
        defaultPath: `${input.title.replace(/[^\w -]/g, "").slice(0, 100) || "note"}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      };
      const destination = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (destination.canceled || !destination.filePath) return false;
      const printWindow = new BrowserWindow({
        ...windowsOverlayOptions(),
        show: false,
        skipTaskbar: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          javascript: false,
        },
      });
      printWindow.setContentProtection(true);
      printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      printWindow.webContents.on("will-navigate", (event) =>
        event.preventDefault(),
      );
      try {
        const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:12px/1.65 -apple-system,Arial,sans-serif;color:#111;padding:16px}h1{font-size:24px}h2{font-size:18px}pre{white-space:pre-wrap;background:#f3f3f3;padding:12px;border-radius:6px}code{font-size:11px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px}a{color:#111}blockquote{border-left:2px solid #888;padding-left:12px}</style></head><body><h1>${escape(input.title)}</h1>${input.html}</body></html>`;
        await printWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(document)}`,
        );
        const pdf = await printWindow.webContents.printToPDF({
          pageSize: "A4",
          printBackground: true,
        });
        await fs.writeFile(destination.filePath, pdf);
        return true;
      } finally {
        if (!printWindow.isDestroyed()) printWindow.destroy();
      }
    },
  );
  handleTrusted("local:share-note", (event, text: string) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    if (typeof text !== "string" || text.length > 1000000)
      throw new Error("Invalid note.");
    if (process.platform === "darwin")
      new ShareMenu({ texts: [text] }).popup({
        window: getWindow() ?? undefined,
      });
    else clipboard.writeText(text);
  });
  handleTrusted("local:screens", async (event) => {
    if (!isTrustedOrigin(event.sender.getURL()))
      throw new Error("Untrusted origin");
    if (process.platform === "win32" && !await windowsCaptureConsent().request("screen")) throw new Error("Screen access was not approved. Open Permissions to allow capture.");
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 300, height: 180 },
    });
    const usable=sources.filter(source=>!source.thumbnail.isEmpty());
    if(!usable.length) {
      if (process.platform === "win32") { windowsCaptureConsent().revoke("screen"); throw new Error("Screen capture unavailable. Open Windows capture privacy settings and retry."); }
      throw new Error("Access required: Screen capture failed despite the current macOS setting. Open Screen & System Audio Recording, restart ryxnontop, and if necessary remove the stale entry and re-add /Applications/ryxnontop.app.");
    }
    return usable.map((source) => ({
      id: source.id,
      displayId: source.display_id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  });
}
