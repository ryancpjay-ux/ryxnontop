import { validateWindowsKey } from "../electron/windowsKeys.js";
export type AudioState =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "live"
  | "paused"
  | "stopping";
type Callbacks = {
  state: (state: AudioState) => void;
  text: (text: string, final: boolean) => void;
  error: (message: string) => void;
  recording?: (blob: Blob) => void;
  utterance?: () => void;
};
type Platform = {
  os?: string;
  mediaDevices: MediaDevices;
  Socket: typeof WebSocket;
  Recorder: typeof MediaRecorder;
  prepare?: (source: string) => Promise<void>;
};

/** getDisplayMedia forbids min/max/exact constraints before permission is shown. */
export async function acquireAudioStream(
  devices: MediaDevices,
  source: string,
  prepare?: (source: string) => Promise<void>,
): Promise<MediaStream> {
  try {
    if (prepare) await prepare(source);
    const stream =
      source === "microphone"
        ? await devices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          })
        : await devices.getDisplayMedia({
            video: { frameRate: 1 },
            audio: true,
          });
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        "Access required: No audio track was provided. Enable screen/system-audio access in System Settings, or choose Microphone in Settings.",
      );
    }
    return stream;
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error ? error.name : "";
    if (
      name === "NotAllowedError" ||
      name === "SecurityError" ||
      name === "NotReadableError"
    )
      throw new Error(
        `Access required: ${source === "microphone" ? "Microphone" : "Screen/system-audio"} access was denied or unavailable. ${typeof window !== "undefined" && window.electronAPI?.platform === "win32" ? "Enable desktop microphone access or check your sound device in Windows Settings." : "Enable it for ryxnontop in System Settings → Privacy & Security."} Then return to the app.`,
      );
    throw error;
  }
}

