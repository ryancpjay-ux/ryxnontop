"use client";
import { useState, type ReactNode } from "react";
import { Check, ExternalLink } from "lucide-react";
import { SelectMenu } from "./SelectMenu";
import {
  providerLabels,
  modelPresets,
  type Provider,
} from "@/lib/local-providers";
import DesktopUpdates from "./DesktopUpdates";
import { WindowsApiConnections, type WindowsApiProps } from "./WindowsApiSetup";
import { version } from "@/package.json";
type Props = {
  windowsApi: WindowsApiProps;
  onUpdateSave: () => Promise<void>;
  provider: Provider;
  model: string;
  providerKey: string;
  deepgramKey: string;
  keysLoaded: boolean;
  keyStatus: string;
  onProvider: (value: Provider) => void;
  onModel: (value: string) => void;
  onProviderKey: (value: string) => void;
  onDeepgramKey: (value: string) => void;
  source: string;
  onSource: (value: string) => void;
  languageControl: ReactNode;
  restartControl: ReactNode;
  fast: boolean;
  onFast: (value: boolean) => void;
  autoAnswer: boolean;
  onAutoAnswer: (value: boolean) => void;
  autoSummary: boolean;
  onAutoSummary: (value: boolean) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  light: boolean;
  onLight: (value: boolean) => void;
  retainHistory: boolean;
  onRetainHistory: (value: boolean) => void;
  showPerformance: boolean;
  onShowPerformance: (value: boolean) => void;
  performance: ReactNode;
  onReplay: () => void;
  onTutorial: () => void;
  onTest: () => void;
  onDone: () => void;
  testDisabled: boolean;
  testStatus: string;
  error: string;
  windows: boolean;
  active?: boolean;
};
function Option({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="ryx-settings-option">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export default function SettingsPanel(p: Props) {
  const [tab, setTab] = useState("AI & keys");
  const tabs = ["AI & keys", "API Connections", "Listen", "Appearance", "General"];
  return (
    <div className="ryx-settings">
      <header className="ryx-settings-heading">
        <h1 id="mist-dialog-title">Settings</h1>
        <p>Make ryxnontop work for you.</p>
      </header>
      <div
        className="ryx-settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        {tabs.map((name) => (
          <button
            key={name}
            role="tab"
            id={`settings-tab-${name.split(" ")[0]}`}
            aria-controls="settings-content"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        className="ryx-settings-content"
        id="settings-content"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab.split(" ")[0]}`}
      >
        {tab === "API Connections" && <WindowsApiConnections {...p.windowsApi} />}
        {tab === "AI & keys" && (
          <>
            <section className="ryx-settings-card">
              <h2>Answer provider</h2>
              <div className="ryx-settings-fields">
                <label>
                  Provider
                  <SelectMenu
                    label="Answer provider"
                    value={providerLabels[p.provider]}
                    options={Object.values(providerLabels)}
                    placement="down"
                    onChange={(name) =>
                      p.onProvider(
                        (Object.keys(providerLabels) as Provider[]).find(
                          (key) => providerLabels[key] === name,
                        )!,
                      )
                    }
                  />
                </label>
                <label>
                  Model
                  <SelectMenu
                    label="Model preset"
                    value={p.model}
                    options={[
                      ...new Set([...modelPresets[p.provider], p.model]),
                    ]}
                    placement="down"
                    onChange={p.onModel}
                  />
                </label>
                {!p.windows && <label className="ryx-settings-wide">
                  {providerLabels[p.provider]} API key
                  <input
                    type="password"
                    autoComplete="off"
                    value={p.providerKey}
                    disabled={!p.keysLoaded}
                    placeholder="Paste your provider API key"
                    onChange={(e) => p.onProviderKey(e.target.value)}
                  />
                </label>}
              </div>
              <p className="ryx-settings-caption" role="status">
                {p.keyStatus}
              </p>
              <details>
                <summary>Advanced model settings</summary>
                <label className="ryx-settings-advanced">
                  Custom model ID
                  <input
                    value={p.model}
                    onChange={(e) => p.onModel(e.target.value.trim())}
                  />
                </label>
              </details>
            </section>
            <section className="ryx-settings-card">
              <Option
                title="Fast responses"
                description="Stream direct answers with less reasoning overhead. Detailed answer style remains available."
                checked={p.fast}
                onChange={p.onFast}
              />
            </section>
            <section className="ryx-settings-card">
              <h2>Connection check</h2>
              <p>
                Test this provider and model using a generic question. No
                transcript or screenshot is sent.
              </p>
              <div className="ryx-settings-actions">
                <button
                  className="mist-soft-button"
                  onClick={p.onTest}
                  disabled={p.testDisabled}
                >
                  Test API Connection
                </button>
                <button className="mist-soft-button" onClick={p.onTutorial}>
                  API key setup guide <ExternalLink size={13} />
                </button>
              </div>
              <p className="ryx-settings-caption">
                API usage has separate billing from ChatGPT or Claude
                subscriptions. Keys are encrypted on this device.
              </p>
              {p.testStatus && <p role="status">{p.testStatus}</p>}
              {p.error && (
                <p className="ryx-settings-error" role="alert">
                  {p.error}
                </p>
              )}
            </section>
          </>
        )}
        {tab === "Listen" && (
          <>
            <section className="ryx-settings-card">
              <h2>Audio & language</h2>
              <div className="ryx-settings-fields">
                <label>
                  Audio source
                  <SelectMenu
                    label="Audio source"
                    value={
                      p.source === "system"
                        ? "System Audio (Suggested)"
                        : "Microphone"
                    }
                    options={["System Audio (Suggested)", "Microphone"]}
                    placement="down"
                    onChange={(name) =>
                      p.onSource(
                        name === "Microphone" ? "microphone" : "system",
                      )
                    }
                  />
                </label>
                <label>Spoken language{p.languageControl}</label>
                {!p.windows && <label className="ryx-settings-wide">
                  Deepgram API key
                  <input
                    type="password"
                    autoComplete="off"
                    value={p.deepgramKey}
                    disabled={!p.keysLoaded}
                    placeholder="Paste your Deepgram key"
                    onChange={(e) => p.onDeepgramKey(e.target.value)}
                  />
                </label>}
              </div>
              <p className="ryx-settings-caption">
                <button className="mist-soft-button" onClick={() => setTab("API Connections")}>Manage Deepgram connection</button>
                Live audio is sent to Deepgram while Listen runs. Source and
                language changes apply to the next session.
              </p>
              {p.restartControl}
            </section>
            <section className="ryx-settings-card">
              <Option
                title="Automatic answers"
                description="Detect completed questions and answer the latest one."
                checked={p.autoAnswer}
                onChange={p.onAutoAnswer}
              />
              <Option
                title="Session summaries"
                description="Send the completed transcript to your selected AI provider for a summary."
                checked={p.autoSummary}
                onChange={p.onAutoSummary}
              />
            </section>
          </>
        )}
        {tab === "Appearance" && (
          <>
            <section className="ryx-settings-card">
              <h2>Workspace</h2>
              <Option
                title="Light appearance"
                description="Use white surfaces with black text."
                checked={p.light}
                onChange={p.onLight}
              />
              <label className="ryx-settings-range">
                <span>
                  Panel opacity <strong>{p.opacity}%</strong>
                </span>
                <input
                  type="range"
                  min={35}
                  max={100}
                  value={p.opacity}
                  onChange={(e) => p.onOpacity(Number(e.target.value))}
                />
              </label>
            </section>
            <section className="ryx-settings-card">
              <h2>Opening animation</h2>
              <p>
                The opening animation plays on every launch, then opens setup or your workspace. You can skip it. Motion follows your system’s Reduce Motion preference.
              </p>
              <button className="mist-soft-button" onClick={p.onReplay}>
                Replay intro
              </button>
            </section>
          </>
        )}
        {tab === "General" && (
          <>
            <DesktopUpdates save={p.onUpdateSave} active={p.active} />
            <section className="ryx-settings-card">
              <h2>Storage & diagnostics</h2>
              <Option
                title="Save session history"
                description="Keep transcripts and chats locally. Turning this off preserves already saved history."
                checked={p.retainHistory}
                onChange={p.onRetainHistory}
              />
              <Option
                title="Performance details"
                description="Show request timing in the workspace and diagnostics below."
                checked={p.showPerformance}
                onChange={p.onShowPerformance}
              />
              {p.showPerformance && p.performance}
            </section>
            <section className="ryx-settings-card">
              <h2>Keyboard shortcuts</h2>
              <dl className="ryx-settings-shortcuts">
                <div>
                  <dt>Hide / show</dt>
                  <dd>{p.windows ? "Ctrl + Shift + H" : "⌘ ⇧ H"}</dd>
                </div>
                <div>
                  <dt>Screenshot</dt>
                  <dd>{p.windows ? "Ctrl + Shift + 1" : "⌘ ⇧ 1"}</dd>
                </div>
                <div>
                  <dt>Answer</dt>
                  <dd>{p.windows ? "Ctrl + Enter" : "⌘ ↵"}</dd>
                </div>
                <div>
                  <dt>Listen / Ask / Notes</dt>
                  <dd>{p.windows ? "Alt + C / A / N" : "⌥ C / A / N"}</dd>
                </div>
              </dl>
            </section>
            <section className="ryx-settings-card">
              <h2>Help & contact</h2>
              {p.windows && <button className="mist-soft-button" onClick={p.onTutorial}>Replay API setup</button>}
              <p>
                If you have any issues, DM{" "}
                <a
                  href="https://www.instagram.com/ryan.c.jay/"
                  target="_blank"
                  rel="noreferrer"
                >
                  @ryan.c.jay
                </a>{" "}
                or email{" "}
                <a href="mailto:ryancpjay@gmail.com">ryancpjay@gmail.com</a>.
              </p>
              <p className="ryx-settings-caption">
                ryxnontop · Version {version} · Made by Ryan J.
              </p>
            </section>
          </>
        )}
      </div>
      <footer className="ryx-settings-footer">
        <span>Changes save automatically</span>
        <button
          className="mist-primary"
          disabled={!p.keysLoaded}
          onClick={p.onDone}
        >
          Done <Check size={15} />
        </button>
      </footer>
    </div>
  );
}
