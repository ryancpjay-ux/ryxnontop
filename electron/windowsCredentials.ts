import { createCredentialStore, type ProviderKeys } from "./credentials";
import { normalizeWindowsKey } from "./windowsKeys";

/** Retain safeStorage's Windows DPAPI backend and the existing encrypted file format. */
export function createWindowsCredentialStore(...args: Parameters<typeof createCredentialStore>) {
  const store = createCredentialStore(...args);
  const normalize = (keys: ProviderKeys): ProviderKeys => Object.fromEntries(
    Object.entries(keys).map(([field, value]) => [field, typeof value === "string" ? normalizeWindowsKey(value) : value]),
  ) as unknown as ProviderKeys;
  return {
    load() {
      try { return normalize(store.load()); }
      catch { throw new Error("Could not decrypt saved API credentials for this Windows account. Re-enter your keys in Settings; the saved file has been preserved."); }
    },
    save(value: unknown) {
      try { store.save(value && typeof value === "object" ? normalize(value as ProviderKeys) : value); }
      catch { throw new Error("Could not save API credentials securely for this Windows account. Check storage access and try again."); }
    },
  };
}
