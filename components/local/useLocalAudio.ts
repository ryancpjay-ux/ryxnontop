"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LocalAudioSession, type AudioState } from "@/lib/local-audio";
export function useLocalAudio(
  onText: (text: string) => void,
  onError: (message: string) => void,
  onRecording?: (blob: Blob) => void,
) {
  const [state, setState] = useState<AudioState>("idle");
  const [completedSegments,setCompletedSegments]=useState(0);
  const segmentCount=useRef(0);
  const [speechEnd,setSpeechEnd]=useState(0);
  const [interim, setInterim] = useState("");
  const session = useRef<LocalAudioSession | null>(null);
  const callbacks = useRef({ onText, onError, onRecording });
  useEffect(() => {
    callbacks.current = { onText, onError, onRecording };
  }, [onText, onError, onRecording]);
  useEffect(() => {
    session.current = new LocalAudioSession({
      state: (value) => {
        setState(value);
        if (value === "idle") setInterim("");
      },
      text: (text, final) => {
        if (final) {
          segmentCount.current++;
          callbacks.current.onText(text);
          setInterim("");
        } else setInterim(text);
      },
      utterance:()=>{setCompletedSegments(segmentCount.current);setSpeechEnd(performance.now());},
      error: (message) => callbacks.current.onError(message),
      recording: (blob) => callbacks.current.onRecording?.(blob),
    });
    return () => {
      session.current?.dispose();
      session.current = null;
    };
  }, []);
  const start = useCallback(
    (key: string, source: string, language: string, retainAudio = false) =>
      {segmentCount.current=0;setCompletedSegments(0);setSpeechEnd(0);return session.current?.start(key, source, language, retainAudio);},
    [],
  );
  const stop = useCallback(
    (immediate = false) => session.current?.stop(immediate),
    [],
  );
  const pause = useCallback(() => session.current?.pause(), []);
  return { state, interim, completedSegments, speechEnd, start, stop, pause };
}
