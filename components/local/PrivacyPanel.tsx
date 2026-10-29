"use client";
import { useRef, useState } from "react";
import {
  Shield,
  Download,
  Upload,
  Trash2,
  WifiOff,
  Activity,
  X,
} from "lucide-react";
import { downloadText } from "@/lib/local-library";
import { SelectMenu } from "./SelectMenu";
export type ActivityEntry = { id: string; time: string; message: string };
type Props = {
  offline: boolean;
  onOffline: (value: boolean) => void;
  askEnabled: boolean;
  onAsk: (value: boolean) => void;
  visionEnabled: boolean;
  onVision: (value: boolean) => void;
  retainAudio: boolean;
  onRetainAudio: (value: boolean) => void;
  listenMode: string;
  onListenMode: (value: string) => void;
  log: ActivityEntry[];
  onClearLog: () => void;
  onExport: () => unknown;
  onImport: (value: unknown) => void;
  onWipe: (removeKeys: boolean) => Promise<void>;
  onError: (message: string) => void;
};
export function PrivacyPanel(props: Props) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [removeKeys, setRemoveKeys] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <div className="ryx-privacy">
      <div className="mist-dialog-heading">
        <Shield />
        <h1 id="mist-dialog-title">Your privacy. Your control.</h1>
        <p>Choose what runs and see what is processed.</p>
      </div>
      <section className="ryx-privacy-card">
        <div>
          <h2>
            <WifiOff size={16} />
            Offline mode / kill switch
          </h2>
          <p>
            Stops Listen, cancels AI requests, and blocks this app’s external
            network access. Notes and local exports keep working.
          </p>
        </div>
        <label className="ryx-switch">
          <input
            type="checkbox"
            aria-label="Offline mode"
            checked={props.offline}
            onChange={(event) => props.onOffline(event.target.checked)}
          />
          <span>{props.offline ? "Offline" : "Online"}</span>
        </label>
      </section>
      <section className="ryx-privacy-card">
        <div>
          <h2>Listen behavior</h2>
          <p>
            Silent notes only transcribes. Live suggestions answers detected
            questions. Instant answers reduces the question debounce.
          </p>
        </div>
        <SelectMenu
          label="Listen behavior"
          value={props.listenMode}
          options={["Silent notes", "Live suggestions", "Instant answers"]}
          onChange={props.onListenMode}
        />
      </section>
      <div className="ryx-per-mode">
        <label>
          <input
            type="checkbox"
            checked={props.askEnabled}
            onChange={(event) => props.onAsk(event.target.checked)}
          />
          Enable Ask
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.visionEnabled}
            onChange={(event) => props.onVision(event.target.checked)}
          />
          Enable screen analysis
        </label>
      </div>
      <label className="ryx-retain-audio">
        <input
          type="checkbox"
          checked={props.retainAudio}
          onChange={(event) => props.onRetainAudio(event.target.checked)}
        />
        Save audio recordings locally when Listen stops
      </label>
      <section className="ryx-privacy-card">
        <div>
          <h2>What stays here, and what is sent</h2>
          <p>
            Notes, transcripts, chat history, settings, and the activity log
            stay on this device. API keys are encrypted with your operating system’s protected key storage
            protection. While Listen is active, audio goes to Deepgram. AI
            questions, chosen context, and explicitly selected screenshots go to
            your selected AI provider (Google, OpenAI, or Anthropic). Raw audio
            is not retained by default. Provider data policies apply to requests
            you send.
          </p>
        </div>
      </section>
      <section className="ryx-privacy-actions">
        <h2>Your data</h2>
        <div>
          <button
            onClick={() =>
              downloadText(
                "ryxnontop-backup.json",
                JSON.stringify(props.onExport(), null, 2),
                "application/json",
              )
            }
          >
            <Download size={15} />
            Export all data
          </button>
          <button onClick={() => importRef.current?.click()}>
            <Upload size={15} />
            Import backup
          </button>
          <button onClick={() => setDeleting((value) => !value)}>
            <Trash2 size={15} />
            Delete local content
          </button>
        </div>
        <p>
          Backups include notes, folders, transcripts, chats, and settings. API
          keys are excluded.
        </p>
      </section>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 10000000) throw new Error("Backup is too large.");
            props.onImport(JSON.parse(await file.text()));
          } catch {
            props.onError(
              "Could not import this backup. Choose a valid ryxnontop JSON export under 10 MB.",
            );
          }
          event.target.value = "";
        }}
      />
      {deleting && (
        <div className="ryx-wipe-confirm">
          <h2>Delete app content on this device?</h2>
          <p>
            Export a backup first. Type DELETE to erase notes, transcripts, and
            chat history.
          </p>
          <input
            aria-label="Confirm data deletion"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="DELETE"
          />
          <label>
            <input
              type="checkbox"
              checked={removeKeys}
              onChange={(event) => setRemoveKeys(event.target.checked)}
            />
            Also remove saved API keys
          </label>
          <button
            disabled={confirm !== "DELETE"}
            onClick={async () => {
              await props.onWipe(removeKeys);
              setDeleting(false);
              setConfirm("");
            }}
          >
            Delete content
          </button>
          <button onClick={() => setDeleting(false)}>Cancel</button>
        </div>
      )}
      <section className="ryx-activity">
        <div className="mist-section-title">
          <h2>
            <Activity size={15} />
            Activity log
          </h2>
          <button className="mist-text-button" onClick={props.onClearLog}>
            Clear log
          </button>
        </div>
        <p>
          Events show processing and destinations without recording API keys or
          message contents.
        </p>
        {props.log.length ? (
          <ol>
            {props.log.slice(0, 60).map((entry) => (
              <li key={entry.id}>
                <time>{new Date(entry.time).toLocaleTimeString()}</time>
                <span>{entry.message}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p>No activity yet.</p>
        )}
      </section>
    </div>
  );
}
