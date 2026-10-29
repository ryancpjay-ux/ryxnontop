/** Electron wraps rejected IPC calls; keep permission recovery independent of it. */
export function captureErrorMessage(message: string): string {
  message = message.replace(/^Error invoking remote method ['"][^'"]+['"]:\s*(?:Error:\s*)?/, "");
  const permission = message.indexOf("Access required:");
  return permission >= 0 ? message.slice(permission) : message;
}
