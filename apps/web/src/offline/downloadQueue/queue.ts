export type QueueOutcome = "complete" | "interrupted" | "quota" | "error" | "unavailable";
export type QueueStatus = "pending" | "active" | QueueOutcome;

export interface QueueEntry {
  readonly id: string;
  readonly status: QueueStatus;
}

export interface QueueSnapshot {
  readonly entries: readonly QueueEntry[];
  readonly phase: "idle" | "running" | "pausing" | "stopped" | "finished";
}

export type RegionDownload = (id: string, signal: AbortSignal) => Promise<QueueOutcome>;

interface Run {
  /** The signal belongs to the current region only. */
  controller: AbortController;
  readonly done: Promise<void>;
}

function entry(id: string, status: QueueStatus): QueueEntry {
  return Object.freeze({ id, status });
}

function isOutcome(value: unknown): value is QueueOutcome {
  switch (value) {
    case "complete":
    case "interrupted":
    case "quota":
    case "error":
    case "unavailable":
      return true;
    default:
      return false;
  }
}

async function downloadOne(download: RegionDownload, id: string, signal: AbortSignal): Promise<QueueOutcome> {
  if (signal.aborted) return "interrupted";
  try {
    const result = await download(id, signal);
    return isOutcome(result) ? result : "error";
  } catch {
    return signal.aborted ? "interrupted" : "error";
  }
}

/** An in-memory ordered list. Only an explicit start can invoke the supplied downloader. */
export class DownloadQueue {
  private state: QueueSnapshot = Object.freeze({ entries: Object.freeze([]), phase: "idle" });
  private readonly listeners = new Set<{ notify: () => void }>();
  private run: Run | null = null;

  readonly getSnapshot = (): QueueSnapshot => this.state;

  readonly subscribe = (notify: () => void): (() => void) => {
    const registration = { notify };
    this.listeners.add(registration);
    return () => { this.listeners.delete(registration); };
  };

  private publish(phase: QueueSnapshot["phase"], entries: readonly QueueEntry[]): void {
    this.state = Object.freeze({ phase, entries: Object.freeze(entries) });
    // A subscriber can unmount another subscriber or subscribe a replacement.
    for (const listener of Array.from(this.listeners)) {
      if (this.listeners.has(listener)) listener.notify();
    }
  }

  private edited(entries: QueueEntry[]): void {
    if (entries.length === 0) this.publish("idle", entries);
    else if (entries.every((item) => item.status === "complete")) this.publish("finished", entries);
    else this.publish(this.state.phase === "stopped" ? "stopped" : "idle", entries);
  }

  add(id: string): void {
    if (this.run || typeof id !== "string" || !id.trim() || /\p{Cc}/u.test(id)) return;
    if (this.state.entries.some((item) => item.id === id)) return;
    // Identifiers are opaque keys from the region catalogue. Normalize neither case nor accents.
    this.edited([...this.state.entries, entry(id, "pending")]);
  }

  remove(id: string): void {
    if (this.run) return;
    const entries = this.state.entries.filter((item) => item.id !== id);
    if (entries.length !== this.state.entries.length) this.edited(entries);
  }

  move(id: string, delta: -1 | 1): void {
    if (this.run || (delta !== -1 && delta !== 1)) return;
    const from = this.state.entries.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= this.state.entries.length) return;
    const entries = [...this.state.entries];
    const item = entries[from]!;
    entries.splice(from, 1);
    entries.splice(to, 0, item);
    this.edited(entries);
  }

  clearCompleted(): void {
    if (this.run) return;
    const entries = this.state.entries.filter((item) => item.status !== "complete");
    if (entries.length !== this.state.entries.length) this.edited(entries);
  }

  start(download: RegionDownload): Promise<void> {
    if (this.run) return this.run.done;
    const first = this.state.entries.findIndex((item) => item.status !== "complete");
    if (first === -1) return Promise.resolve();

    const entries = [...this.state.entries];
    entries[first] = entry(entries[first]!.id, "active");
    // Reserve the run before announcing it. Another click or a synchronous
    // subscriber sees the lock before the first user-supplied callback runs.
    const done = Promise.resolve().then(() => this.drain(first, download));
    this.run = { done, controller: new AbortController() };
    this.publish("running", entries);
    return done;
  }

  pause(): void {
    const run = this.run;
    if (!run || this.state.phase === "pausing") return;
    this.publish("pausing", this.state.entries);
    run.controller.abort();
  }

  private async drain(first: number, download: RegionDownload): Promise<void> {
    const run = this.run!;
    let index = first;
    for (;;) {
      const current = this.state.entries[index]!;
      const signal = run.controller.signal;
      const result = await downloadOne(download, current.id, signal);
      const entries = [...this.state.entries];
      entries[index] = entry(current.id, result);

      // A cell or region may have committed before cancellation was observed.
      // Keep the downloader's confirmed outcome even when pausing the batch.
      if (result !== "complete") {
        this.finish("stopped", entries);
        return;
      }

      index++;
      while (index < entries.length && entries[index]!.status === "complete") index++;
      if (index === entries.length) {
        this.finish("finished", entries);
        return;
      }
      if (signal.aborted) {
        this.finish("stopped", entries);
        return;
      }

      run.controller = new AbortController();
      entries[index] = entry(entries[index]!.id, "active");
      this.publish("running", entries);
    }
  }

  private finish(phase: "finished" | "stopped", entries: QueueEntry[]): void {
    // A listener is allowed to edit or start a fresh run from this terminal
    // snapshot. The old run must never clear that new run's reservation.
    this.run = null;
    this.publish(phase, entries);
  }
}
