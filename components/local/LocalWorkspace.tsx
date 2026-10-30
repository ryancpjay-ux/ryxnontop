"use client";
import DesktopUpdates from "./DesktopUpdates";
import { setupAlreadyComplete } from "@/lib/desktop-onboarding";
import { saveWindowsUpdateState } from "@/lib/windows-update-save";

import {WindowsCapturePanel} from "./WindowsCapturePanel";
import {useLiveScreen} from "./useLiveScreen";
import SettingsPanel from "./SettingsPanel";
import WindowsApiSetup, { type WindowsApiProps } from "./WindowsApiSetup";
import WindowsOpeningIntro from "./WindowsOpeningIntro";
import ControlTooltips from "./ControlTooltips";

import {
  providerLabels,
  defaultModels,
  modelPresets,
  type Provider,
} from "@/lib/local-providers";

import { AutoQuestionQueue } from "@/lib/local-question-queue";
import { buildResponsePrompt, autoResponseDelay } from "@/lib/local-response";

import { acquireAudioStream } from "@/lib/local-audio";
import { freshSession } from "@/lib/local-session";
import { listenStatus } from "@/lib/local-listen-status";
import {captureWhileCurrent} from "@/lib/local-capture-lifetime";
import { captureErrorMessage } from "@/lib/local-capture-error";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AudioLines,
  Mic,
  MessageCircle,
  Paperclip,
  Sun,
  Settings,
  X,
  Minus,
  ListChecks,
  FileText,
  Link2,
  History,
  Languages,
  Play,
  Square,
  Plus,
  ArrowUp,
  Camera,
  Ear,
  EyeOff,
  ChevronDown,
  RefreshCw,
  Check,
  Search,
  Download,
  Trash2,
  Pin,
  Copy,
  ArrowRight,
  Pause,
  Shield,
  Monitor,
  Eye,
  WifiOff,
  Timer,
} from "lucide-react";
import { APP_DISPLAY_NAME } from "@/lib/constant";
import Image from "next/image";
import SafeMarkdown from "@/components/SafeMarkdown";
import { useLocalAudio } from "./useLocalAudio";
import { SelectMenu } from "./SelectMenu";
import { NotesLibrary } from "./NotesLibrary";
import { PrivacyPanel, type ActivityEntry } from "./PrivacyPanel";
import {
  latestQuestion,
  questionsInTranscript,
  type NoteRecord,
} from "@/lib/local-library";

type Message = { id: string; role: "user" | "assistant"; text: string };
type Note = NoteRecord;
type Request = {
  id: string;
  title: string;
  answer: string;
  status?: "pending" | "answered" | "failed" | "cancelled";
  error?: string;
};
type Dialog =
  | "settings"
  | "context"
  | "privacy"
  | "screens"
  | "chats"
  | "image"
  | "keys-guide"
  | "permissions"
  | "language"
  | null;
type SavedChat = {
  id: string;
  title: string;
  date: string;
  messages: Message[];
};
const storageKey = "mist-workspace-v1";

