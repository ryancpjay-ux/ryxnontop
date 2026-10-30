export {};
declare global {
  interface Window {
    localCopilot?: {
      setActivity?: (active: boolean) => Promise<void>;
      testConnection?: (input: { service: "openai" | "gemini" | "anthropic" | "deepgram"; key?: string; model: string; language?: string }) => Promise<{ connected: boolean; message: string; firstMs: number }>;
      transcriptionOpen?: (input: { id: string; language: string }) => Promise<void>;
      transcriptionSend?: (id: string, data: ArrayBuffer | string) => Promise<void>;
      transcriptionClose?: (id: string) => Promise<void>;
      onTranscription?: (callback: (event: { id: string; type: string; data?: string | number }) => void) => () => void;
      loadWorkspace: () => Promise<{ data: string | null; recovered: boolean }>;
      saveWorkspace: (snapshot: string) => Promise<void>;
      saveWorkspaceNow: (snapshot: string) => { success: boolean };
      clearWorkspace: () => Promise<void>;
      saveAudio: (bytes: Uint8Array, mime: string) => Promise<string>;
      openAudio: (filename: string) => Promise<void>;
      clearAudio: () => Promise<void>;
      exportPDF: (input: { title: string; html: string }) => Promise<boolean>;
      shareNote: (text: string) => Promise<void>;
      screens: () => Promise<
        { id: string; displayId: string; name: string; thumbnail: string }[]
      >;
      setNetwork: (enabled: boolean) => Promise<void>;
      saveKeysNow: (keys: {
        geminiKey: string;
        deepgramKey: string;
        openaiKey?: string;
        anthropicKey?: string;
      }) => {
        success: boolean;
      };
      loadKeys: () => Promise<{
        geminiKey: string;
        deepgramKey: string;
        openaiKey?: string;
        anthropicKey?: string;
      }>;
      saveKeys: (keys: {
        geminiKey: string;
        deepgramKey: string;
        openaiKey?: string;
        anthropicKey?: string;
      }) => Promise<void>;
      prepareAudio: (source: string) => Promise<void>;
      permissions: () => Promise<{
        microphone: string;
        accessibility: boolean;
      }>;
      permission: (kind: string) => Promise<void>;
      hide: () => Promise<void>;
      reply: (input: {
        id: string;
        provider?: "gemini" | "openai" | "anthropic";
        key: string;
        model: string;
        prompt: string;
        fast?: boolean;
        image?: string;
      }) => Promise<string>;
      cancel: (id: string) => Promise<void>;
      onChunk: (
        callback: (chunk: {
          id: string;
          text: string;
          modelVersion?: string;
        }) => void,
      ) => () => void;
    };
  }
}
