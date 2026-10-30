"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { defaultModels, modelPresets, type Provider } from "@/lib/local-providers";

type Service = "openai" | "gemini" | "anthropic" | "deepgram";
export type WindowsKeys = { openaiKey: string; geminiKey: string; deepgramKey: string; anthropicKey: string };
export type WindowsApiProps = {
  keys: WindowsKeys; onKeys: (keys: WindowsKeys) => void;
  provider: Provider; model: string; language: string;
  onProvider: (provider: Provider) => void; onModel: (model: string) => void;
  save: () => Promise<void>;
};
const fields = { openai: "openaiKey", gemini: "geminiKey", anthropic: "anthropicKey", deepgram: "deepgramKey" } as const;
const names = { openai: "OpenAI", gemini: "Google Gemini", anthropic: "Claude (Anthropic)", deepgram: "Deepgram" };
const links = { openai: "https://platform.openai.com/api-keys", gemini: "https://aistudio.google.com/api-keys", anthropic: "https://platform.claude.com/settings/keys", deepgram: "https://console.deepgram.com" };
const saved = "__RYX_WINDOWS_SAVED_KEY__";
type Status = { signature: string; success: boolean; message: string };

function ServiceCard({ service, p, onStatus, guided = false }: { service: Service; p: WindowsApiProps; onStatus?: (ok: boolean) => void; guided?: boolean }) {
  const [shown, setShown] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const generation = useRef(0);
  const key = p.keys[fields[service]];
  const signature = `${key}\u0000${service === "deepgram" ? p.language : p.model}`;
  const latest = useRef(signature); latest.current = signature;
  const replace = (value: string) => { generation.current++; setStatus(null); onStatus?.(false); p.onKeys({ ...p.keys, [fields[service]]: value }); };
  const test = async () => {
    const attempt = ++generation.current; const testedSignature = signature;
    setTesting(true); setStatus(null); onStatus?.(false);
    try {
      if (!window.localCopilot?.testConnection) throw new Error("Open the desktop app to test API connections.");
      const result = await window.localCopilot.testConnection({ service, key, model: p.model, language: p.language });
      if (attempt !== generation.current || latest.current !== testedSignature) return;
      setStatus({ signature: testedSignature, success: true, message: `${result.message} · ${(result.firstMs / 1000).toFixed(2)}s to first response` }); onStatus?.(true);
    } catch (error) {
      if (attempt !== generation.current || latest.current !== testedSignature) return;
      setStatus({ signature: testedSignature, success: false, message: (error instanceof Error ? error.message : "Connection failed.").replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") });
    } finally { setTesting(false); }
  };
  const visibleStatus = status?.signature === signature ? status : null;
  return <section className="ryx-settings-card ryx-api-card">
    <h2><KeyRound size={18} /> {names[service]} <small>{testing ? "Testing…" : visibleStatus?.success ? "Connected" : visibleStatus ? "Failed" : key === saved ? "Saved · not tested" : key ? "Key entered · not tested" : "Not configured"}</small></h2>
    <p>{service === "deepgram" ? "Deepgram powers fast, real-time speech recognition so ryxnontop can understand spoken questions and respond automatically." : "Generates AI answers in Listen and Ask. You only need one answer provider."}</p>
    <details open={guided || undefined}><summary>How to get a {names[service]} key</summary>
      <ol><li><a href={links[service]} target="_blank" rel="noreferrer">Open {names[service]} ↗</a> and sign in or create an account.</li>
        {service === "deepgram" ? <><li>Select your Deepgram project, then API Keys (or Settings → API Keys).</li><li>Create a key with speech-recognition access. Copy the generated key.</li></> : <li>Create or select an API key. {service === "openai" || service === "anthropic" ? "Configure API billing and access to the selected model; a ChatGPT or Claude subscription is separate." : "Check your project quota and enable billing if your selected model requires it."}</li>}
        {service === "anthropic" && <li>Create the key scoped to your Claude workspace. A Claude subscription does not include API credits.</li>}
        <li>Paste it below, then click Test Connection. Testing makes a small provider request and may use API credits.</li></ol>
      {service === "deepgram" && <a href="https://developers.deepgram.com/guides/fundamentals/authenticating" target="_blank" rel="noreferrer">Official Deepgram authentication documentation ↗</a>}
    </details>
    {service !== "deepgram" && <label>Model<select aria-label={`${names[service]} model`} value={p.model} onChange={e => { onStatus?.(false); p.onModel(e.target.value); }}><option value={p.model}>{p.model}</option>{modelPresets[service].filter(model => model !== p.model).map(model => <option key={model}>{model}</option>)}</select></label>}
    <label>{names[service]} API key<div className="ryx-api-key-row"><input aria-label={`${names[service]} API key`} type={shown ? "text" : "password"} autoComplete="off" spellCheck={false} value={key === saved ? "" : key} placeholder={key === saved ? "Saved securely · enter a replacement" : "Paste your API key"} onChange={e => replace(e.target.value)} /><button className="mist-soft-button" aria-label={shown ? "Hide API key" : "Show API key"} onClick={() => setShown(!shown)}>{shown ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
    <div className="ryx-settings-actions"><button className="mist-soft-button" disabled={!key || testing} onClick={() => void test()}>Test Connection</button><button className="mist-soft-button" onClick={() => void p.save().catch(error => setStatus({ signature, success: false, message: error.message }))}>Save / update</button><button className="mist-soft-button" disabled={!key} onClick={() => replace("")}>Remove key</button></div>
    <p className={visibleStatus && !visibleStatus.success ? "ryx-settings-error" : "ryx-settings-caption"} role="status">{visibleStatus?.message ?? (key === saved ? "Encrypted for this Windows account. Saved keys are never revealed here." : "Keys are masked by default and encrypted on this device.")}</p>
  </section>;
}
export function WindowsApiConnections(p: WindowsApiProps) {
  return <><section className="ryx-settings-card"><h2>API Connections</h2><p>Manage each service independently. Test the selected model after changing it.</p></section>{(["openai", "gemini", "anthropic", "deepgram"] as Service[]).map(service => <ServiceCard key={service} service={service} p={{ ...p, model: service === p.provider ? p.model : defaultModels[service === "deepgram" ? "gemini" : service], onModel: model => { if (service !== "deepgram") p.onProvider(service); p.onModel(model); } }} />)}</>;
}
export default function WindowsApiSetup(p: WindowsApiProps & { onFinish: () => void; resume?: boolean }) {
  const [step, setStep] = useState(() => {
    try { const previous = Number(localStorage.getItem("ryxnontop-windows-setup-step")); return p.resume && Number.isInteger(previous) ? Math.max(0, Math.min(2, previous)) : 0; } catch { return 0; }
  });
  useEffect(() => { try { localStorage.setItem("ryxnontop-windows-setup-step", String(step)); } catch { /* Core settings still use the native workspace store. */ } }, [step]);
  const [aiReady, setAiReady] = useState(false);
  const [speechReady, setSpeechReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const provider = p.provider;
  const titles = ["Welcome to ryxnontop", "Choose your AI provider", "Connect your AI provider", "Set Up Deepgram", "Your AI Setup", "You're ready."];
  const finish = async () => { setSaving(true); try { await p.save(); try { localStorage.removeItem("ryxnontop-windows-setup-step"); } catch { /* Optional progress cache. */ } p.onFinish(); } catch { setError("Could not save securely. Check secure storage access and try again."); } finally { setSaving(false); } };
  return <div className="ryx-api-wizard" key={step}><span className="ryx-settings-caption">RYXNONTOP · {step + 1} / 6</span><h1 id="mist-dialog-title">{titles[step]}</h1>
    {step === 0 && <p>Let’s get your AI assistant ready.</p>}
    {step === 1 && <><p>Choose one provider for answers in Listen and Ask.</p><div className="ryx-settings-actions">{(["openai", "gemini", "anthropic"] as const).map(value => <button className="mist-soft-button" aria-pressed={provider === value} key={value} onClick={() => { setAiReady(false); p.onProvider(value); p.onModel(defaultModels[value]); }}>{provider === value && <Check size={16} />} {names[value]}{value === "gemini" ? " (Recommended)" : ""}</button>)}</div></>}
    {step === 2 && <ServiceCard guided service={provider} p={p} onStatus={setAiReady} />}
    {step === 3 && <><ServiceCard guided service="deepgram" p={p} onStatus={setSpeechReady} /><p className="ryx-settings-caption">Deepgram is needed for Listen. Ask works without it. You can configure speech recognition later in API Connections.</p></>}
    {step === 4 && <section className="ryx-settings-card"><p>{names[provider]} — {aiReady ? "Connected" : "Needs testing"}</p>{(["openai", "gemini", "anthropic"] as const).filter(service => service !== provider).map(service => <p key={service}>{names[service]} — {p.keys[fields[service]] ? "Saved · not tested" : "Not configured"}</p>)}<p>Deepgram — {speechReady ? "Connected" : p.keys.deepgramKey ? "Saved · not tested" : "Not configured"}</p><p>{speechReady ? "Ask and Listen connections are ready. Audio permission is requested when you start Listen." : "Ask is ready. Set up Deepgram before starting Listen."}</p></section>}
    {step === 5 && <p>Your keys are stored securely on this device. You can replace or remove them in Settings → API Connections.</p>}
    {error && <p role="alert" className="ryx-settings-error">{error}</p>}<div className="ryx-settings-actions">{step > 0 && <button className="mist-soft-button" onClick={() => setStep(step - 1)}>Back</button>}<button className="mist-primary" disabled={saving || (step === 2 && !aiReady)} onClick={() => step === 5 ? void finish() : (() => { if (step === 1 && p.provider !== provider) { p.onProvider(provider); p.onModel(defaultModels[provider]); } setStep(step + 1); })()}>{saving ? "Saving…" : step === 0 ? "Get Started" : step === 5 ? "Enter workspace" : step === 3 && !speechReady ? "Continue with Ask only" : "Continue"}<ArrowRight size={16} /></button></div>
  </div>;
}