/** One media stream per session; reconnect only replaces the transcription socket. */
export class LocalAudioSession {
  private callbacks: Callbacks;
  private platform: Platform;
  private generation = 0;
  private stream?: MediaStream;
  private audioStream?: MediaStream;
  private socket?: WebSocket;
  private recorder?: MediaRecorder;
  private localRecorder?: MediaRecorder;
  private cancelConnect?: () => void;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stopTimer?: ReturnType<typeof setTimeout>;
  private keepAlive?: ReturnType<typeof setInterval>;
  private key = "";
  private language = "multi";
  private retries = 0;
  private paused = false;
  private stopping = false;
  private retainAudio = false;
  constructor(callbacks: Callbacks, platform?: Platform) {
    this.callbacks = callbacks;
    this.platform = platform ?? {
      os: window.electronAPI?.platform,
      mediaDevices: navigator.mediaDevices,
      Socket: window.electronAPI?.platform === "win32" ? WindowsTranscriptionSocket as unknown as typeof WebSocket : WebSocket,
      Recorder: MediaRecorder,
      prepare: (source) =>
        window.localCopilot?.prepareAudio(source) ?? Promise.resolve(),
    };
  }
  update(callbacks: Callbacks) {
    this.callbacks = callbacks;
  }
  async start(
    key: string,
    source: string,
    language: string,
    retainAudio = false,
  ) {
    if (!key.trim()) {
      this.callbacks.error(
        "Add your Deepgram key in Settings before starting Listen.",
      );
      return;
    }
    this.dispose();
    const generation = this.generation;
    this.key = key.trim();
    if (this.platform.os === "win32" && this.key !== "__RYX_WINDOWS_SAVED_KEY__") {
      try { this.key = validateWindowsKey(key, "deepgram"); }
      catch (error) { this.callbacks.error((error as Error).message); return; }
    }
    this.language = language;
    this.retries = 0;
    this.paused = false;
    this.stopping = false;
    this.retainAudio = retainAudio;
    this.callbacks.state("connecting");
    try {
      const stream = await acquireAudioStream(
        this.platform.mediaDevices,
        source,
        this.platform.prepare,
      );
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      if (!stream.getAudioTracks().length)
        throw new Error(
          "No audio track was provided. Enable system audio access or select Microphone.",
        );
      this.audioStream = new MediaStream(stream.getAudioTracks());
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => this.stop(true);
      });
      await this.connect(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop(true);
      this.callbacks.error(
        error instanceof Error ? error.message : "Could not start audio.",
      );
    }
  }
  private async connect(generation: number) {
    const parameters = new URLSearchParams({
      model: "nova-3",
      language: this.language,
      smart_format: "true",
      no_delay: "true",
      interim_results: "true",
      endpointing: "200",
      utterance_end_ms: "1000",
      vad_events: "true",
    });
    const Socket = this.platform.Socket;
    const socket = new Socket(
      `wss://api.deepgram.com/v1/listen?${parameters}`,
      this.platform.os === "win32" ? undefined : ["token", this.key],
    );
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Transcription connection timed out.")),
        10000,
      );
      this.cancelConnect = () => {
        clearTimeout(timeout);
        reject(new Error("Audio connection cancelled."));
      };
      socket.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(
          new Error(
            (socket as WebSocket & {errorMessage?: string}).errorMessage || "Could not connect to Deepgram. Check your key and network.",
          ),
        );
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        reject(
          new Error(
            "Deepgram closed the connection. Check your key and quota.",
          ),
        );
      };
    });
    this.cancelConnect = undefined;
    if (generation !== this.generation || this.stopping) {
      socket.close();
      return;
    }
    const Recorder = this.platform.Recorder;
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
      (type) => Recorder.isTypeSupported(type),
    );
    const options = {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 64000,
    };
    const recorder = new Recorder(this.audioStream!, options);
    this.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size && socket.readyState === 1) socket.send(event.data);
    };
    recorder.onstop = () => {
      if (this.stopping && socket.readyState === 1)
        socket.send(JSON.stringify({ type: "CloseStream" }));
    };
    recorder.onerror = () => {
      this.callbacks.error("Audio recording failed. Check your audio source.");
      this.stop(true);
    };
    socket.onmessage = (event) => {
      if (generation !== this.generation || this.socket !== socket) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "Error") {
          this.callbacks.error(data.description ?? "Transcription error.");
          this.stop(true);
          return;
        }
        const text = data.channel?.alternatives?.[0]?.transcript;
        if (text) {
          this.retries = 0;
          this.callbacks.text(text, Boolean(data.is_final));
        }
        if(data.speech_final || data.type === "UtteranceEnd") this.callbacks.utterance?.();
      } catch {
        /* Ignore non-JSON protocol messages. */
      }
    };
    socket.onerror = () => {
      if (!this.stopping && generation === this.generation)
        this.reconnect(generation, socket);
    };
    socket.onclose = (event) => {
      if (generation !== this.generation) return;
      if (this.stopping) {
        this.finish();
        return;
      }
      if (event.code === 1008) {
        this.callbacks.error(
          "Deepgram rejected this session. Check your key and quota.",
        );
        this.stop(true);
        return;
      }
      this.reconnect(generation, socket);
    };
    this.keepAlive = setInterval(() => {
      if (socket.readyState === 1 && this.paused)
        socket.send(JSON.stringify({ type: "KeepAlive" }));
    }, 5000);
    recorder.start(100);
    if (this.paused) recorder.pause();
    if (this.retainAudio && !this.localRecorder) {
      const local = new Recorder(this.audioStream!, options);
      this.localRecorder = local;
      const chunks: Blob[] = [];
      let bytes = 0;
      local.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          bytes += event.data.size;
          if (bytes > 128 * 1024 * 1024 && local.state !== "inactive") {
            local.stop();
            this.callbacks.error(
              "Local audio recording reached its size limit; transcription continues.",
            );
          }
        }
      };
      local.onstop = () => {
        if (chunks.length)
          this.callbacks.recording?.(
            new Blob(chunks, {
              type: local.mimeType || mimeType || "audio/webm",
            }),
          );
      };
      local.start(1000);
      if (this.paused) local.pause();
    }
    this.callbacks.state(this.paused ? "paused" : "live");
  }
  private reconnect(generation: number, socket: WebSocket) {
    if (
      generation !== this.generation ||
      this.stopping ||
      this.socket !== socket ||
      this.reconnectTimer
    )
      return;
    if (this.retries >= 3) {
      this.callbacks.error(
        "Listen disconnected. Check your network and press Start to reconnect.",
      );
      this.stop(true);
      return;
    }
    this.socket = undefined;
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    socket.close();
    if (this.keepAlive) clearInterval(this.keepAlive);
    if (this.recorder && this.recorder.state !== "inactive")
      this.recorder.stop();
    this.recorder = undefined;
    this.callbacks.state("reconnecting");
    const delay = 500 * 2 ** this.retries++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (generation !== this.generation || this.stopping) return;
      void this.connect(generation).catch(() => {
        if (generation !== this.generation) return;
        const failed = this.socket;
        if (failed) this.reconnect(generation, failed);
      });
    }, delay);
  }
  pause() {
    if (!this.recorder || this.stopping) return;
    this.paused = !this.paused;
    for (const recorder of [this.recorder, this.localRecorder]) {
      if (!recorder) continue;
      if (this.paused && recorder.state === "recording") recorder.pause();
      else if (!this.paused && recorder.state === "paused") recorder.resume();
    }
    this.callbacks.state(this.paused ? "paused" : "live");
  }
  stop(immediate = false) {
    if (immediate || !this.recorder) {
      this.finish();
      return;
    }
    if (this.stopping) return;
    this.stopping = true;
    this.callbacks.state("stopping");
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // CloseStream asks Deepgram to emit its final transcript before closing.
    this.stopTimer = setTimeout(() => this.finish(), 1500);
    this.recorder.stop();
  }
  private finish() {
    this.dispose();
    this.callbacks.state("idle");
  }
  dispose() {
    this.generation++;
    this.cancelConnect?.();
    this.cancelConnect = undefined;
    if (this.keepAlive) clearInterval(this.keepAlive);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.reconnectTimer = undefined;
    this.stopTimer = undefined;
    this.keepAlive = undefined;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      if (this.socket.readyState < 2) this.socket.close();
    }
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    if (this.localRecorder && this.localRecorder.state !== "inactive")
      this.localRecorder.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.audioStream = undefined;
    this.socket = undefined;
    this.recorder = undefined;
    this.localRecorder = undefined;
    this.stopping = false;
    this.key = "";
  }
}

