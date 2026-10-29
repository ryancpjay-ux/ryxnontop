/** Finish durable saves before electron-updater is allowed to start NSIS. */
export async function saveWindowsUpdateState(input: {
  isActive: () => boolean;
  saveKeys: () => Promise<void>;
  snapshot: () => string;
  saveWorkspace: (snapshot: string) => { success: boolean } | undefined;
}) {
  if (input.isActive()) throw new Error("Finish Listen and Ask before installing an update.");
  await input.saveKeys();
  if (input.isActive()) throw new Error("Finish Listen and Ask before installing an update.");
  const snapshot = input.snapshot();
  if (!snapshot) throw new Error("The workspace is not ready to save. Please retry.");
  if (!input.saveWorkspace(snapshot)?.success) throw new Error("Could not save your workspace. The app stayed open; retry or export a backup.");
}