const languageLabels: Record<string, string> = {
  multi: "Automatic / multilingual (Suggested)",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
};
function SpokenLanguageMenu({
  value,
  onChange,
  label = "Spoken language",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <SelectMenu
      label={label}
      value={languageLabels[value] || value}
      options={Object.values(languageLabels)}
      placement="down"
      onChange={(name) =>
        onChange(
          Object.keys(languageLabels).find(
            (key) => languageLabels[key] === name,
          )!,
        )
      }
    />
  );
}
function IconButton({
  label,
  children,
  onClick,
  active,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`mist-icon ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function saveFile(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LocalWorkspace() {
  const [ready, setReady] = useState(false);
  const [quitRequested,setQuitRequested]=useState(false);
  const [listenFailure,setListenFailure]=useState("");
  const [introVisible, setIntroVisible] = useState(true);
  const finishIntro = useCallback(() => setIntroVisible(false), []);
  const [desktop, setDesktop] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [view, setView] = useState<"listen" | "notes" | "history" | "sessions">(
    "listen",
  );
  const [askVisible, setAskVisible] = useState(true);
  const [listenVisible, setListenVisible] = useState(true);
  const expandedWindowSize = useRef<{ width: number; height: number } | null>(
    null,
  );
  const [light, setLight] = useState(false);
  const [opacity, setOpacity] = useState(96);
  const [geminiKey, setGeminiKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [keyStatus, setKeyStatus] = useState("Loading saved keys…");
  const lastSavedKeys = useRef(
    JSON.stringify({
      geminiKey: "",
      deepgramKey: "",
      openaiKey: "",
      anthropicKey: "",
    }),
  );
  const [model, setModel] = useState("gemini-3.5-flash-lite");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [providerModels, setProviderModels] = useState<
    Record<Provider, string>
  >({ ...defaultModels });
  const [keysGuideCompleted, setKeysGuideCompleted] = useState(false);
  const [setupStarted, setSetupStarted] = useState(false);
  const providerKey =
    provider === "gemini"
      ? geminiKey
      : provider === "openai"
        ? openaiKey
        : anthropicKey;
  const [source, setSource] = useState("system");
  const [language, setLanguage] = useState("multi");
  const [style, setStyle] = useState("Concise");
  const [mode, setMode] = useState("Interview");
  const [autoAnswer, setAutoAnswer] = useState(true);
  const lastAutoAnswer = useRef(0);
  const windowsListenStartPending = useRef(false);
  const [context, setContext] = useState("");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [lastSentImage, setLastSentImage] = useState<string | undefined>();
  const [previewImage, setPreviewImage] = useState<string | undefined>();
  const [busy, setBusy] = useState<"ask" | "listen" | "notes" | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [chatHistory, setChatHistory] = useState<SavedChat[]>([]);
  const chatId = useRef("");
  const [includeListen, setIncludeListen] = useState(true);
  const [screenContext, setScreenContext] = useState(true);
  const [screenSource, setScreenSource] = useState("");
  const [screenName, setScreenName] = useState("Current screen");
  const [screens, setScreens] = useState<
    { id: string; name: string; thumbnail: string }[]
  >([]);
  const [offline, setOffline] = useState(false);

  const [askEnabled, setAskEnabled] = useState(true);
  const [visionEnabled, setVisionEnabled] = useState(true);
  const livePreview = useLiveScreen(ready && !introVisible && screenContext && visionEnabled && !offline && askVisible,screenSource);
  const liveScreen = livePreview.frame;
  const [retainAudio, setRetainAudio] = useState(false);
  const [retainHistory,setRetainHistory]=useState(true);
  const [showPerformance,setShowPerformance]=useState(false);
  const [historySearch,setHistorySearch]=useState("");
  const [permissionDiagnostic,setPermissionDiagnostic]=useState("");
  const [responseStages,setResponseStages]=useState<{capture:number;context:number;apiFirst:number|null;questionFirst:number|null}|null>(null);
  const [historyConfirm,setHistoryConfirm]=useState<string|null>(null);
  const [instantAnswers, setInstantAnswers] = useState(false);
  const [fastResponses, setFastResponses] = useState(true);
  const [servedModel, setServedModel] = useState("");
  useEffect(() => setServedModel(""), [model]);
  const [responseTiming, setResponseTiming] = useState<{
    first: number | null;
    total: number | null;
  } | null>(null);
  const [autoSummary, setAutoSummary] = useState(true);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [summaryQueue, setSummaryQueue] = useState<
    { id: string; text: string }[]
  >([]);
  const sessionRunning = useRef(false);
  const clearAfterStop = useRef(false);
  const lastCompletedTranscript = useRef<string[]>([]);
  const sessionNoteId = useRef<string | null>(null);
  const autoQuestions = useRef(new AutoQuestionQueue());
  const [autoPendingCount, setAutoPendingCount] = useState(0);
  const restartCapture = useRef(false);
  const [activeAudioSettings, setActiveAudioSettings] = useState<{
    source: string;
    language: string;
  } | null>(null);
  const latestWorkspace = useRef("");
  const saveEpoch = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [pinned, setPinned] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const askInputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef<string | null>(null);
  const requestKind = useRef<"ask" | "listen" | "notes" | "speed" | null>(null);
  const mounted = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const testCleanup = useRef<(() => void) | null>(null);
  const logEvent = useCallback(
    (message: string) =>
      setActivity((previous) =>
        [
          { id: crypto.randomUUID(), time: new Date().toISOString(), message },
          ...previous,
        ].slice(0, 200),
      ),
    [],
  );
  const captureError = useCallback(
    (message: string, kind?: "screen" | "microphone") => {
      message = captureErrorMessage(message);
      setError(message);
      if (
        !message.startsWith("Access required:") ||
        !window.electronAPI ||
        !window.localCopilot
      )
        return;
      const affected =
        kind ??
        ((activeAudioSettings?.source || source) === "microphone"
          ? "microphone"
          : "screen");
      if (affected === "microphone")
        void window.localCopilot.permission("microphone").catch(()=>{});
      else
        void window.electronAPI.screen
          .getAccess()
          .then((status) => {
            if (status !== "granted")
              return window.electronAPI!.screen.openSettings();
          })
          .catch(() => {});
    },
    [source, activeAudioSettings],
  );
  const audio = useLocalAudio(
    (text) => setTranscript((previous) => [...previous, text]),
    (message)=>{setListenFailure(captureErrorMessage(message));captureError(message);},
    async (blob) => {
      if (!window.localCopilot?.saveAudio) return;
      try {
        const noteId = sessionNoteId.current;
        const epoch = saveEpoch.current;
        const filename = await window.localCopilot.saveAudio(
          new Uint8Array(await blob.arrayBuffer()),
          blob.type,
        );
        if (epoch !== saveEpoch.current) {
          await window.localCopilot.clearAudio();
          return;
        }
        if (noteId)
          setNotes((previous) =>
            (previous.some((note) => note.id === noteId)
              ? previous
              : [
                  {
                    id: noteId,
                    title: "Listen session",
                    content: "",
                    date: new Date().toISOString(),
                    kind: "automatic" as const,
                  },
                  ...previous,
                ]
            ).map((note) =>
              note.id === noteId
                ? {
                    ...note,
                    audioFiles: [...(note.audioFiles ?? []), filename],
                  }
                : note,
            ),
          );
        logEvent("Audio recording saved on this device");
      } catch {
        setError("Could not save the local audio recording.");
      }
    },
  );

  useEffect(() => {
    mounted.current = true;
    setDesktop(Boolean(window.electronAPI));
    if (window.electronAPI && window.innerHeight < 400)
      void window.electronAPI.windowSetSize(1180, 760);
    let cancelled = false;
    void (async () => {
      try {
        const restored = window.localCopilot?.loadWorkspace
          ? await window.localCopilot.loadWorkspace()
          : null;
        if (cancelled) return;
        const saved = freshSession(JSON.parse(
          restored?.data ?? localStorage.getItem(storageKey) ?? "null",
        ));
        if (restored?.recovered)
          setNotice("Restored your local data from its recovery copy.");
        if (saved) {
          setNotes(saved.notes ?? []);
          setFolders(saved.folders ?? []);
          setChatHistory(saved.chatHistory ?? []);
          chatId.current = saved.chatId || crypto.randomUUID();
          setMessages(saved.messages ?? []);
          setTranscript(saved.transcript ?? []);
          setRequests(saved.requests ?? []);
          setIncludeListen(saved.includeListen ?? true);
          setScreenSource(saved.screenSource ?? "");
          setScreenContext(saved.screenContext ?? true);
          setScreenName(saved.screenName ?? "Current screen");
          setOffline(saved.offline ?? false);
          setAskEnabled(saved.askEnabled ?? true);
          setVisionEnabled(saved.visionEnabled ?? true);
          setRetainAudio(saved.retainAudio ?? false);
          setRetainHistory(saved.retainHistory ?? true);
          setShowPerformance(saved.showPerformance ?? false);
          setInstantAnswers(saved.instantAnswers ?? false);
          setFastResponses(saved.fastResponses ?? true);
          setAutoSummary(saved.autoSummary ?? true);
          setActivity(saved.activity ?? []);
          setContext(saved.context ?? "");
          const restoredProvider: Provider = [
            "gemini",
            "openai",
            "anthropic",
          ].includes(saved.provider)
            ? saved.provider
            : "gemini";
          setProvider(restoredProvider);
          const restoredModel = saved.model || defaultModels[restoredProvider];
          setModel(restoredModel);
          setProviderModels({
            ...defaultModels,
            ...saved.providerModels,
            [restoredProvider]: restoredModel,
          });
          setKeysGuideCompleted(saved.keysGuideCompleted === true);
          setSetupStarted(saved.setupStarted === true);

          setOpacity(saved.opacity ?? 96);
          setSource(saved.source ?? "system");
          setLanguage(saved.language ?? "multi");
          setLight(saved.light ?? false);
          setStyle(saved.style ?? "Concise");
          setMode(saved.mode ?? "Interview");
          setAutoAnswer(saved.autoAnswer ?? true);
        } else setDialog("keys-guide");
      } catch {
        if (!cancelled)
          setError(
            "Could not restore local data. Existing files were kept for recovery; restart the app before making changes.",
          );
        return;
      }
      if (!chatId.current) chatId.current = crypto.randomUUID();
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      testCleanup.current?.();
      if (requestId.current)
        void window.localCopilot?.cancel(requestId.current);
    };
  }, []);
  useEffect(() => {
    if (keysLoaded) return;
    let cancelled = false;
    if (!window.localCopilot?.loadKeys) {
      setKeysLoaded(true);
      setKeyStatus("Open the desktop app to remember keys securely.");
      return;
    }
    void window.localCopilot
      .loadKeys()
      .then((keys) => {
        if (cancelled) return;
        lastSavedKeys.current = JSON.stringify({
          geminiKey: keys.geminiKey,
          deepgramKey: keys.deepgramKey,
          openaiKey: keys.openaiKey ?? "",
          anthropicKey: keys.anthropicKey ?? "",
        });
        setGeminiKey(keys.geminiKey);
        setDeepgramKey(keys.deepgramKey);
        setOpenaiKey(keys.openaiKey ?? "");
        setAnthropicKey(keys.anthropicKey ?? "");
        setKeyStatus(
          keys.geminiKey ||
            keys.deepgramKey ||
            keys.openaiKey ||
            keys.anthropicKey
            ? "Saved keys restored"
            : "Keys save automatically on this device",
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Could not restore saved API keys. Unlock your device’s secure key storage or enter the keys again.",
          );
          lastSavedKeys.current = JSON.stringify({
            geminiKey: "",
            deepgramKey: "",
            openaiKey: "",
            anthropicKey: "",
          });
          setKeyStatus("Could not restore saved keys");
        }
      })
      .finally(() => {
        if (!cancelled) setKeysLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [introVisible, keysLoaded]);

  const onboardingRouted = useRef(false);
  useEffect(() => {
    if (!ready || !keysLoaded || onboardingRouted.current) return;
    onboardingRouted.current = true;
    if (setupAlreadyComplete(window.electronAPI?.platform, keysGuideCompleted, Boolean(providerKey.trim()), setupStarted)) {
      setKeysGuideCompleted(true);
      setDialog(current => current === "keys-guide" ? null : current);
    } else { setSetupStarted(true); setDialog("keys-guide"); }
  }, [ready, keysLoaded, keysGuideCompleted, providerKey, setupStarted]);
  useEffect(() => {
    void window.localCopilot?.setActivity?.(audio.state !== "idle").catch(() => {});
    return () => { void window.localCopilot?.setActivity?.(false).catch(() => {}); };
  }, [audio.state]);

  const saveProviderKeys = useCallback(async () => {
    if (!keysLoaded || !window.localCopilot?.saveKeys) return;
    const keys = {
      geminiKey: geminiKey.trim(),
      deepgramKey: deepgramKey.trim(),
      openaiKey: openaiKey.trim(),
      anthropicKey: anthropicKey.trim(),
    };
    const snapshot = JSON.stringify(keys);
    if (lastSavedKeys.current === snapshot) return;
    setKeyStatus("Saving keys…");
    try {
      await window.localCopilot.saveKeys(keys);
      lastSavedKeys.current = snapshot;
      setKeyStatus(
        keys.geminiKey ||
          keys.deepgramKey ||
          keys.openaiKey ||
          keys.anthropicKey
          ? "Keys saved securely on this device"
          : "Saved keys removed",
      );
    } catch {
      setKeyStatus("Keys have not been saved");
      throw new Error(
        "Could not save API keys. Unlock your device’s secure key storage and try again.",
      );
    }
  }, [keysLoaded, geminiKey, deepgramKey, openaiKey, anthropicKey]);

  useEffect(() => {
    const saveBeforeExit = (event: BeforeUnloadEvent) => {
      if (!keysLoaded || !window.localCopilot?.saveKeysNow) return;
      const keys = {
        geminiKey: geminiKey.trim(),
        deepgramKey: deepgramKey.trim(),
        openaiKey: openaiKey.trim(),
        anthropicKey: anthropicKey.trim(),
      };
      const snapshot = JSON.stringify(keys);
      if (lastSavedKeys.current === snapshot) return;
      const result = window.localCopilot.saveKeysNow(keys);
      if (result.success) lastSavedKeys.current = snapshot;
      else {
        event.preventDefault();
        event.returnValue = "";
        setError(
          "Could not save your API keys. The app stayed open so you can retry in Settings.",
        );
      }
    };
    window.addEventListener("beforeunload", saveBeforeExit);
    return () => window.removeEventListener("beforeunload", saveBeforeExit);
  }, [keysLoaded, geminiKey, deepgramKey, openaiKey, anthropicKey]);

  useEffect(() => {
    if (!window.electronAPI || !ready || introVisible) return;
    if(!expandedWindowSize.current) expandedWindowSize.current={width:window.innerWidth,height:window.innerHeight};
    const base=expandedWindowSize.current;
    const count=Number(listenVisible)+Number(askVisible);
    const width=dialog?Math.max(base.width,900):count===2?base.width:count===1?Math.max(760,Math.round(base.width*(listenVisible?.68:.57))):Math.min(760,base.width);
    const height=count||dialog?Math.max(600,base.height):205;
    void window.electronAPI.windowSetSize(width,height);
  },[ready,introVisible,listenVisible,askVisible,dialog]);

  const quitAudioState=audio.state;
  const stopForQuit=audio.stop;
  useEffect(()=>{
    const finishBeforeQuit=(event:BeforeUnloadEvent)=>{
      if(quitAudioState!=="idle") {
        event.preventDefault();event.returnValue="";
        setQuitRequested(true);stopForQuit();
      }
    };
    window.addEventListener("beforeunload",finishBeforeQuit);
    return ()=>window.removeEventListener("beforeunload",finishBeforeQuit);
  },[quitAudioState,stopForQuit]);
  useEffect(()=>{
    if(!quitRequested || audio.state!=="idle")return;
    setQuitRequested(false);
    void saveProviderKeys().then(()=>window.electronAPI?.windowClose()).catch(error=>setError(error.message));
  },[quitRequested,audio.state,saveProviderKeys]);
  const quitApp=()=>{
    if(audio.state!=="idle") {setQuitRequested(true);audio.stop();setNotice("Finishing and saving the last transcript before quitting…");}
    else void saveProviderKeys().then(()=>window.electronAPI?.windowClose()).catch(error=>setError(error.message));
  };

  const closeDialog = useCallback(() => {
    setDialog(null);
    if (dialog === "settings")
      void saveProviderKeys().catch((error) => setError(error.message));
  }, [dialog, saveProviderKeys]);

  useEffect(() => {
    void window.electronAPI
      ?.windowIsAlwaysOnTop()
      .then(setPinned)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!keysLoaded) return;
    const timer = setTimeout(() => {
      void saveProviderKeys().catch((error) => setError(error.message));
    }, 450);
    return () => clearTimeout(timer);
  }, [keysLoaded, saveProviderKeys]);

  useEffect(() => {
    if (!ready) return;
    const snapshot = JSON.stringify({
      notes,
      context,
      model,
      provider,
      providerModels,
      keysGuideCompleted,
      setupStarted,
      opacity,
      source,
      language,
      light,
      style,
      mode,
      autoAnswer,
      folders,
      chatHistory,
      chatId: chatId.current,
      listenSessionId: sessionNoteId.current,
      screenContext,
      messages,
      transcript,
      requests,
      includeListen,
      screenSource,
      screenName,
      offline,
      askEnabled,
      visionEnabled,
      retainAudio,
      retainHistory,
      showPerformance,
      instantAnswers,
      fastResponses,
      autoSummary,
      activity,
    });
    latestWorkspace.current = snapshot;
    const epoch = saveEpoch.current;
    const timer = setTimeout(() => {
      if (saveEpoch.current !== epoch) return;
      try {
        if (window.localCopilot?.saveWorkspace) {
          void window.localCopilot
            .saveWorkspace(snapshot)
            .catch(() =>
              setError(
                "Could not save local data. Check free disk space and export a backup.",
              ),
            );
        } else localStorage.setItem(storageKey, snapshot);
      } catch {
        setError(
          "Local storage is full. Export your data from Privacy to keep a copy.",
        );
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [
    ready,
    notes,
    context,
    model,
    provider,
    providerModels,
    keysGuideCompleted,
    setupStarted,
    opacity,
    source,
    language,
    light,
    style,
    mode,
    autoAnswer,
    folders,
    chatHistory,
    messages,
    transcript,
    requests,
    includeListen,
    screenContext,
    screenSource,
    screenName,
    offline,
    askEnabled,
    visionEnabled,
    retainAudio,
    retainHistory,
    showPerformance,
    instantAnswers,
    fastResponses,
    autoSummary,
    activity,
  ]);
  useEffect(() => {
    const flush = (event: BeforeUnloadEvent) => {
      if (!latestWorkspace.current) return;
      try {
        const data = JSON.parse(latestWorkspace.current);
        if (
          sessionRunning.current &&
          sessionNoteId.current &&
          data.transcript?.length &&
          !data.notes.some((note: Note) => note.id === sessionNoteId.current)
        ) {
          data.notes.unshift({
            id: sessionNoteId.current,
            title: "Listen session",
            content: data.transcript.join("\n\n"),
            date: new Date().toISOString(),
            kind: "automatic",
          });
        }
        const snapshot = JSON.stringify(freshSession(data));
        if (window.localCopilot?.saveWorkspaceNow) {
          if (!window.localCopilot.saveWorkspaceNow(snapshot).success)
            throw new Error("Save failed");
        } else localStorage.setItem(storageKey, snapshot);
      } catch {
        event.preventDefault();
        event.returnValue = "";
        setError("Could not save local data. Export a backup before closing.");
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, askVisible]);
  const capture = useCallback(async () => {
    setError("");
    if (!visionEnabled) {
      setError("Enable screen analysis in Privacy first.");
      return;
    }
    if (!window.electronAPI) {
      setError("Screen capture is available in the installed desktop app.");
      return;
    }
    try {
      if (
        (await window.electronAPI.screen.getAccess()) !== "granted" &&
        (await window.electronAPI.screen.triggerPrompt()) !== "granted"
      ) {
        captureError(
          window.electronAPI?.platform === "win32" ? "Screen access was not approved. Open Permissions to allow capture." : "Access required: Enable ryxnontop in macOS Screen & System Audio Recording. If already enabled, restart the app for the grant to take effect.",
          "screen",
        );
        return;
      }
      const result = await window.electronAPI.screen.capture(
        screenSource || undefined,
      );
      if (result.success) {
        setImage(result.dataUrl);
        setAskVisible(true);
        logEvent("Screenshot captured locally; not sent until you ask");
      } else setError(result.error);
    } catch {
      setError(
        "Could not capture the screen. Check Screen Recording permission.",
      );
    }
  }, [visionEnabled, screenSource, logEvent, captureError]);
  useEffect(
    () => window.electronAPI?.screen.onCaptureAndAsk(() => void capture()),
    [capture],
  );
  const chooseScreen = useCallback(async () => {
    if (!visionEnabled) {
      setError("Enable screen analysis in Privacy first.");
      return;
    }
    if (!window.localCopilot?.screens) {
      setError("Screen selection is available in the installed desktop app.");
      return;
    }
    try {
      if(window.electronAPI && (await window.electronAPI.screen.getAccess())!=="granted") await window.electronAPI.screen.triggerPrompt();
      const available=await window.localCopilot.screens();
      if(!available.length || available.every(screen=>!screen.thumbnail)) throw new Error("No screens");
      setScreens(available);
      setDialog("screens");
    } catch {
      if (window.electronAPI?.platform === "win32") { setDialog("permissions"); setError("Screen capture unavailable or not approved. Allow access in Permissions and retry."); return; }
      captureError("Access required: Could not capture any screens. Open Screen & System Audio Recording for ryxnontop. If already enabled, restart once; a stale entry may need to be removed and re-added manually.","screen");
    }
  }, [visionEnabled, captureError]);

  const runNoteAI = useCallback(
    async (prompt: string): Promise<string | null> => {
      if (offline) {
        setError("AI is disabled in offline mode.");
        return null;
      }
      if (!providerKey.trim()) {
        setDialog(keysGuideCompleted ? "settings" : "keys-guide");
        setError("Add your selected provider’s key to use AI.");
        return null;
      }
      if (!window.localCopilot || requestId.current) return null;
      const id = crypto.randomUUID();
      requestId.current = id;
      requestKind.current = "notes";
      setBusy("notes");
      logEvent(
        `Note text sent to ${providerLabels[provider]} for AI editing or summary`,
      );
      try {
        const result = await window.localCopilot.reply({
          id,
          key: providerKey.trim(),
          model,
          provider,
          prompt,
        });
        return mounted.current && requestId.current === id ? result : null;
      } catch (error) {
        if (requestId.current === id)
          setError(
            error instanceof Error ? error.message : "AI editing failed.",
          );
        return null;
      } finally {
        if (requestId.current === id) {
          requestId.current = null;
          requestKind.current = null;
          if (mounted.current) setBusy(null);
        }
      }
    },
    [offline, providerKey, model, provider, logEvent, keysGuideCompleted],
  );

  const reply = useCallback(
    async (target: "ask" | "listen", task?: string) => {
      if (requestId.current && requestKind.current !== "notes" && !(target === "listen" && requestKind.current === "listen")) return;
      if (target === "listen" && requestKind.current === "listen")
        setRequests(previous=>previous.map(r=>r.id===requestId.current?{...r,status:"cancelled"}:r));
      setError("");
      if (offline) {
        setError("The app is offline. Enable network access in Privacy.");
        return;
      }
      if (target === "ask" && !askEnabled) {
        setError("Ask is disabled in Privacy.");
        return;
      }
      if (!providerKey.trim()) {
        setError(
          "Add your selected provider’s API key in Settings to generate answers.",
        );
        setDialog(keysGuideCompleted ? "settings" : "keys-guide");
        return;
      }
      if (!window.localCopilot) {
        setError("AI requests run in the installed desktop app.");
        return;
      }
      const text = task ?? question.trim();
      if (target === "ask" && !text && !image && !screenContext) return;
      if (target === "listen" && !transcript.length) {
        setError(
          "Start Listen first, or load a transcript through Add context.",
        );
        return;
      }
      if (requestId.current) void window.localCopilot.cancel(requestId.current);
      const id = crypto.randomUUID();
      requestId.current = id;
      requestKind.current = target;
      setBusy(target);
      const startedAt = performance.now();
      let firstAt: number | null = null;
      let apiStarted=startedAt; let captureMs=0;
      const detectedAt=target==="listen"?audio.speechEnd:0;
      setResponseTiming({ first: null, total: null });
      setServedModel("");
      let unsubscribe = () => {};
      let pendingText = "";
      let renderTimer: ReturnType<typeof setTimeout> | undefined;
      const flushText = () => {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = undefined;
        const text = pendingText;
        pendingText = "";
        if (!text || !mounted.current || requestId.current !== id) return;
        if (target === "ask")
          setMessages((previous) =>
            previous.map((message) =>
              message.id === id
                ? { ...message, text: message.text + text }
                : message,
            ),
          );
        else
          setRequests((previous) =>
            previous.map((request) =>
              request.id === id
                ? { ...request, answer: request.answer + text }
                : request,
            ),
          );
      };
      try {
        const current = () => mounted.current && requestId.current === id;
        let attachedImage = visionEnabled ? image : undefined;
        if (target === "ask" && screenContext && visionEnabled) {
          if (
            window.electronAPI &&
            (await window.electronAPI.screen.getAccess()) !== "granted" &&
            (await window.electronAPI.screen.triggerPrompt()) !== "granted"
          )
            throw new Error(
              window.electronAPI?.platform === "win32" ? "Screen access was not approved. Open Permissions to allow capture." : "Access required: Enable screen recording for ryxnontop in System Settings, then restart the app if macOS requests it.",
            );
          if (!current()) return;
          const captureStarted=performance.now();
          const snapshot = await captureWhileCurrent(async()=>{},()=>window.electronAPI!.screen.capture(screenSource||undefined),current);
          if (!current()) return;
          if (!snapshot?.success)
            throw new Error(
              snapshot && !snapshot.success
                ? snapshot.error
                : "Screen capture is unavailable.",
            );
          if (!current()) return;
          captureMs=performance.now()-captureStarted;
          attachedImage = snapshot.dataUrl;
          setImage(snapshot.dataUrl);
        }
        if (!current()) return;
        if (target === "listen" && !task?.startsWith("Summarize")) {
          const q = task?.startsWith(
            "Answer this question using the conversation context: ",
          )
            ? task.slice(
                "Answer this question using the conversation context: ".length,
              )
            : latestQuestion(transcript);
          autoQuestions.current.acknowledge(
            transcript.join(" ").lastIndexOf(q),
          );
          setAutoPendingCount(autoQuestions.current.size);
        }
        const prompt = buildResponsePrompt({
          windows: window.electronAPI?.platform === "win32",
          mode,
          style,
          fast: fastResponses,
          hasImage: Boolean(attachedImage && target === "ask"),
          context,
          transcript: transcript.length
            ? transcript
            : lastCompletedTranscript.current,
          includeListen: target === "listen" || includeListen,
          messages: target === "ask" ? messages : [],
          task: text || "Explain the selected screenshot.",
        });
        if (target === "ask") {
          setMessages((previous) => [
            ...previous,
            {
              id: `${id}-user`,
              role: "user",
              text: text || "Explain this screenshot",
            },
            { id, role: "assistant", text: "" },
          ]);
          setQuestion("");
        } else {
          const title = task?.startsWith("Summarize")
            ? "Session summary"
            : task?.startsWith(
                  "Answer this question using the conversation context: ",
                )
              ? task.slice(
                  "Answer this question using the conversation context: "
                    .length,
                )
              : latestQuestion(transcript) ||
                transcript.at(-1)?.slice(0, 160) ||
                "Latest question";
          setRequests((previous) => [
            { id, title, answer: "", status: "pending" },
            ...previous,
          ]);
          setSelected(id);
        }
        logEvent(
          `Sent ${target === "ask" ? "Ask context" : "Listen question"}${attachedImage && target === "ask" ? " and selected screenshot" : ""} to ${providerLabels[provider]}`,
        );
        unsubscribe = window.localCopilot.onChunk((chunk) => {
          if (chunk.id !== id || requestId.current !== id || !mounted.current)
            return;
          if (chunk.modelVersion) setServedModel(chunk.modelVersion);
          pendingText += chunk.text;
          if (firstAt === null && chunk.text) {
            const now=performance.now();
            firstAt = now - startedAt;
            setResponseStages({capture:captureMs,context:apiStarted-startedAt,apiFirst:now-apiStarted,questionFirst:detectedAt?now-detectedAt:null});
            setResponseTiming({ first: firstAt, total: null });
            flushText();
          } else if (!renderTimer) renderTimer = setTimeout(flushText, 40);
        });
        if (target === "ask" && attachedImage) setLastSentImage(attachedImage);
        apiStarted=performance.now();
        setResponseStages({capture:captureMs,context:apiStarted-startedAt,apiFirst:null,questionFirst:null});
        const answer = await window.localCopilot.reply({
          id,
          key: providerKey.trim(),
          model,
          provider,
          prompt,
          fast: fastResponses,
          image: target === "ask" ? attachedImage : undefined,
        });
        flushText();
        if (!mounted.current || requestId.current !== id) return;
        if (target === "ask") {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === id ? { ...message, text: answer } : message,
            ),
          );
          setImage(undefined);
        } else
          setRequests((previous) =>
            previous.map((request) =>
              request.id === id
                ? { ...request, answer, status: "answered" }
                : request,
            ),
          );
        const total = performance.now() - startedAt;
        setResponseTiming({ first: firstAt, total });
        logEvent(
          `AI response completed: first text ${((firstAt ?? total) / 1000).toFixed(1)}s, total ${(total / 1000).toFixed(1)}s`,
        );
      } catch (error) {
        if (mounted.current && requestId.current === id) {
          setResponseTiming(null);
          if(target==="listen")setListenFailure(error instanceof Error?error.message:"Request failed.");
          captureError(
            error instanceof Error ? error.message : "Request failed.",
            "screen",
          );
          setRequests((previous) =>
            previous.map((request) =>
              request.id === id
                ? {
                    ...request,
                    status: "failed",
                    error:
                      error instanceof Error
                        ? error.message
                        : "Request failed.",
                  }
                : request,
            ),
          );
        }
      } finally {
        flushText();
        unsubscribe();
        if (requestId.current === id) {
          requestId.current = null;
          requestKind.current = null;
          if (mounted.current) setBusy(null);
        }
      }
    },
    [
      offline,
      askEnabled,
      providerKey,
      question,
      image,
      screenContext,
      visionEnabled,
      screenSource,
      includeListen,
      transcript,
      mode,
      style,
      context,
      messages,
      model,
      provider,
      fastResponses,
      logEvent,
      keysGuideCompleted,
      captureError,
      audio.speechEnd,
    ],
  );

  useEffect(() => {
    if (!autoAnswer || offline || audio.state === "idle") {
      autoQuestions.current.clear();
      setAutoPendingCount(0);
      return;
    }
    if (!providerKey || audio.state !== "live" || !transcript.length) return;
    const detected = questionsInTranscript(transcript.slice(0,audio.completedSegments));
    const timer = setTimeout(
      () => {
        for (const question of detected)
          autoQuestions.current.enqueue(question);
        setAutoPendingCount(autoQuestions.current.size);
      },
      autoResponseDelay(fastResponses, instantAnswers),
    );
    return () => clearTimeout(timer);
  }, [
    autoAnswer,
    offline,
    audio.state,
    providerKey,
    transcript,
    fastResponses,
    instantAnswers,
    audio.completedSegments,
  ]);
  useEffect(() => {
    if (
      !autoAnswer ||
      offline ||
      audio.state !== "live" ||
      !autoPendingCount ||
      (busy && busy !== "notes" && busy !== "listen") ||
      (requestId.current && requestKind.current !== "notes" && requestKind.current !== "listen")
    )
      return;
    const next = autoQuestions.current.take();
    setAutoPendingCount(autoQuestions.current.size);
    if (next)
      void reply(
        "listen",
        `Answer this question using the conversation context: ${next.question}`,
      );
  }, [autoAnswer, offline, audio.state, autoPendingCount, busy, reply]);

  useEffect(() => {
    if (!visionEnabled) {
      setImage(undefined);
      setLastSentImage(undefined);
      setScreenContext(false);
    }
  }, [visionEnabled]);
  const stopAudio = audio.stop;
  useEffect(() => {
    if (!ready) return;
    if (offline) {
      stopAudio(true);
      if (requestId.current) void window.localCopilot?.cancel(requestId.current);
      requestId.current=null;requestKind.current=null;setBusy(null);
    }
    void window.localCopilot
      ?.setNetwork(!offline)
      .catch(() => setError("Could not change network mode."));
    logEvent(
      offline
        ? "Offline mode enabled; audio and AI requests stopped"
        : "Online mode enabled",
    );
  }, [offline, ready, stopAudio, logEvent]);

  useEffect(() => {
    if (audio.state !== "live") return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [audio.state]);

  useEffect(() => {
    if (audio.state === "live" || audio.state === "paused")
      sessionRunning.current = true;
    if (audio.state !== "idle" || !sessionRunning.current) return;
    sessionRunning.current = false;
    if (!transcript.length) return;
    if(!retainHistory) {setTranscript([]);setRequests([]);lastCompletedTranscript.current=[];setNotice("Session finished. History retention is off.");return;}
    const id = sessionNoteId.current || crypto.randomUUID();
    sessionNoteId.current = id;
    const text = [transcript.join("\n\n"),...requests.map(r=>`### ${r.title}\n\n${r.answer||r.error||"No answer"}`)].join("\n\n");
    lastCompletedTranscript.current = [...transcript];
    setNotes((previous) => [
      {
        id,
        title: `Listen session · ${new Date().toLocaleString()}`,
        content: text,
        date: new Date().toISOString(),
        kind: "automatic",
        audioFiles: previous.find((note) => note.id === id)?.audioFiles,
      },
      ...previous.filter((note) => note.id !== id),
    ]);
    if (autoSummary) setSummaryQueue((previous) => [...previous, { id, text }]);
    setTranscript([]);
    setRequests([]);setSelected(null);
    if(requestKind.current==="listen" && requestId.current) {void window.localCopilot?.cancel(requestId.current);requestId.current=null;requestKind.current=null;setBusy(null);}
    setView("sessions");
    setActiveNote(id);
    if(clearAfterStop.current) { clearAfterStop.current=false;setRequests([]);setSelected(null);lastCompletedTranscript.current=[];setView("listen"); }
    setNotice("Session saved in Automatic notes. Ready for a fresh Listen.");
    logEvent("Listen session saved locally");
  }, [audio.state, transcript, requests, retainHistory, autoSummary, logEvent]);

  useEffect(() => {
    if (!summaryQueue.length || busy || offline || !providerKey) return;
    const job = summaryQueue[0];
    setSummaryQueue((previous) => previous.slice(1));
    void runNoteAI(
      `Summarize this conversation with key points, decisions, and action items. Use Markdown and do not invent facts.\n${job.text}`,
    ).then((summary) => {
      if (summary)
        setNotes((previous) =>
          previous.map((note) =>
            note.id === job.id
              ? {
                  ...note,
                  content: `## Summary\n\n${summary}\n\n## Transcript\n\n${note.content}`,
                }
              : note,
          ),
        );
    });
  }, [summaryQueue, busy, offline, providerKey, runNoteAI]);

  const toggleListen = useCallback(() => {
    if (window.electronAPI?.platform === "win32" && windowsListenStartPending.current) return;
    setListenFailure("");
    setError("");
    if (audio.state !== "idle") {
      audio.stop();
      return;
    }
    if (offline) {
      setError("Listen is disabled in offline mode.");
      return;
    }
    if (!deepgramKey.trim()) {
      setError("Add your Deepgram key in Settings before starting Listen.");
      setDialog("settings");
      return;
    }
    testCleanup.current?.();
    if (requestId.current && requestKind.current === "listen") {
      void window.localCopilot?.cancel(requestId.current);
      requestId.current = null;
      requestKind.current = null;
      setBusy(null);
    }
    lastCompletedTranscript.current = [];
    setView("listen");
    setTranscript([]);
    setRequests([]);
    setSelected(null);
    setElapsed(0);
    autoQuestions.current.clear();
    setAutoPendingCount(0);
    lastAutoAnswer.current = 0;
    sessionNoteId.current = crypto.randomUUID();
    logEvent(
      `Starting ${source === "system" ? "system audio" : "microphone"} transcription with Deepgram`,
    );
    setActiveAudioSettings({ source, language });
    if (window.electronAPI?.platform === "win32") {
      windowsListenStartPending.current = true;
      void saveProviderKeys().then(() => audio.start(deepgramKey, source, language, retainAudio))
        .catch(error => { setListenFailure(error.message); setError(error.message); })
        .finally(() => { windowsListenStartPending.current = false; });
    } else void audio.start(deepgramKey, source, language, retainAudio);
  }, [audio, offline, deepgramKey, source, language, retainAudio, logEvent, saveProviderKeys]);

  useEffect(() => {
    if (audio.state === "idle" && restartCapture.current) {
      restartCapture.current = false;
      toggleListen();
    }
  }, [audio.state, toggleListen]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (dialog) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeDialog();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void reply(
          "listen",
          event.shiftKey
            ? "Summarize the session and list action items."
            : "Answer the most recent question in the transcript.",
        );
      }
      if (event.altKey && event.code === "KeyA") {
        event.preventDefault();
        setAskVisible((v) => !v);
      }
      if (event.altKey && event.code === "KeyN") {
        event.preventDefault();
        setListenVisible(true);
        setView("notes");
      }
      if (event.altKey && event.code === "KeyC") {
        event.preventDefault();
        setListenVisible(true);
        setView("listen");
      }
      if (event.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [reply, dialog, closeDialog]);

  function addNote(content = "", title = "Untitled note") {
    const note = {
      id: crypto.randomUUID(),
      title,
      content,
      kind: "manual" as const,
      date: new Date().toISOString(),
    };
    setNotes((prev) => [note, ...prev]);
    setActiveNote(note.id);
    setListenVisible(true);
    setView("notes");
    setNotice("Note saved on this device");
  }
  async function testAudio() {
    if (testing) {
      testCleanup.current?.();
      return;
    }
    setError("");
    try {
      const stream = await acquireAudioStream(
        navigator.mediaDevices,
        source,
        (kind) => window.localCopilot?.prepareAudio(kind) ?? Promise.resolve(),
      );
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx
        .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
        .connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const timer = setInterval(() => {
        analyser.getByteFrequencyData(data);
        setLevel(
          Math.min(100, (data.reduce((a, b) => a + b, 0) / data.length) * 2),
        );
      }, 100);
      let duration: ReturnType<typeof setTimeout>;
      testCleanup.current = () => {
        clearInterval(timer);
        clearTimeout(duration);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        setTesting(false);
        setLevel(0);
        testCleanup.current = null;
      };
      duration = setTimeout(() => testCleanup.current?.(), 8000);
      setTesting(true);
    } catch (e) {
      captureError(
        e instanceof Error ? e.message : "Audio test failed.",
        source === "microphone" ? "microphone" : "screen",
      );
    }
  }
  async function testAiSpeed(vision = false) {
    if (requestId.current) return;
    if (!window.localCopilot || offline || !providerKey.trim()) {
      setError(
        "Open the desktop app online with a selected provider key to test response speed.",
      );
      return;
    }
    const id = crypto.randomUUID();
    requestId.current = id;
    requestKind.current = "speed";
    setBusy("ask");
    setError("");
    setResponseTiming({ first: null, total: null });
    const start = performance.now();
    let first: number | null = null;
    const unsubscribe = window.localCopilot.onChunk((chunk) => {
      if (chunk.id === id && chunk.modelVersion)
        setServedModel(chunk.modelVersion);
      if (chunk.id === id && chunk.text && first === null) {
        first = performance.now() - start;
        setResponseTiming({ first, total: null });
      }
    });
    try {
      let fixtureImage: string | undefined;
      if (vision) {
        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = 300;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 900, 300);
        context.fillStyle = "#000000";
        context.font = "bold 64px sans-serif";
        context.fillText("BLUEBIRD 7426", 45, 165);
        fixtureImage = canvas.toDataURL("image/png");
      }
      const result = await window.localCopilot.reply({
        id,
        key: providerKey.trim(),
        model,
        provider,
        fast: fastResponses,
        image: fixtureImage,
        prompt: vision
          ? "Read the code printed in the attached image. Return only the exact code you can see."
          : "Answer directly in two short sentences: What is an HTTP request?",
      });
      if (window.electronAPI?.platform === "win32" && requestId.current !== id) return;
      if (vision && !result.includes("BLUEBIRD 7426"))
        throw new Error(
          "Vision check did not read the sample correctly. Provider/model image handling needs review.",
        );
      const total = performance.now() - start;
      setResponseTiming({ first, total });
      setNotice(
        vision
          ? `Vision check passed: sample image read correctly in ${(total / 1000).toFixed(1)}s. No desktop screenshot was sent.`
          : `Speed check: ${((first ?? total) / 1000).toFixed(1)}s to first text, ${(total / 1000).toFixed(1)}s total. No transcript or screenshot was sent.`,
      );
      logEvent(
        `${vision ? "Synthetic AI vision check passed" : "Synthetic AI speed check"}: first text ${((first ?? total) / 1000).toFixed(1)}s, total ${(total / 1000).toFixed(1)}s`,
      );
    } catch (error) {
      setError(captureErrorMessage(error instanceof Error ? error.message : "Speed check failed."));
      setResponseTiming(null);
    } finally {
      unsubscribe();
      if (requestId.current === id) {
        requestId.current = null;
        requestKind.current = null;
        setBusy(null);
      }
    }
  }

  function changeSpokenLanguage(next: string) {
    if (next === language) return;
    setLanguage(next);
    if (audio.state !== "idle") {
      restartCapture.current = true;
      if (requestId.current)
        void window.localCopilot?.cancel(requestId.current);
      audio.stop();
      setNotice(
        `Saving the session and restarting Listen in ${languageLabels[next] || next}`,
      );
    }
  }
  function changeProvider(next: Provider) {
    if (window.electronAPI?.platform === "win32") setResponseTiming(null);
    if (requestId.current) void window.localCopilot?.cancel(requestId.current);
    requestId.current = null;
    requestKind.current = null;
    setBusy(null);
    setServedModel("");
    setError("");setListenFailure("");
    setProvider(next);
    setModel(providerModels[next] || defaultModels[next]);
  }
  function changeModel(next: string) {
    if (window.electronAPI?.platform === "win32") {
      setResponseTiming(null);
      if (requestKind.current === "speed" && requestId.current) {
        void window.localCopilot?.cancel(requestId.current);
        requestId.current = null; requestKind.current = null; setBusy(null);
      }
    }
    setModel(next);
    setProviderModels((previous) => ({ ...previous, [provider]: next }));
  }
  function clearListen() {
    if(audio.state!=="idle") { clearAfterStop.current=true; audio.stop(); setNotice("Finishing and saving Listen before clearing…");return; }
    const snapshot=freshSession({notes,transcript,requests,listenSessionId:sessionNoteId.current,provider,model,retainHistory});
    setNotes(snapshot.notes); setTranscript([]); setRequests([]); setSelected(null);
    lastCompletedTranscript.current=[]; autoQuestions.current.clear(); setAutoPendingCount(0);
    if(requestKind.current==="listen" && requestId.current) { void window.localCopilot?.cancel(requestId.current); requestId.current=null;requestKind.current=null;setBusy(null); }
    setView("listen"); setNotice("Listen saved and cleared. Capture stopped; press Start for a fresh session.");
  }
  const allChats: SavedChat[] = messages.length
    ? [
        {
          id: chatId.current,
          title: chatHistory.find(c=>c.id===chatId.current)?.title ||
            messages
              .find((message) => message.role === "user")
              ?.text.slice(0, 80) || "Conversation",
          date: new Date().toISOString(),
          messages,
        },
        ...chatHistory.filter((chat) => chat.id !== chatId.current),
      ]
    : chatHistory;
  const newChat = () => {
    if (requestId.current && requestKind.current === "ask") {
      void window.localCopilot?.cancel(requestId.current);
      requestId.current=null; requestKind.current=null; setBusy(null);
    }
    if (messages.length && retainHistory)
      setChatHistory((previous) =>
        [
          {
            id: chatId.current,
            title:
              messages
                .find((message) => message.role === "user")
                ?.text.slice(0, 80) || "Conversation",
            date: new Date().toISOString(),
            messages,
          },
          ...previous.filter((chat) => chat.id !== chatId.current),
        ].slice(0, 100),
      );
    chatId.current = crypto.randomUUID();
    setMessages([]);
    setQuestion("");
    setImage(undefined);
    setLastSentImage(undefined);
    setPreviewImage(undefined);
    setNotice("New chat started");
    askInputRef.current?.focus();
  };
  const importBackup = (value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Invalid backup");
    const data = value as Record<string, unknown>;
    if (
      data.app !== "ryxnontop" ||
      !Array.isArray(data.notes) ||
      data.notes.length > 10000
    )
      throw new Error("Invalid backup");
    const imported = data.notes.map((raw: unknown) => {
      if (!raw || typeof raw !== "object") throw new Error("Invalid note");
      const note = raw as NoteRecord;
      if (
        typeof note.id !== "string" ||
        typeof note.title !== "string" ||
        typeof note.content !== "string" ||
        typeof note.date !== "string"
      )
        throw new Error("Invalid note");
      return {
        id: note.id,
        title: note.title,
        content: note.content,
        date: note.date,
        kind:
          note.kind === "automatic"
            ? ("automatic" as const)
            : ("manual" as const),
        favorite: note.favorite === true,
        archived: note.archived === true,
        folder: typeof note.folder === "string" ? note.folder : "",
        tags: Array.isArray(note.tags)
          ? note.tags.filter((tag) => typeof tag === "string")
          : [],
      };
    });
    setNotes(imported);
    if (Array.isArray(data.folders))
      setFolders(
        data.folders.filter((item): item is string => typeof item === "string"),
      );
    if (typeof data.context === "string") setContext(data.context);
    if (Array.isArray(data.transcript))
      setTranscript(
        data.transcript.filter(
          (item): item is string => typeof item === "string",
        ),
      );
    if (Array.isArray(data.chatHistory))
      setChatHistory(
        data.chatHistory.filter((chat): chat is SavedChat =>
          Boolean(
            chat &&
              typeof chat === "object" &&
              typeof chat.id === "string" &&
              typeof chat.title === "string" &&
              Array.isArray(chat.messages) &&
              chat.messages.every(
                (message: Message) =>
                  typeof message.text === "string" &&
                  (message.role === "user" || message.role === "assistant"),
              ),
          ),
        ),
      );
    const validMessage = (item: unknown): item is Message =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as Message).id === "string" &&
          typeof (item as Message).text === "string" &&
          ["user", "assistant"].includes((item as Message).role),
      );
    if (Array.isArray(data.messages))
      setMessages(data.messages.filter(validMessage));
    if (typeof data.chatId === "string") chatId.current = data.chatId;
    if (typeof data.light === "boolean") setLight(data.light);
    if (typeof data.model === "string" && /^[a-zA-Z0-9._-]+$/.test(data.model))
      setModel(data.model);
    if (typeof data.language === "string") setLanguage(data.language);
    if (data.source === "system" || data.source === "microphone")
      setSource(data.source);
    if (typeof data.style === "string") setStyle(data.style);
    if (typeof data.mode === "string") setMode(data.mode);
    if (typeof data.opacity === "number")
      setOpacity(Math.min(100, Math.max(30, data.opacity)));
    if (typeof data.includeListen === "boolean")
      setIncludeListen(data.includeListen);
    if (typeof data.autoAnswer === "boolean") setAutoAnswer(data.autoAnswer);
    if (typeof data.autoSummary === "boolean") setAutoSummary(data.autoSummary);
    if (typeof data.fastResponses === "boolean")
      setFastResponses(data.fastResponses);
    if (typeof data.instantAnswers === "boolean")
      setInstantAnswers(data.instantAnswers);
    // Keep this device's network, capture, and permission choices.
    setActiveNote(null);
    setNotice("Backup imported");
    logEvent("Local backup imported");
  };
  const wipeData = async (removeKeys: boolean) => {
    saveEpoch.current++;
    lastCompletedTranscript.current = [];
    sessionRunning.current = false;
    audio.stop(true);
    const cancelledId = requestId.current;
    requestId.current = null;
    requestKind.current = null;
    sessionNoteId.current = null;
    setBusy(null);
    if (cancelledId) await window.localCopilot?.cancel(cancelledId);
    if (removeKeys) {
      const empty = {
        geminiKey: "",
        deepgramKey: "",
        openaiKey: "",
        anthropicKey: "",
      };
      if (
        window.localCopilot &&
        !window.localCopilot.saveKeysNow(empty).success
      ) {
        setError("Could not remove saved keys.");
        return;
      }
      lastSavedKeys.current = JSON.stringify(empty);
      setGeminiKey("");
      setDeepgramKey("");
      setOpenaiKey("");
      setAnthropicKey("");
      setKeyStatus("Saved keys removed");
    }
    await window.localCopilot?.clearAudio();
    await window.localCopilot?.clearWorkspace();
    localStorage.removeItem(storageKey);
    latestWorkspace.current = "";
    setNotes([]);
    setFolders([]);
    setMessages([]);
    setChatHistory([]);
    setTranscript([]);
    setRequests([]);
    setContext("");
    setSummaryQueue([]);
    setActivity([]);
    setActiveNote(null);
    setImage(undefined);
    setLastSentImage(undefined);
    setPreviewImage(undefined);
    chatId.current = crypto.randomUUID();
    setNotice("Local content deleted");
  };

  const answerBusy = Boolean(busy && busy !== "notes");
  const currentRequest = requests.find((r) => r.id === selected);
  const status = listenStatus({audio:audio.state,interim:audio.interim,pending:autoPendingCount,generating:busy==="listen",streaming:busy==="listen" && responseTiming?.first!=null,error:Boolean(listenFailure),completed:requests.some(r=>r.status==="answered")});
  async function prepareDesktopUpdate() {
    await saveWindowsUpdateState({
      isActive: () => Boolean(requestId.current) || audio.state !== "idle",
      saveKeys: saveProviderKeys,
      snapshot: () => latestWorkspace.current ? JSON.stringify(freshSession(JSON.parse(latestWorkspace.current))) : "",
      saveWorkspace: snapshot => window.localCopilot?.saveWorkspaceNow?.(snapshot),
    });
  }
  const windowsApiProps: WindowsApiProps = {
    keys: { geminiKey, openaiKey, deepgramKey, anthropicKey },
    onKeys: keys => { setGeminiKey(keys.geminiKey); setOpenaiKey(keys.openaiKey); setDeepgramKey(keys.deepgramKey); setAnthropicKey(keys.anthropicKey); },
    provider, model, language, onProvider: changeProvider, onModel: setModel, save: saveProviderKeys,
  };

  const windowsIntro = introVisible ? <WindowsOpeningIntro light={light} ready={ready && keysLoaded} firstLaunch={!keysGuideCompleted}
    onDone={finishIntro} onQuit={() => { void saveProviderKeys().then(() => window.electronAPI?.windowClose()).catch(error => setError(error.message)); }} /> : null;
  if (!ready || !keysLoaded)
    return (
      <>{windowsIntro}<div className="mist-loading" aria-hidden={windowsIntro ? true : undefined}>
        {error || (!keysLoaded && !introVisible ? (window.electronAPI?.platform === "win32" ? "Loading saved API credentials…" : "Unlocking saved API keys… If macOS asks, enter your password there and choose Always Allow.") : `Opening ${APP_DISPLAY_NAME}…`)}
      </div></>
    );

  return (
    <>{windowsIntro}<div
      inert={windowsIntro ? true : undefined}
      aria-hidden={windowsIntro ? true : undefined}
      className={`mist-app ${desktop ? "desktop" : "browser"} ${light ? "mist-light" : ""} ${!listenVisible && !askVisible && !dialog ? "mist-collapsed" : ""}`}
      style={{ "--panel-alpha": opacity / 100 } as CSSProperties}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("input, textarea, [contenteditable=true]"))
          event.preventDefault();
      }}
      onPointerDownCapture={(event) => {
        if (
          event.button === 2 &&
          !(event.target as HTMLElement).closest(
            "input, textarea, [contenteditable=true]",
          )
        )
          event.preventDefault();
      }}
    >
      <header
        className="mist-topline"
        aria-label={`${APP_DISPLAY_NAME} app toolbar`}
      >
        <div className="mist-brand-lockup">
          <span className="mist-brand-emblem" aria-hidden="true">
            r<span>↗</span>
          </span>
          <div className="mist-brand-copy">
            <h1 className="mist-wordmark">{APP_DISPLAY_NAME}</h1>
            <span className="mist-brand-tagline">Made by Ryan J.</span>
          </div>
        </div>
        <span className="mist-top-hint">
          {desktop ? `${window.electronAPI?.platform === "win32" ? "Ctrl + Shift + H" : "⌘ ⇧ H"} · Hide / show` : "Workspace preview"}
        </span>
        <div
          className="mist-window-buttons"
          role="group"
          aria-label="Window controls"
        >
          <button
            type="button"
            className="mist-window-control"
            aria-label="Minimize window"
            title="Minimize window"
            onClick={() => {
              if (window.electronAPI) void window.electronAPI.windowMinimize();
              else setNotice("Minimize is available in the desktop app.");
            }}
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            className="mist-window-control mist-window-close"
            aria-label="Quit app"
            title="Quit app and stop capture"
            onClick={() => {
              if (window.electronAPI) quitApp();
              else setNotice("Close is available in the desktop app.");
            }}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <header className="mist-hub">
        <div className="mist-grip" />
        <div className="mist-hub-inner">
          <IconButton
            label="Hide window · ⌘⇧H to restore"
            onClick={() => {
              if (window.localCopilot) void window.localCopilot.hide();
              else
                setNotice(
                  "In the desktop app, ⌘⇧H hides and restores the window.",
                );
            }}
          >
            <EyeOff />
          </IconButton>
          <span className="mist-divider" />
          <IconButton
            label="Toggle Listen panel"
            active={listenVisible}
            onClick={() => {
              if (!listenVisible) setView("listen");
              setListenVisible((current) => !current);
            }}
          >
            <Mic />
          </IconButton>
          <IconButton
            label="Toggle Ask"
            active={askVisible}
            onClick={() => setAskVisible((v) => !v)}
          >
            <MessageCircle />
          </IconButton>

          <IconButton
            label="Toggle light appearance"
            active={light}
            onClick={() => setLight((v) => !v)}
          >
            <Sun />
          </IconButton>
          <IconButton label="Settings" onClick={() => setDialog("settings")}>
            <Settings />
          </IconButton>
          <IconButton
            label="Privacy and activity"
            active={offline}
            onClick={() => setDialog("privacy")}
          >
            <Shield />
          </IconButton>
        </div>
      </header>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".txt,.md,.json,.csv"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 200000)
              throw new Error("Choose a text file smaller than 200 KB.");
            const text = await file.text();
            setContext((prev) => `${prev}\n\n${file.name}\n${text}`);
            setNotice(`Added ${file.name} to context`);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not read that file.",
            );
          }
          e.target.value = "";
        }}
      />
      {(listenVisible || askVisible) && (
        <div
          className={`mist-panels ${askVisible ? "" : "ask-hidden"} ${listenVisible ? "" : "listen-hidden"}`}
        >
          {listenVisible && (
            <section
              className="mist-panel mist-listen"
              aria-label="Listen workspace"
            >
              <div className="mist-panel-top">
                <div className="mist-panel-label">
                  <Mic size={16} />
                  <h2>
                    {view === "notes"
                      ? "Notes"
                      : view === "history"
                        ? "Requests"
                        : view === "sessions"
                          ? "Session history"
                          : "Listen"}
                  </h2>
                  <button className="mist-soft-button" onClick={clearListen} title="Save this session and clear Listen; active capture will stop" aria-label="Clear Listen"><Trash2 size={14}/></button>
                  <span
                    className={`mist-status ${audio.state === "live" ? "live" : ""}`}
                  >
                    <i />
                    {status}
                  </span>
                </div>
                <div className="mist-panel-meta">
                  <div className="ryx-quick-language">
                    <Languages size={14} />
                    <SpokenLanguageMenu
                      value={language}
                      label="Change spoken language"
                      onChange={changeSpokenLanguage}
                    />
                  </div>
                  <span className="mist-meta-separator" />
                  Local workspace
                </div>
              </div>
              <div className="mist-listen-body">
                <aside className="mist-rail" aria-label="Workspace navigation">
                  <IconButton
                    label="Live transcript"
                    active={view === "listen"}
                    onClick={() => setView("listen")}
                  >
                    <AudioLines />
                  </IconButton>
                  <IconButton
                    label="Requests"
                    active={view === "history"}
                    onClick={() => {
                      setListenVisible(true);
                      setView("history");
                    }}
                  >
                    <ListChecks />
                  </IconButton>
                  <IconButton
                    label="Notes"
                    active={view === "notes"}
                    onClick={() => {
                      setView("notes");
                    }}
                  >
                    <FileText />
                  </IconButton>
                  <IconButton
                    label="Add context"
                    onClick={() => setDialog("context")}
                  >
                    <Link2 />
                  </IconButton>
                  <IconButton
                    label="Session history"
                    active={view === "sessions"}
                    onClick={() => {
                      setView("sessions");

                      setActiveNote(null);
                    }}
                  >
                    <History />
                  </IconButton>
                  <IconButton
                    label="Language settings"
                    onClick={() => setDialog("language")}
                  >
                    <Languages />
                  </IconButton>
                </aside>
                {view === "notes" || view === "sessions" ? (
                  <NotesLibrary
                    notes={notes}
                    onChange={setNotes}
                    folders={folders}
                    onFolders={setFolders}
                    activeId={activeNote}
                    onSelect={setActiveNote}
                    onCreate={() => addNote()}
                    initialFilter={view === "sessions" ? "automatic" : "all"}
                    onAI={runNoteAI}
                    aiBusy={busy === "notes"}
                    offline={offline}
                    onNotice={setNotice}
                    onError={setError}
                  />
                ) : (
                  <div
                    className={`mist-listen-columns ${view === "history" ? "mist-requests-view" : ""}`}
                  >
                    <div className="mist-transcript">
                      {view === "history" ? (
                        <div className="ryx-selected-request">
                          {currentRequest ? (
                            <>
                              <span className="ryx-question-label">
                                Question
                              </span>
                              <h3>{currentRequest.title}</h3>
                              <SafeMarkdown>
                                {currentRequest.answer ||
                                  (currentRequest.status === "pending"
                                    ? "Responding…"
                                    : "Select Answer to try again.")}
                              </SafeMarkdown>
                              {currentRequest.status === "failed" && (
                                <div
                                  role="alert"
                                  className="ryx-permission-error"
                                >
                                  {currentRequest.error ||
                                    "This answer failed."}
                                  <button
                                    className="mist-soft-button"
                                    disabled={answerBusy}
                                    onClick={() =>
                                      void reply(
                                        "listen",
                                        `Answer this question using the conversation context: ${currentRequest.title}`,
                                      )
                                    }
                                  >
                                    Retry this question
                                  </button>
                                </div>
                              )}
                              {currentRequest.answer && (
                                <button
                                  className="mist-soft-button"
                                  onClick={() =>
                                    addNote(
                                      currentRequest.answer,
                                      currentRequest.title,
                                    )
                                  }
                                >
                                  <FileText size={13} />
                                  Save note
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="mist-empty">
                              <ListChecks />
                              <h2>Select a question</h2>
                              <p>
                                Choose a request to keep its answer in view.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : transcript.length || audio.interim ? (
                        <>
                          <div className="mist-section-title">
                            <h2>Live transcript</h2>
                            <IconButton
                              label="Save transcript as note"
                              onClick={() =>
                                addNote(
                                  transcript.join("\n\n"),
                                  "Session transcript",
                                )
                              }
                            >
                              <FileText />
                            </IconButton>
                          </div>
                          <div className="mist-transcript-lines">
                            {transcript.map((text, i) => (
                              <p key={i}>
                                <span>{String(i + 1).padStart(2, "0")}</span>
                                {text}
                              </p>
                            ))}
                            {audio.interim && (
                              <p className="interim">{audio.interim}</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="mist-empty">
                          <div className="mist-empty-mark">
                            <AudioLines />
                          </div>
                          <h2>Ready when you are</h2>
                          <p>Choose a mode, then press Start.</p>
                          <button
                            className="mist-soft-button"
                            onClick={() => setDialog("context")}
                          >
                            <Link2 size={14} />
                            Add context
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mist-requests">
                      <div className="mist-section-title">
                        <h2>
                          Requests <small>{requests.length || ""}</small>
                        </h2>
                        {requests.length > 0 && (
                          <button
                            className="mist-text-button"
                            onClick={() => {
                              if (!busy) {
                                setRequests([]);
                                setSelected(null);
                              }
                            }}
                            disabled={Boolean(busy && busy !== "notes")}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {!requests.length ? (
                        <p className="mist-muted">
                          {view === "history"
                            ? "Generated answers appear here. Start Listen or load a transcript, then press Answer."
                            : "Select a request to keep its answer in view."}
                        </p>
                      ) : (
                        <>
                          <div className="mist-request-tabs">
                            {requests.map((r, i) => (
                              <button
                                key={r.id}
                                className={selected === r.id ? "selected" : ""}
                                onClick={() => setSelected(r.id)}
                              >
                                <span className="ryx-request-title">
                                  {r.title}
                                  <small>
                                    {r.status === "pending"
                                      ? "Responding…"
                                      : r.status === "failed"
                                        ? "Try again"
                                        : "Answered"}
                                  </small>
                                </span>
                                <span>
                                  {String(requests.length - i).padStart(2, "0")}
                                </span>
                              </button>
                            ))}
                          </div>
                          {currentRequest && view !== "history" && (
                            <div className="mist-answer">
                              <SafeMarkdown>
                                {currentRequest.answer ||
                                  (busy
                                    ? "Thinking…"
                                    : "No response. Try again.")}
                              </SafeMarkdown>
                              {currentRequest.status === "failed" && (
                                <div
                                  role="alert"
                                  className="ryx-permission-error"
                                >
                                  {currentRequest.error ||
                                    "This answer failed."}
                                  <button
                                    className="mist-soft-button"
                                    disabled={answerBusy}
                                    onClick={() =>
                                      void reply(
                                        "listen",
                                        `Answer this question using the conversation context: ${currentRequest.title}`,
                                      )
                                    }
                                  >
                                    Retry this question
                                  </button>
                                </div>
                              )}
                              {currentRequest.answer && (
                                <button
                                  className="mist-soft-button"
                                  onClick={() =>
                                    addNote(
                                      currentRequest.answer,
                                      currentRequest.title,
                                    )
                                  }
                                >
                                  <FileText size={14} />
                                  Save note
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <footer className="mist-listen-footer">
                <button
                  className={`mist-start ${audio.state !== "idle" ? "recording" : ""}`}
                  onClick={toggleListen}
                >
                  {audio.state === "idle" ? (
                    <Play size={13} />
                  ) : (
                    <Square size={12} />
                  )}
                  {audio.state === "idle"
                    ? "Start"
                    : audio.state === "connecting"
                      ? "Cancel"
                      : "Stop"}
                </button>
                {audio.state !== "idle" && (
                  <>
                    <span className="ryx-session-time">
                      <Timer size={12} />
                      {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                      {String(elapsed % 60).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      aria-label={
                        audio.state === "paused"
                          ? "Resume Listen"
                          : "Pause Listen"
                      }
                      disabled={
                        audio.state !== "live" && audio.state !== "paused"
                      }
                      onClick={audio.pause}
                    >
                      {audio.state === "paused" ? (
                        <Play size={13} />
                      ) : (
                        <Pause size={13} />
                      )}
                    </button>
                  </>
                )}
                <label>
                  Mode{" "}
                  <SelectMenu
                    label="Session mode"
                    value={mode}
                    options={["Interview", "Meeting"]}
                    onChange={setMode}
                  />
                </label>
                <button onClick={() => setDialog("context")}>
                  Add context{context && <i className="mist-context-dot" />}
                </button>
                <label className="ryx-answer-style">
                  <span>Answer style</span>{" "}
                  <SelectMenu
                    label="Response style"
                    value={style}
                    options={["Concise", "Detailed", "Bullet points"]}
                    onChange={setStyle}
                  />
                </label>
                <button
                  onClick={() =>
                    void reply(
                      "listen",
                      "Answer the most recent question in the transcript.",
                    )
                  }
                  disabled={Boolean(busy && busy !== "notes")}
                >
                  Answer <span>⌘↵</span>
                </button>
                <button
                  onClick={() => void testAudio()}
                  disabled={audio.state !== "idle"}
                >
                  {testing ? "Stop test" : "Test audio"}
                </button>
                {testing && (
                  <meter
                    aria-label="Audio level"
                    min={0}
                    max={100}
                    value={level}
                  />
                )}
              </footer>
            </section>
          )}
          {askVisible && (
            <section className="mist-panel mist-ask" aria-label="Ask workspace">
              <div className="mist-panel-top">
                <div className="mist-panel-label">
                  <MessageCircle size={16} />
                  <h2>Ask</h2>
                  <span className="mist-status">
                    <i />
                    {busy === "ask" ? "Thinking…" : "Ready"}
                  </span>
                </div>
                <div className="mist-top-actions">
                  <IconButton
                    label="Chat history"
                    onClick={() => setDialog("chats")}
                  >
                    <History />
                  </IconButton>
                  <button
                    type="button"
                    className="mist-new-chat"
                    title="Save this conversation to history and clear Ask"
                    aria-label="Clear Chat"
                    onClick={newChat}
                  >
                    <Plus size={15} />
                    <span>Clear Chat</span>
                  </button>
                </div>
              </div>
              <div className="mist-chat" ref={scrollRef}>
                {!messages.length ? (
                  <div className="mist-empty">
                    <div className="mist-empty-mark">
                      <MessageCircle />
                    </div>
                    <h2>What can I help you with?</h2>
                    <p>
                      Ask a question, explore an idea, or use your current
                      Listen context.
                    </p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <article className={`mist-message ${m.role}`} key={m.id}>
                      <span>
                        {m.role === "user" ? "You" : APP_DISPLAY_NAME}
                      </span>
                      <SafeMarkdown>
                        {m.text ||
                          (busy
                            ? "Thinking…"
                            : "Response unavailable. Please retry.")}
                      </SafeMarkdown>
                      {m.role === "assistant" && m.text && (
                        <div className="mist-message-actions">
                          <IconButton
                            label="Save answer as note"
                            onClick={() => addNote(m.text, "Ask answer")}
                          >
                            <FileText />
                          </IconButton>
                          <IconButton
                            label="Copy answer"
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(m.text)
                                .then(() => setNotice("Answer copied"))
                                .catch(() =>
                                  setError("Clipboard access unavailable."),
                                )
                            }
                          >
                            <Copy />
                          </IconButton>
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
              <div className="mist-composer-area">
                {image && (
                  <div className="mist-attachment">
                    <Camera size={14} />
                    <button
                      className="ryx-attached-preview"
                      onClick={() => {
                        setPreviewImage(image);
                        setDialog("image");
                      }}
                    >
                      <Image
                        src={image}
                        width={84}
                        height={48}
                        unoptimized
                        alt="Screenshot to send"
                      />{" "}
                      Preview attached screenshot
                    </button>
                    <button
                      aria-label="Remove screenshot"
                      onClick={() => setImage(undefined)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                {!image && lastSentImage && (
                  <button
                    className="mist-soft-button"
                    onClick={() => {
                      setPreviewImage(lastSentImage);
                      setDialog("image");
                    }}
                  >
                    View last screenshot sent
                  </button>
                )}
                <form
                  className="mist-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void reply("ask");
                  }}
                >
                  <input
                    ref={askInputRef}
                    aria-label="Ask anything"
                    disabled={offline || !askEnabled}
                    placeholder={
                      offline
                        ? "Offline · notes only"
                        : !askEnabled
                          ? "Ask is disabled in Privacy"
                          : "Ask anything…"
                    }
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  <button
                    type={answerBusy ? "button" : "submit"}
                    aria-label={answerBusy ? "Stop answer" : "Send question"}
                    disabled={
                      !answerBusy &&
                      (offline ||
                        !askEnabled ||
                        (!question.trim() && !image && !screenContext))
                    }
                    onClick={
                      answerBusy
                        ? () => {
                            const cancelled=requestId.current;
                            if(cancelled) void window.localCopilot?.cancel(cancelled);
                            requestId.current=null;requestKind.current=null;setBusy(null);
                            setRequests(previous=>previous.map(r=>r.id===cancelled?{...r,status:"cancelled"}:r));
                          }
                        : undefined
                    }
                  >
                    {answerBusy ? <Square size={16} /> : <ArrowUp size={19} />}
                  </button>
                </form>
                {screenContext && <div className="ryx-live-preview" role="status">
                  {liveScreen && <button onClick={()=>{setPreviewImage(liveScreen.image);setDialog("image");}} aria-label="Open live screen preview"><Image src={liveScreen.image} width={120} height={75} alt="Current local screen preview" unoptimized /></button>}
                  <span>{!desktop ? "Preview available in the desktop app" : livePreview.failure || (liveScreen ? "Live preview · local only" : "Checking screen access…")}<small>Fresh screenshot sent to {providerLabels[provider]} only when you ask.</small></span>
                </div>}
                <div className="mist-composer-tools">
                  <IconButton
                    label="Use Listen context in Ask"
                    active={includeListen}
                    onClick={() => setIncludeListen((value) => !value)}
                  >
                    <Ear />
                  </IconButton>
                  <button
                    className="mist-model"
                    onClick={() => setDialog("settings")}
                  >
                    ◒{" "}
                    {provider === "gemini"
                      ? "Gemini"
                      : provider === "openai"
                        ? "OpenAI"
                        : "Claude"}{" "}
                    {fastResponses ? "· Fast" : ""} <ChevronDown size={11} />
                  </button>
                  <button
                    type="button"
                    className="mist-soft-button ryx-screen-source"
                    onClick={() => void chooseScreen()}
                  >
                    <Monitor size={13} />
                    {screenName}
                  </button>
                  <IconButton
                    label="Capture and attach one screenshot"
                    onClick={() => {
                      setScreenContext(false);
                      void capture();
                    }}
                  >
                    <Camera />
                  </IconButton>
                  <IconButton
                    label={
                      screenContext
                        ? "Screen on: attach a fresh screenshot with each Ask"
                        : "Screen off: no automatic screenshot"
                    }
                    active={screenContext}
                    disabled={!visionEnabled || offline}
                    onClick={() => {
                      if (screenContext) {
                        setScreenContext(false);
                        setImage(undefined);
                      } else {
                        setScreenContext(true);
                        void capture();
                      }
                    }}
                  >
                    <Eye />
                  </IconButton>
                  <button
                    className={`mist-soft-button ${screenContext ? "ryx-screen-active" : ""}`}
                    disabled={!visionEnabled || offline}
                    onClick={() => {
                      if (screenContext) {
                        setScreenContext(false);
                        setImage(undefined);
                      } else {
                        setScreenContext(true);
                        void capture();
                      }
                    }}
                  >
                    Screen {screenContext ? "on" : "off"}
                  </button>
                  <span>
                    {includeListen ? "Listen context on" : "Listen context off"}
                    {screenContext ? " · fresh screen on send" : ""}
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
      {(listenVisible || askVisible) && (
        <div className="mist-bottomline">
          <span>
            <i />
            {servedModel ? `Confirmed: ${servedModel}` : `Model: ${model}`} ·{" "}
            {fastResponses ? "Fast" : "Standard"}
          </span>
          <div>
            <button
              onClick={() =>
                void reply(
                  "listen",
                  "Summarize the session and list action items.",
                )
              }
              disabled={Boolean(busy) || !transcript.length}
            >
              Summarize session
            </button>
            <IconButton
              label="Toggle always on top"
              active={pinned}
              onClick={async () => {
                if (!window.electronAPI) {
                  setNotice("Always on top is available in the desktop app.");
                  return;
                }
                try {
                  setPinned(
                    await window.electronAPI.windowAlwaysOnTop(!pinned),
                  );
                } catch {
                  setError("Could not change always-on-top mode.");
                }
              }}
            >
              <Pin />
            </IconButton>
            <button
              disabled={Boolean(busy) || offline}
              onClick={() => void testAiSpeed()}
              title="Times one generic AI question without your transcript or screenshots"
            >
              Test AI speed
            </button>
            <button
              disabled={Boolean(busy) || offline}
              onClick={() => void testAiSpeed(true)}
              title="Sends a generated sample image, not your desktop"
            >
              Test vision
            </button>
            {autoPendingCount > 0 && (
              <span role="status">{autoPendingCount} questions queued</span>
            )}
            {showPerformance && responseTiming && (
              <span className="ryx-response-timing" role="status">
                {responseTiming.first === null
                  ? "Waiting for AI…"
                  : `First text ${(responseTiming.first / 1000).toFixed(1)}s`}
                {responseTiming.total === null
                  ? ""
                  : ` · total ${(responseTiming.total / 1000).toFixed(1)}s`}
              </span>
            )}
            <button onClick={() => setDialog("privacy")}>
              {offline ? <WifiOff size={13} /> : <Shield size={13} />}<span>Privacy</span>
            </button>
            <button
              onClick={()=>{setPermissionDiagnostic("");setDialog("permissions");}}
            >
              Permissions
            </button>
          </div>
        </div>
      )}
      {(error || notice) && (
        <div
          className={`mist-toast ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          {error.startsWith("Access required:") && desktop && (
            <button
              onClick={() => {
                if (/Microphone/i.test(error))
                  void window.localCopilot?.permission("microphone");
                else void window.electronAPI?.screen.openSettings();
              }}
            >
              Open Settings
            </button>
          )}
          {error.startsWith("Access required:") && desktop && (
            <button onClick={() => void window.electronAPI?.appRelaunch()}>
              Restart app
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {desktop && keysLoaded && <DesktopUpdates compact save={prepareDesktopUpdate} active={Boolean(busy) || audio.state !== "idle"} suspended={introVisible || Boolean(dialog)} />}
      {dialog && (
        <div
          className="mist-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <section
            className="mist-dialog"
            data-panel={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mist-dialog-title"
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const focusable = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input, select, textarea, a[href]",
                ),
              );
              const first = focusable[0],
                last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }}
          >
            <button
              className="mist-dialog-close"
              aria-label="Close dialog"
              autoFocus
              type="button"
              title="Close settings or dialog"
              onClick={closeDialog}
            >
              <X size={19} />
            </button>
            {dialog === "permissions" && window.electronAPI?.platform === "win32" ? (
              <WindowsCapturePanel />
            ) : dialog === "permissions" ? (
              <><h1 id="mist-dialog-title">Capture permissions</h1><p>{window.electronAPI?.platform === "win32" ? "Windows captures the selected screen locally. For microphone input, allow desktop apps to access your microphone in Windows Settings." : "macOS grants access to the signed app at /Applications/ryxnontop.app. Old builds can leave a stale entry even when its switch is enabled."}</p>
              <button className="mist-primary" onClick={async()=>{setPermissionDiagnostic("Checking actual capture…");try{const status=await window.electronAPI?.screen.getAccess();if(status!=="granted")await window.electronAPI?.screen.triggerPrompt();const snapshot=await window.electronAPI?.screen.capture(undefined,true);setPermissionDiagnostic(snapshot?.success?"Screen capture works. Test image stayed on this device.":"Screen capture failed. Open System Settings and enable ryxnontop. If already enabled, quit and reopen once. For a stale record, remove its entry with − and re-add /Applications/ryxnontop.app with +, then enable it.");}catch{setPermissionDiagnostic("Capture unavailable. Open System Settings to restore access.");}}}>Validate screen capture</button>
              <button className="mist-soft-button" onClick={()=>void window.electronAPI?.screen.openSettings()}>{window.electronAPI?.platform === "win32" ? "Open sound settings" : "Open Screen & System Audio Recording"}</button>
              <button className="mist-soft-button" onClick={()=>void window.localCopilot?.permission("microphone")}>Enable microphone</button>
              <p role="status">{permissionDiagnostic}</p><p>Permission changes are controlled by your operating system. This app never resets or bypasses its privacy settings.</p></>
            ) : dialog === "language" ? (
              <>
                <h1 id="mist-dialog-title">Spoken language</h1>
                <p>
                  Choose the language Listen recognizes. Active capture will
                  restart with the new language and save the previous session.
                </p>
                <SpokenLanguageMenu
                  value={language}
                  onChange={(value) => {
                    changeSpokenLanguage(value);
                    setDialog(null);
                  }}
                />
                <button
                  className="mist-primary"
                  onClick={() => setDialog(null)}
                >
                  Done
                </button>
              </>
            ) : dialog === "keys-guide" && Boolean(window.electronAPI) ? (
              <WindowsApiSetup {...windowsApiProps} resume={!keysGuideCompleted} onFinish={() => { setKeysGuideCompleted(true); setDialog(null); setNotice("API setup saved securely on this device."); }} />
            ) : dialog === "keys-guide" ? (
              <div className="ryx-keys-guide">
                <h1 id="mist-dialog-title">Connect your API keys.</h1>
                <p>
                  Open the toolbar gear → Settings. Choose the AI provider you
                  want for answers, then add its key and a Deepgram key for
                  Listen.
                </p>
                <ol>
                  <li>
                    <h2>Get an answer-provider key</h2>
                    <p>
                      Choose one provider. You do not need keys for all three.
                    </p>
                    <p>
                      <a
                        href="https://aistudio.google.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Google AI Studio: create Gemini key ↗
                      </a>
                    </p>
                    <p>
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                      >
                        OpenAI: create API key ↗
                      </a>
                    </p>
                    <p>
                      <a
                        href="https://platform.claude.com/settings/keys"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Claude Console: create API key ↗
                      </a>
                    </p>
                  </li>
                  <li>
                    <h2>Get a Deepgram key for voice</h2>
                    <p>
                      Open{" "}
                      <a
                        href="https://console.deepgram.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Deepgram Console ↗
                      </a>
                      , choose API Keys, and create a key.
                    </p>
                  </li>
                  <li>
                    <h2>Paste and save</h2>
                    <p>
                      In Settings → AI & keys, select your provider/model and paste its key. Add your Deepgram key in the Listen tab, then press Done. Check for “Keys saved
                      securely on this device.” Keys are encrypted and restored
                      when you reopen the app.
                    </p>
                    <p>
                      Provider API usage has its own account limits/billing. A
                      ChatGPT or Claude chat subscription is separate from API
                      access.
                    </p>
                  </li>
                </ol>
                <button
                  className="mist-primary"
                  onClick={() => {
                    setKeysGuideCompleted(true);
                    setDialog("settings");
                  }}
                >
                  Open API key settings
                </button>
                <button
                  className="mist-soft-button"
                  onClick={() => {
                    setKeysGuideCompleted(true);
                    setDialog(null);
                  }}
                >
                  I’ll do this later
                </button>
              </div>
            ) : dialog === "settings" ? (
              <SettingsPanel onUpdateSave={prepareDesktopUpdate} windowsApi={windowsApiProps} provider={provider} model={model} providerKey={providerKey} deepgramKey={deepgramKey} keysLoaded={keysLoaded} keyStatus={keyStatus}
               onProvider={changeProvider} onModel={changeModel} onProviderKey={provider==="gemini"?setGeminiKey:provider==="openai"?setOpenaiKey:setAnthropicKey} onDeepgramKey={setDeepgramKey}
               source={source} onSource={setSource} languageControl={<SpokenLanguageMenu value={language} onChange={setLanguage}/>}
               restartControl={audio.state!=="idle" && activeAudioSettings && (source!==activeAudioSettings.source||language!==activeAudioSettings.language) ? <button className="mist-soft-button" onClick={async()=>{try{await saveProviderKeys();restartCapture.current=true;if(requestId.current)void window.localCopilot?.cancel(requestId.current);audio.stop();setDialog(null);setNotice("Saving and restarting Listen with selected settings");}catch(error){setError(error instanceof Error?error.message:"Could not save settings.");}}}>Apply and restart Listen</button>:null}
               fast={fastResponses} onFast={setFastResponses} autoAnswer={autoAnswer} onAutoAnswer={setAutoAnswer} autoSummary={autoSummary} onAutoSummary={setAutoSummary}
               opacity={opacity} onOpacity={setOpacity} light={light} onLight={setLight} retainHistory={retainHistory} onRetainHistory={setRetainHistory} showPerformance={showPerformance} onShowPerformance={setShowPerformance}
               performance={responseStages ? <p className="ryx-settings-caption">Capture {responseStages.capture.toFixed(0)} ms · preparation {responseStages.context.toFixed(0)} ms · API first text {responseStages.apiFirst?.toFixed(0)??"pending"} ms. Speech-end timing uses server endpoint receipt.</p>:null}
               onReplay={()=>{setDialog(null);setIntroVisible(true);}} onTutorial={()=>setDialog("keys-guide")} onTest={()=>void testAiSpeed()}
               testDisabled={Boolean(busy)||offline||!providerKey} testStatus={busy?"Testing or generating…":responseTiming?.total?`${window.electronAPI?.platform === "win32" ? "Connection successful · " : ""}${servedModel||model}: first text ${((responseTiming.first??responseTiming.total)/1000).toFixed(2)}s · total ${(responseTiming.total/1000).toFixed(2)}s`:""} error={captureErrorMessage(error)} active={Boolean(busy) || audio.state !== "idle"} windows={window.electronAPI?.platform==="win32"}
               onDone={()=>void saveProviderKeys().then(()=>{setDialog(null);setNotice("Settings saved");}).catch(error=>setError(error.message))}/>
            ) : dialog === "privacy" ? (
              <PrivacyPanel
                offline={offline}
                onOffline={setOffline}
                askEnabled={askEnabled}
                onAsk={setAskEnabled}
                visionEnabled={visionEnabled}
                onVision={setVisionEnabled}
                retainAudio={retainAudio}
                onRetainAudio={setRetainAudio}
                listenMode={
                  !autoAnswer
                    ? "Silent notes"
                    : instantAnswers
                      ? "Instant answers"
                      : "Live suggestions"
                }
                onListenMode={(value) => {
                  setAutoAnswer(value !== "Silent notes");
                  setInstantAnswers(value === "Instant answers");
                }}
                log={activity}
                onClearLog={() => setActivity([])}
                onExport={() => ({
                  app: "ryxnontop",
                  version: 1,
                  ...JSON.parse(latestWorkspace.current || "{}"),
                })}
                onImport={importBackup}
                onWipe={wipeData}
                onError={setError}
              />
            ) : dialog === "image" ? (
              <>
                <h1 id="mist-dialog-title">Screenshot preview</h1>
                <p>
                  Preview stays local. A fresh screenshot is sent only with your Ask request when Screen is on.
                </p>
                {(screenContext ? liveScreen?.image : previewImage) && (
                  <Image
                    src={(screenContext ? liveScreen?.image : previewImage)!}
                    width={2560}
                    height={1600}
                    unoptimized
                    alt="Screenshot preview"
                    className="ryx-full-image"
                  />
                )}
              </>
            ) : dialog === "screens" ? (
              <>
                <div className="mist-dialog-heading">
                  <Monitor />
                  <h1 id="mist-dialog-title">Choose a screen.</h1>
                  <p>Screenshots stay local until you send an Ask request.</p>
                </div>
                <div className="ryx-screen-grid">
                  {screens.map((screen) => (
                    <button
                      key={screen.id}
                      onClick={() => {
                        setScreenSource(screen.id);
                        setScreenName(screen.name);
                        setDialog(null);
                        setNotice(`Selected ${screen.name}`);
                      }}
                    >
                      <Image
                        src={screen.thumbnail}
                        width={300}
                        height={180}
                        unoptimized
                        alt={`${screen.name} preview`}
                      />
                      <span>{screen.name}</span>
                    </button>
                  ))}
                </div>
                {!screens.length && (
                  <p>
                    No screens available. Enable Screen Recording permission and
                    try again.
                  </p>
                )}
              </>
            ) : dialog === "chats" ? (
              <>
                <div className="mist-dialog-heading">
                  <History />
                  <h1 id="mist-dialog-title">Ask history</h1>
                  <p>Conversations saved on this device.</p>
                </div>
                <div className="ryx-chat-history">
                  <input aria-label="Search Ask history" placeholder="Search conversations…" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/>
                  <button className="mist-soft-button" onClick={()=>setHistoryConfirm("all")}>Clear all Ask history</button>
                  {historyConfirm && <div role="alert"><p>Permanently delete {historyConfirm==="all"?"all saved Ask conversations":"this saved conversation"}?</p><button onClick={()=>{setChatHistory(previous=>historyConfirm==="all"?[]:previous.filter(c=>c.id!==historyConfirm));if(historyConfirm==="all"||historyConfirm===chatId.current){setMessages([]);chatId.current=crypto.randomUUID();}setHistoryConfirm(null);}}>Delete permanently</button><button onClick={()=>setHistoryConfirm(null)}>Cancel</button></div>}
                  {allChats.filter(chat=>(chat.title+chat.messages.map(m=>m.text).join(" ")).toLowerCase().includes(historySearch.toLowerCase())).map((chat) => (
                    <div key={chat.id} className="ryx-history-row">
                    <input aria-label="Session title" value={chat.title} onChange={e=>setChatHistory(previous=>[{...chat,title:e.target.value},...previous.filter(c=>c.id!==chat.id)])}/>
                    <button className="mist-soft-button" aria-label={`Delete ${chat.title}`} onClick={()=>setHistoryConfirm(chat.id)}><Trash2 size={14}/></button>
                    <button
                      key={chat.id}
                      onClick={() => {
                        if (messages.length)
                          setChatHistory((previous) => [
                            {
                              id: chatId.current,
                              title:
                                messages
                                  .find((message) => message.role === "user")
                                  ?.text.slice(0, 80) || "Conversation",
                              date: new Date().toISOString(),
                              messages,
                            },
                            ...previous.filter(
                              (item) => item.id !== chatId.current,
                            ),
                          ]);
                        chatId.current = chat.id;
                        setMessages(chat.messages);
                        setAskVisible(true);
                        setDialog(null);
                      }}
                    >
                      <MessageCircle size={16} />
                      <span>
                        <strong>{chat.title}</strong>
                        <small>
                          {new Date(chat.date).toLocaleString()} ·{" "}
                          {chat.messages.length} messages
                        </small>
                      </span>
                    </button>
                    </div>
                  ))}
                  {!allChats.length && (
                    <p>
                      No conversations yet. Start an Ask conversation to save it
                      here.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mist-dialog-heading">
                  <Link2 />
                  <h1 id="mist-dialog-title">
                    A little context goes a long way.
                  </h1>
                  <p>
                    Add your background, job description, or meeting agenda.
                  </p>
                </div>
                <textarea
                  className="mist-context-editor"
                  aria-label="Session context"
                  placeholder="Tell the assistant what it should know…"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  maxLength={100000}
                />
                <div className="mist-context-actions">
                  <button
                    className="mist-soft-button"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip size={14} />
                    Attach text / Markdown
                  </button>
                  <button
                    className="mist-soft-button"
                    disabled={!context.trim() || audio.state !== "idle"}
                    onClick={() => {
                      setTranscript(context.split(/\n+/).filter(Boolean));
                      lastAutoAnswer.current = 0;
                      setView("listen");
                      setDialog(null);
                      setNotice("Transcript loaded. Press Answer to use it.");
                    }}
                  >
                    Use as transcript
                  </button>
                  <span>{context.length.toLocaleString()} characters</span>
                </div>
                <button
                  className="mist-primary"
                  onClick={() => {
                    setDialog(null);
                    setNotice("Context saved on this device");
                  }}
                >
                  Save context <Check size={16} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
      <ControlTooltips />
    </div></>
  );
}
