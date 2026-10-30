/** Session memory survives Settings/panel unmounts; it is never persisted across app launches. */
export class UpdateNoticeSession {
  private announced = new Set<string>();
  claim(version: string) {
    if (!version || this.announced.has(version)) return false;
    this.announced.add(version);
    return true;
  }
}
export const updateNoticeSession = new UpdateNoticeSession();
