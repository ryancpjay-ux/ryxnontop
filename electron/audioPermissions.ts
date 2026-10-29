import { systemPreferences } from "electron";

type Preferences = Pick<
  typeof systemPreferences,
  "getMediaAccessStatus" | "askForMediaAccess"
>;
/** Check macOS grants, requesting the microphone only while its status is undecided. */
export async function prepareAudioCapture(
  source: string,
  platform: string = process.platform,
  preferences: Preferences = systemPreferences,
): Promise<void> {
  if (source !== "microphone" && source !== "system")
    throw new Error("Invalid audio source.");
  if (platform !== "darwin") return;
  if (source === "microphone") {
    const status = preferences.getMediaAccessStatus("microphone");
    if (status === "granted") return;
    if (
      status === "not-determined" &&
      (await preferences.askForMediaAccess("microphone"))
    )
      return;
    throw new Error(
      "Access required: Enable ryxnontop in System Settings → Privacy & Security → Microphone, then return to the app.",
    );
  }
  const status = preferences.getMediaAccessStatus("screen");
  if (status === "denied" || status === "restricted")
    throw new Error(
      "Access required: Enable ryxnontop in System Settings → Privacy & Security → Screen & System Audio Recording, then restart the app if macOS requests it.",
    );
  // The first display-capture request triggers macOS's screen/audio consent.
}
