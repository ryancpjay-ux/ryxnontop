"use client";
import { useState } from "react";
export function WindowsCapturePanel() {
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  async function check(kind: "screen" | "microphone") {
    setChecking(true); setStatus(`Checking ${kind} access…`);
    try {
      if (kind === "microphone") {
        await window.localCopilot?.prepareAudio("microphone");
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        stream.getTracks().forEach(track => track.stop());
        setStatus("Microphone access works. Test audio was not saved or sent.");
      } else {
        if (await window.electronAPI?.screen.triggerPrompt() !== "granted") {
          setStatus("Screen access was not approved. You can allow it when ready."); return;
        }
        const result = await window.electronAPI?.screen.capture(undefined, true);
        setStatus(result?.success ? "Screen capture works. The test image stayed on this device." : "Screen capture is unavailable. Check Windows capture privacy settings or your organization's policy, then retry.");
      }
    } catch {
      setStatus(kind === "microphone" ? "Microphone unavailable. In Windows Settings, turn on Microphone access and Let desktop apps access your microphone, then retry." : "Screen capture unavailable. Check Windows capture settings, then retry.");
    } finally { setChecking(false); }
  }
  return <>
    <h1 id="mist-dialog-title">Capture permissions</h1>
    <p>Allow the capture features you use. Windows also controls microphone access and may restrict screen capture through privacy or organization policies.</p>
    <button className="mist-primary" disabled={checking} onClick={() => void check("microphone")}>Allow and test microphone</button>
    <button className="mist-primary" disabled={checking} onClick={() => void check("screen")}>Allow and test screen capture</button>
    <button className="mist-soft-button" onClick={() => void window.localCopilot?.permission("microphone")}>Open microphone privacy settings</button>
    <button className="mist-soft-button" onClick={() => void window.electronAPI?.screen.openSettings()}>Open screen capture privacy settings</button>
    <button className="mist-soft-button" onClick={() => void window.localCopilot?.permission("system-audio")}>Open sound settings</button>
    <p role="status">{status}</p>
    <p>Your choices are remembered on this Windows account. The app cannot bypass disabled Windows permissions. Screen capture does not use the camera.</p>
  </>;
}
