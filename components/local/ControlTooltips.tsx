"use client";
import { useEffect, useState } from "react";

function explanation(control: HTMLElement) {
  const label = (
    control.getAttribute("aria-label") ||
    control.textContent ||
    ""
  )
    .trim()
    .replace(/\s+/g, " ");
  if (window.electronAPI?.platform === "win32") {
    if (/permissions|allow.*(?:screen|microphone)|capture privacy|microphone privacy/i.test(label)) return "Allow capture or open Windows privacy settings. Desktop microphone access must also be enabled in Windows.";
    if (/hide window|minimize/i.test(label)) return "Hide the window without quitting. Press Ctrl+Shift+H to show it again.";
    if (/new note/i.test(label)) return "Create a manual note stored on this Windows account.";
    if (/share note/i.test(label)) return "Copy this note to the Windows clipboard so you can share it.";
    if (/restart app/i.test(label)) return "Save data, quit, and reopen the application.";
  }
  const rules: [RegExp, string][] = [
    [
      /quit app|^quit$|close window/i,
      "Stop capture, save keys and workspace data, and quit the application completely.",
    ],
    [
      /close dialog/i,
      "Close this panel and return to your workspace. Settings save automatically.",
    ],
    [
      /hide window|minimize/i,
      "Hide the window without quitting. Press Cmd+Shift+H to show it again.",
    ],
    [
      /toggle listen panel/i,
      "Show or collapse the Listen panel. This does not stop an active recording.",
    ],
    [/toggle ask/i, "Show or collapse the Ask conversation panel."],
    [
      /^stop$|stop listen/i,
      "Stop audio capture, finish the final transcript, and save the session to Automatic notes.",
    ],
    [
      /^start$/i,
      "Start transcribing the selected audio source with Deepgram. Automatic answers use your selected AI provider.",
    ],
    [
      /pause listen|resume listen/i,
      "Pause or resume capture on the existing audio stream.",
    ],
    [
      /capture.*screenshot|attach screenshot/i,
      "Capture the selected display and attach one image to your next Ask question. Nothing is sent until you press Send.",
    ],
    [
      /screen on|screen off/i,
      "Turn automatic screen context on or off. When on, each Ask includes a fresh screenshot of the selected display.",
    ],
    [
      /preview.*screenshot|view last screenshot/i,
      "Review the actual image attached to, or last sent with, your question.",
    ],
    [
      /use listen context/i,
      "Include the Listen transcript with Ask questions so answers can use the current conversation.",
    ],
    [
      /send question/i,
      "Send your question, enabled Listen context, and any attached screenshot to the selected AI provider.",
    ],
    [
      /stop answer/i,
      "Cancel the current AI request. Audio capture continues unless you stop Listen.",
    ],
    [
      /new chat/i,
      "Save this conversation in Ask history and start an empty chat.",
    ],
    [/chat history/i, "Open previously saved Ask conversations."],
    [
      /audio source/i,
      "Choose Mac system audio or your microphone. During Listen, use Apply and restart to activate a new selection.",
    ],
    [
      /spoken language|change spoken language|language settings/i,
      "Choose speech-recognition language. Automatic / multilingual detects supported spoken languages.",
    ],
    [
      /answer provider|◒|model preset|^settings$/i,
      "Choose the answer provider/model and manage your securely saved API keys and preferences.",
    ],
    [
      /apply and restart/i,
      "Save this Listen session and restart capture with the selected audio source and language.",
    ],
    [
      /test ai speed/i,
      "Send one generic question to the selected provider and measure response time. Your transcript and screen are not included.",
    ],
    [
      /test vision/i,
      "Send a generated sample image to verify image understanding. Your desktop is not included.",
    ],
    [
      /test audio/i,
      "Run an eight-second local audio-level check. This test does not send audio to an AI provider.",
    ],
    [
      /answer|retry this question/i,
      "Generate an answer to the selected or latest question. This uses your chosen AI provider and its API limits.",
    ],
    [
      /summarize/i,
      "Ask the selected AI provider to summarize the current transcript and action items.",
    ],
    [
      /permissions|refresh status|allow screen|allow microphone|allow accessibility|open system/i,
      "Check or restore this app's macOS access. Accessibility is optional; capture requires screen and microphone access.",
    ],
    [
      /restart app/i,
      "Save data, quit, and reopen the app so newly granted macOS permissions can take effect.",
    ],
    [
      /privacy/i,
      "Control network access, screen/voice processing, local data, and view the activity log.",
    ],
    [
      /always on top/i,
      "Keep the workspace above other windows, or let it behave like a normal window.",
    ],
    [
      /toggle light/i,
      "Switch between the saved monochrome light and dark themes.",
    ],
    [
      /attach context|add context/i,
      "Add background notes or a supported document to inform future AI answers.",
    ],
    [/save note/i, "Save this answer or transcript as an editable local note."],
    [/new note/i, "Create a manual note stored on this Mac."],
    [/export pdf/i, "Save the selected note as a PDF file."],
    [
      /export markdown/i,
      "Save the selected note as an editable Markdown file.",
    ],
    [
      /share note/i,
      "Open the macOS sharing menu for this note. You choose the destination.",
    ],
    [/favorite/i, "Mark notes as favorites, or show your favorite notes."],
    [
      /archive|unarchive/i,
      "Move notes to the archive, restore them, or view archived notes.",
    ],
    [/delete/i, "Open the confirmation for deleting the selected content."],
    [/create folder|save folder/i, "Create a folder to organize local notes."],
    [/note folder/i, "Choose the folder for this note."],
    [
      /sort notes|grid view|list view/i,
      "Change how notes are ordered or displayed.",
    ],
    [
      /automatic|manual|all notes|^library$/i,
      "Filter notes by how they were created, or return to the note library.",
    ],
    [/^done$|save context/i, "Save your changes and close this panel."],
    [
      /api key setup tutorial|open api key/i,
      "Follow the guide for creating provider keys and adding them in Settings.",
    ],
  ];
  const match = rules.find(([pattern]) => pattern.test(label));
  if (match) return match[1];
  if (control.closest(".ryx-note-card"))
    return "Open this note to edit it, organize it, or export it.";
  if (control.getAttribute("role") === "option")
    return `Choose ${label.slice(0, 100)} for this setting.`;
  return (
    control.getAttribute("title") ||
    `Select ${label.slice(0, 100) || "this control"}.`
  );
}
export default function ControlTooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: HTMLElement | null = null;
    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (active) {
        active.removeAttribute("aria-describedby");
      }
      active = null;
      setTip(null);
    };
    const show = (event: Event) => {
      const control = (event.target as HTMLElement)?.closest<HTMLElement>(
        '.mist-app button, .mist-app [role="combobox"]',
      );
      if (!control) return;
      if (
        control.getAttribute("role") === "option" ||
        control.getAttribute("aria-expanded") === "true" ||
        document.querySelector('[role="listbox"]')
      ) {
        hide();
        return;
      }
      if (control === active) return;
      hide();
      active = control;
      const text = explanation(control);
      control.removeAttribute("title");
      timer = setTimeout(
        () => {
          if (
            !control.isConnected ||
            control.getAttribute("aria-expanded") === "true" ||
            document.querySelector('[role="listbox"]')
          )
            return;
          const rect = control.getBoundingClientRect();
          control.setAttribute("aria-describedby", "ryx-control-tooltip");
          setTip({
            text,
            x: Math.max(10, Math.min(rect.left, window.innerWidth - 280)),
            y:
              rect.bottom + 85 > window.innerHeight
                ? Math.max(10, rect.top - 82)
                : rect.bottom + 8,
          });
        },
        control.closest('[data-panel="settings"]') ? 2000 : 350,
      );
    };
    const leave = (event: Event) => {
      if (
        active &&
        !active.contains((event as MouseEvent).relatedTarget as Node)
      )
        hide();
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", hide);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", hide);
    };
  }, []);
  return tip ? (
    <div
      id="ryx-control-tooltip"
      role="tooltip"
      className="ryx-control-tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  ) : null;
}
