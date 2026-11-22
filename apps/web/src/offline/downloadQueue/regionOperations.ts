/**
 * Serializes commands that can observe or change regional pack ownership on
 * the Offline page. Acquisition is synchronous, including between React renders.
 */
type RegionOperation = "download" | "check" | "repair" | "delete" | "inventory" | "queue";

export class RegionOperations {
  private owner: RegionOperation | null = null;
  private readonly listeners = new Set<() => void>();

  readonly getSnapshot = (): RegionOperation | null => this.owner;
  readonly subscribe = (notify: () => void): (() => void) => {
    this.listeners.add(notify);
    return () => { this.listeners.delete(notify); };
  };

  acquire(kind: RegionOperation): (() => void) | null {
    if (this.owner !== null) return null;
    this.owner = kind;
    this.notify();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.owner = null;
      this.notify();
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
