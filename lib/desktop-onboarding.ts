/** Only legacy Mac profiles with configured credentials migrate past the new wizard. */
export function setupAlreadyComplete(platform: string | undefined, completed: boolean, configured: boolean, started: boolean) {
  return completed || (platform === "darwin" && configured && !started);
}
