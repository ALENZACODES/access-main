import { type PersistentCellStore } from "./indexedCellStore";
import { inspectRegion, type RegionInventory } from "./regionInventory";
import { type RegionManifest, type StoredCell } from "./regionDownload";
import {
  allowedCleanupIds, planCellCleanup, type CleanupPreview,
} from "./cleanupPlan";

export type CleanupPhase = "idle" | "inspecting" | "awaiting-confirmation" | "removing" | "finished" | "failed";
export type CleanupStop = "none" | "complete" | "interrupted" | "changed" | "storage-error" | "unsafe";
export interface CleanupProgress {
  readonly completed: number;
  readonly total: number;
  readonly currentId: string | null;
}
export interface CleanupOutcome {
  readonly regionId: string;
  readonly deleted: readonly string[];
  readonly retained: readonly string[];
  readonly stop: CleanupStop;
  readonly latestInventory: RegionInventory | null;
}
export interface CleanupState {
  readonly phase: CleanupPhase;
  readonly preview: CleanupPreview | null;
  readonly inventory: RegionInventory | null;
  readonly outcome: CleanupOutcome | null;
  readonly progress: CleanupProgress;
  readonly revision: number;
}
export interface CleanupController {
  readonly state: () => CleanupState;
  readonly subscribe: (listener: (state: CleanupState) => void) => () => void;
  readonly prepare: (ids: readonly string[]) => Promise<CleanupPreview | null>;
  readonly confirm: () => Promise<CleanupOutcome | null>;
  readonly cancel: () => void;
  readonly dismiss: () => void;
  readonly dispose: () => void;
}

/** A store failure cannot be mistaken for a successfully completed delete. */
function sameStoredCell(a: StoredCell, b: StoredCell): boolean {
  return a.bytes === b.bytes &&
    a.provenance.source === b.provenance.source &&
    a.provenance.licence === b.provenance.licence &&
    a.provenance.date === b.provenance.date;
}

function consistentListing(
  before: RegionInventory,
  after: RegionInventory,
  id: string,
): boolean {
  const a = before.cells.find((cell) => cell.id === id);
  const b = after.cells.find((cell) => cell.id === id);
  return !!a && !!b && a.state === b.state && a.cause === b.cause &&
    a.expectedBytes === b.expectedBytes &&
    a.provenance.source === b.provenance.source &&
    a.provenance.licence === b.provenance.licence &&
    a.provenance.date === b.provenance.date;
}

/**
 * Destructive operations require separate prepare and confirm gestures.
 * Each listed record is re-read before deletion; manifest or store changes
 * terminate the batch instead of silently discarding another copy.
 *
 * IndexedDB transactions provide per-record atomicity. A concurrent writer
 * could still replace a record between get and remove; callers must not
 * expose this action as a conditional compare-and-delete primitive.
 */
