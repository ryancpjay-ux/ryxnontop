import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
const allowed = [
  "notes",
  "listenSessionId",
  "screenContext",
  "retainHistory",
  "showPerformance",
  "context",
  "model",
  "provider",
  "providerModels",
  "keysGuideCompleted",
  "setupStarted",
  "opacity",
  "source",
  "language",
  "light",
  "style",
  "mode",
  "autoAnswer",
  "folders",
  "chatHistory",
  "chatId",
  "messages",
  "transcript",
  "requests",
  "includeListen",
  "screenSource",
  "screenName",
  "offline",
  "askEnabled",
  "visionEnabled",
  "retainAudio",
  "instantAnswers",
  "fastResponses",
  "autoSummary",
  "activity",
];
export function createWorkspaceStore(
  directory = () => app.getPath("userData"),
) {
  const file = () => path.join(directory(), "workspace.json");
  const normalize = (input: string) => {
    if (typeof input !== "string" || Buffer.byteLength(input) > 64000000)
      throw new Error("Workspace is too large.");
    const parsed = JSON.parse(input) as Record<string, unknown>;
    if (!parsed || Array.isArray(parsed) || !Array.isArray(parsed.notes))
      throw new Error("Invalid workspace.");
    for (const key of ["chatHistory","messages","transcript","requests","folders","activity"]) {
      if(parsed[key] !== undefined && !Array.isArray(parsed[key])) throw new Error(`Invalid workspace collection: ${key}`);
    }
    if(!(parsed.notes as any[]).every(note=>note && typeof note.id==="string" && typeof note.content==="string" && (note.title===undefined || typeof note.title==="string") && (note.date===undefined || typeof note.date==="string") && (note.tags===undefined || Array.isArray(note.tags) && note.tags.every((tag:unknown)=>typeof tag==="string")))) throw new Error("Invalid notes");
    if(parsed.messages && !(parsed.messages as any[]).every(m=>m && typeof m.id==="string" && typeof m.text==="string" && ["user","assistant"].includes(m.role))) throw new Error("Invalid messages");
    if(parsed.transcript && !(parsed.transcript as unknown[]).every(item=>typeof item==="string")) throw new Error("Invalid transcript");
    if(parsed.chatHistory && !(parsed.chatHistory as any[]).every(chat=>chat && typeof chat.id==="string" && typeof chat.title==="string" && Array.isArray(chat.messages) && chat.messages.every((m:any)=>m && typeof m.text==="string" && ["user","assistant"].includes(m.role)))) throw new Error("Invalid chat history");
    return JSON.stringify(
      Object.fromEntries(
        allowed
          .filter((key) => Object.prototype.hasOwnProperty.call(parsed, key))
          .map((key) => [key, parsed[key]]),
      ),
    );
  };
  return {
    load(): { data: string | null; recovered: boolean } {
      if (!fs.existsSync(file())) return { data: null, recovered: false };
      try {
        return {
          data: normalize(fs.readFileSync(file(), "utf8")),
          recovered: false,
        };
      } catch {
        try {
          return {
            data: normalize(fs.readFileSync(`${file()}.previous`, "utf8")),
            recovered: true,
          };
        } catch {
          throw new Error(
            "Could not restore workspace data. Your files have been kept for recovery.",
          );
        }
      }
    },
    save(input: string) {
      const snapshot = normalize(input);
      fs.mkdirSync(directory(), { recursive: true, mode: 0o700 });
      const temporary = `${file()}.tmp`;
      try {
        if (fs.existsSync(file())) {
          try {
            normalize(fs.readFileSync(file(), "utf8"));
            fs.copyFileSync(file(), `${file()}.previous`);
            fs.chmodSync(`${file()}.previous`, 0o600);
          } catch {
            /* Keep a valid existing recovery copy. */
          }
        }
        fs.writeFileSync(temporary, snapshot, { mode: 0o600 });
        fs.chmodSync(temporary, 0o600);
        fs.renameSync(temporary, file());
      } catch {
        fs.rmSync(temporary, { force: true });
        throw new Error(
          "Could not save workspace data. Check free disk space.",
        );
      }
    },
    clear() {
      for (const suffix of ["", ".previous", ".tmp"])
        fs.rmSync(`${file()}${suffix}`, { force: true });
    },
  };
}
