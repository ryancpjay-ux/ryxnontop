import { app, dialog } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
type Kind = "screen" | "microphone";
/** App-level consent complements Windows controls; it never changes OS permissions. */
export function createWindowsCaptureConsent(directory = () => app.getPath("userData"), prompt = dialog.showMessageBox.bind(dialog)) {
  const pending = new Map<Kind, Promise<boolean>>();
  const file = () => path.join(directory(), "windows-capture-consent.json");
  const read = (): Partial<Record<Kind, boolean>> => {
    try { const value = JSON.parse(fs.readFileSync(file(), "utf8")); return {screen: value.screen === true, microphone: value.microphone === true}; }
    catch { return {}; }
  };
  const write = (kind: Kind, value: boolean) => {
    fs.mkdirSync(directory(), {recursive:true});
    const temporary = `${file()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({...read(), [kind]: value}));
    fs.renameSync(temporary, file());
  };
  return {
    allowed: (kind: Kind) => read()[kind] === true,
    revoke: (kind: Kind) => write(kind, false),
    async request(kind: Kind): Promise<boolean> {
      if (read()[kind] === true) return true;
      if (pending.has(kind)) return pending.get(kind)!;
      const task = (async () => {
        const result = await prompt({
          type: "question", title: "ryxnontop capture access",
          message: kind === "microphone" ? "Allow ryxnontop to use your microphone?" : "Allow ryxnontop to capture your screen and system audio?",
          detail: kind === "microphone" ? "Listen sends microphone audio to Deepgram while running. Windows must also allow desktop microphone access. You can stop Listen at any time." : "Screen preview stays on this device. Enabled screenshots go to your selected AI provider when you ask; system audio goes to Deepgram while Listen runs. Windows privacy or organization policies still apply.",
          buttons: ["Allow", "Not now"], defaultId: 0, cancelId: 1,
        });
        if (result.response === 0) { write(kind, true); return true; }
        return false;
      })();
      pending.set(kind, task);
      try { return await task; } finally { pending.delete(kind); }
    },
  };
}
let consent: ReturnType<typeof createWindowsCaptureConsent> | undefined;
export function windowsCaptureConsent() {
  return consent ??= createWindowsCaptureConsent();
}