export function createCleanupController(
  manifest: RegionManifest,
  store: PersistentCellStore,
): CleanupController {
  let disposed = false;
  let cancelled = false;
  let running: Promise<unknown> | null = null;
  let initialRecords = new Map<string, StoredCell>();
  let state: CleanupState = {
    phase: "idle", preview: null, inventory: null, outcome: null,
    progress: { completed: 0, total: 0, currentId: null }, revision: 0,
  };
  const listeners = new Set<(state: CleanupState) => void>();
  const publish = (change: Partial<CleanupState>): void => {
    if (disposed) return;
    state = { ...state, ...change, revision: state.revision + 1 };
    for (const listener of listeners) listener(state);
  };
  const outcome = (
    deleted: readonly string[],
    retained: readonly string[],
    stop: CleanupStop,
    latestInventory: RegionInventory | null,
  ): CleanupOutcome => ({
    regionId: manifest.regionId, deleted: [...deleted], retained: [...retained],
    stop, latestInventory,
  });
  const prepare = async (ids: readonly string[]): Promise<CleanupPreview | null> => {
    if (disposed || running || state.phase === "removing") return null;
    cancelled = false;
    publish({ phase: "inspecting", preview: null, outcome: null });
    const task = (async (): Promise<CleanupPreview | null> => {
      try {
        const inventory = await inspectRegion(manifest, store);
        if (disposed || cancelled) return null;
        const preview = planCellCleanup(manifest, inventory, ids);
        const permitted = allowedCleanupIds(preview);
        const records = new Map<string, StoredCell>();
        if (!preview.ready || permitted.length !== ids.length ||
          new Set(ids).size !== ids.length || permitted.length === 0) {
          publish({ phase: "failed", inventory, preview, progress: {
            completed: 0, total: 0, currentId: null,
          } });
          return preview;
        }
        for (const id of permitted) {
          if (disposed || cancelled) return null;
          const record = await store.get(manifest.regionId, id);
          if (!record) {
            publish({ phase: "failed", inventory, preview });
            return preview;
          }
          records.set(id, record);
        }
        if (disposed || cancelled) return null;
        initialRecords = records;
        publish({
          phase: "awaiting-confirmation", inventory, preview,
          progress: { completed: 0, total: permitted.length, currentId: null },
        });
        return preview;
      } catch {
        publish({ phase: "failed", preview: null });
        return null;
      }
    })();
    running = task;
    try { return await task; } finally { running = null; }
  };
  const confirm = async (): Promise<CleanupOutcome | null> => {
    if (disposed || running || state.phase !== "awaiting-confirmation" ||
      !state.preview?.ready || !state.inventory) return null;
    const preview = state.preview;
    const baseline = state.inventory;
    const ids = allowedCleanupIds(preview);
    if (!ids.length || initialRecords.size !== ids.length) return null;
    cancelled = false;
    publish({ phase: "removing" });
    const task = (async (): Promise<CleanupOutcome | null> => {
      const deleted: string[] = [];
      let stop: CleanupStop = "complete";
      for (const id of ids) {
        if (disposed || cancelled) { stop = "interrupted"; break; }
        publish({ progress: { completed: deleted.length, total: ids.length, currentId: id } });
        try {
          const after = await inspectRegion(manifest, store);
          if (!consistentListing(baseline, after, id)) { stop = "changed"; break; }
          const previous = initialRecords.get(id);
          const current = await store.get(manifest.regionId, id);
          if (!previous || !current || !sameStoredCell(previous, current)) {
            stop = "changed";
            break;
          }
          if (disposed || cancelled) { stop = "interrupted"; break; }
          await store.remove(manifest.regionId, id);
          deleted.push(id);
        } catch {
          stop = "storage-error";
          break;
        }
      }
      let latestInventory: RegionInventory | null = null;
      try { latestInventory = await inspectRegion(manifest, store); } catch { /* UNKNOWN */ }
      const completed = new Set(deleted);
      const retained = ids.filter((id) => !completed.has(id));
      const result = outcome(deleted, retained, stop, latestInventory);
      initialRecords.clear();
      publish({
        phase: stop === "complete" ? "finished" : "failed",
        inventory: latestInventory,
        outcome: result,
        preview: null,
        progress: { completed: deleted.length, total: ids.length, currentId: null },
      });
      return result;
    })();
    running = task;
    try { return await task; } finally { running = null; }
  };
  return {
    state: () => state,
    subscribe(listener) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    prepare, confirm,
    cancel() {
      cancelled = true;
      if (state.phase === "awaiting-confirmation") {
        initialRecords.clear();
        publish({ phase: "idle", preview: null });
      }
    },
    dismiss() {
      if (state.phase === "removing" || state.phase === "inspecting") return;
      initialRecords.clear();
      publish({ phase: "idle", preview: null, outcome: null });
    },
    dispose() {
      disposed = true;
      cancelled = true;
      initialRecords.clear();
      listeners.clear();
    },
  };
}