/** WebSocket-shaped transport for Windows only. The main process owns authentication. */
export class WindowsTranscriptionSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  private id = crypto.randomUUID();
  private unsubscribe?: () => void;
  private sending = Promise.resolve();
  errorMessage = "";
  constructor(url: string) {
    const bridge = window.localCopilot;
    if (!bridge?.transcriptionOpen || !bridge.onTranscription) throw new Error("Restart the updated Windows app to enable transcription.");
    this.unsubscribe = bridge.onTranscription(event => {
      if (event.id !== this.id) return;
      if (event.type === "message") this.onmessage?.({ data: String(event.data) });
      if (event.type === "error") { this.errorMessage = String(event.data); this.onerror?.(); }
      if (event.type === "close") { this.readyState = 3; this.unsubscribe?.(); this.onclose?.({ code: Number(event.data) }); }
    });
    void bridge.transcriptionOpen({ id: this.id, language: new URL(url).searchParams.get("language") ?? "multi" }).then(() => {
      if (this.readyState !== 0) { void bridge.transcriptionClose?.(this.id); return; }
      this.readyState = 1; this.onopen?.();
    }).catch(error => {
      this.errorMessage = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "Deepgram connection failed.";
      this.readyState = 3; this.unsubscribe?.(); this.onerror?.(); this.onclose?.({ code: 1008 });
    });
  }
  send(data: Blob | string) {
    this.sending = this.sending.then(async () => {
      if (this.readyState !== 1) return;
      await window.localCopilot?.transcriptionSend?.(this.id, typeof data === "string" ? data : await data.arrayBuffer());
    }).catch(() => { this.errorMessage = "Audio could not reach the transcription service."; this.onerror?.(); });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3; this.unsubscribe?.(); void window.localCopilot?.transcriptionClose?.(this.id);
  }
}
