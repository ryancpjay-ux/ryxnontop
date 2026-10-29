"use client";
import { useEffect, useRef, useState } from "react";
import IntroSplash from "./IntroSplash";
import { WindowsLaunchGate } from "@/lib/windows-launch";

/** Reuses the existing visual intro; only Windows receives automatic launch routing. */
export default function WindowsOpeningIntro({ light, ready, firstLaunch, onDone, onQuit }: {
  light: boolean; ready: boolean; firstLaunch: boolean; onDone: () => void; onQuit: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const gate = useRef<WindowsLaunchGate | null>(null);
  const latestDone = useRef(onDone); latestDone.current = onDone;
  useEffect(() => {
    const controller = new WindowsLaunchGate(() => setLeaving(true), () => latestDone.current(), window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    gate.current = controller;
    return () => { controller.dispose(); gate.current = null; };
  }, []);
  useEffect(() => { gate.current?.setReady(ready); }, [ready]);
  return <div className={`ryx-windows-launch ${leaving ? "leaving" : ""}`}>
    <IntroSplash light={light} onDone={() => { setWaiting(true); gate.current?.skip(); }} onQuit={onQuit}
      enterLabel={waiting && !ready ? "Preparing your workspace…" : firstLaunch ? "Skip to setup" : "Skip intro"} />
  </div>;
}
