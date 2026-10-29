/** One launch gate per mounted Windows intro. Panel navigation never creates one. */
export class WindowsLaunchGate {
  private ready = false;
  private requested = false;
  private leaving = false;
  private disposed = false;
  private introTimer: ReturnType<typeof setTimeout>;
  private exitTimer?: ReturnType<typeof setTimeout>;
  private leave: () => void;
  private done: () => void;
  private schedule: typeof setTimeout;
  private cancel: typeof clearTimeout;
  constructor(
    leave: () => void,
    done: () => void,
    reducedMotion: boolean,
    schedule = setTimeout,
    cancel = clearTimeout,
  ) {
    this.leave = leave; this.done = done; this.schedule = schedule.bind(globalThis); this.cancel = cancel.bind(globalThis);
    this.exitDelay = reducedMotion ? 0 : 250;
    this.introTimer = this.schedule(() => this.skip(), reducedMotion ? 160 : 4000);
  }
  private exitDelay: number;
  setReady(value: boolean) { this.ready = value; this.advance(); }
  skip() { this.requested = true; this.advance(); }
  private advance() {
    if (this.disposed || this.leaving || !this.ready || !this.requested) return;
    this.leaving = true; this.cancel(this.introTimer); this.leave();
    this.exitTimer = this.schedule(() => { if (!this.disposed) this.done(); }, this.exitDelay);
  }
  dispose() { this.disposed = true; this.cancel(this.introTimer); if (this.exitTimer !== undefined) this.cancel(this.exitTimer); }
}
