import { app, safeStorage } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ProviderKeys {
  geminiKey: string;
  deepgramKey: string;
  openaiKey?: string;
  anthropicKey?: string;
}

const emptyKeys = (): ProviderKeys => ({ geminiKey: "", deepgramKey: "" });

function validate(value: unknown): ProviderKeys {
  if (!value || typeof value !== "object")
    throw new Error("Invalid API key settings.");
  const keys = value as ProviderKeys;
  if (
    typeof keys.geminiKey !== "string" ||
    typeof keys.deepgramKey !== "string" ||
    keys.geminiKey.length > 8192 ||
    keys.deepgramKey.length > 8192 ||
    [keys.openaiKey, keys.anthropicKey].some(
      (key) =>
        key !== undefined && (typeof key !== "string" || key.length > 8192),
    )
  ) {
    throw new Error("Invalid API key settings.");
  }
  return {
    geminiKey: keys.geminiKey.trim(),
    deepgramKey: keys.deepgramKey.trim(),
    ...(keys.openaiKey !== undefined
      ? { openaiKey: keys.openaiKey.trim() }
      : {}),
    ...(keys.anthropicKey !== undefined
      ? { anthropicKey: keys.anthropicKey.trim() }
      : {}),
  };
}

// The injectable directory/cryptography keep tests isolated from real user keys.
export function createCredentialStore(
  directory = () => app.getPath("userData"),
  cryptography = safeStorage,
) {
  const filename = () => path.join(directory(), "provider-keys.enc");
  const requireEncryption = () => {
    if (
      !cryptography.isEncryptionAvailable() ||
      (process.platform === "linux" &&
        cryptography.getSelectedStorageBackend() === "basic_text")
    ) {
      throw new Error(
        "Secure key storage is unavailable. Unlock your system keychain and try saving again.",
      );
    }
  };
  return {
    load(): ProviderKeys {
      if (!fs.existsSync(filename())) return emptyKeys();
      requireEncryption();
      try {
        return validate(
          JSON.parse(cryptography.decryptString(fs.readFileSync(filename()))),
        );
      } catch {
        throw new Error(
          "Could not unlock saved API keys. Check your system keychain or enter the keys again.",
        );
      }
    },
    save(value: unknown): void {
      const keys = validate(value);
      if (!Object.values(keys).some(Boolean)) {
        fs.rmSync(filename(), { force: true });
        return;
      }
      requireEncryption();
      const ciphertext = cryptography.encryptString(JSON.stringify(keys));
      fs.mkdirSync(directory(), { recursive: true, mode: 0o700 });
      const temporary = `${filename()}.tmp`;
      try {
        fs.writeFileSync(temporary, ciphertext, { mode: 0o600 });
        fs.chmodSync(temporary, 0o600);
        fs.renameSync(temporary, filename());
      } catch {
        fs.rmSync(temporary, { force: true });
        throw new Error(
          "Could not save API keys on this device. Check available disk space and try again.",
        );
      }
    },
  };
}
