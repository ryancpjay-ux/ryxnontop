"use client";
import { X } from "lucide-react";
import { APP_DISPLAY_NAME } from "@/lib/constant";
export default function IntroSplash({
  light,
  onDone,
  onQuit,
  enterLabel,
}: {
  light: boolean;
  onDone: () => void;
  onQuit: () => void;
  enterLabel?: string;
}) {
  return (
    <main
      className={`ryx-intro ${light ? "light" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="ryxnontop introduction"
    >
      <div className="ryx-intro-orb" aria-hidden="true" />
      <div className="ryx-intro-top">
        <span>MADE BY RYAN J.</span>
        <button
          title="Quit the application"
          aria-label="Quit app"
          onClick={onQuit}
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="ryx-intro-stage">
        <span className="ryx-intro-icon" aria-hidden="true">
          r<span>↗</span>
        </span>
        <h1 aria-label={APP_DISPLAY_NAME}>
          {[...APP_DISPLAY_NAME].map((letter, index) => (
            <span
              aria-hidden="true"
              key={index}
              style={{ animationDelay: `${200 + index * 42}ms` }}
            >
              {letter}
            </span>
          ))}
          <span className="ryx-intro-dot" aria-hidden="true">
            .
          </span>
        </h1>
        <p>Your personal interview assistant.</p>
        <div className="ryx-intro-rule" aria-hidden="true" />
      </div>
      <button
        className="ryx-intro-enter"
        onClick={onDone}
        autoFocus
        title={enterLabel ?? "Open your workspace"}
      >
        {enterLabel ?? "Enter workspace"} <span aria-hidden="true">↗</span>
      </button>
    </main>
  );
}
