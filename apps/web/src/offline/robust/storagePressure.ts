import { mountOfflineDashboard } from "./offlineDashboard";
import { downloadRegion, type DownloadDependencies, type DownloadResult, type Language, type RegionManifest } from "./regionDownload";

/** User-facing download state; missing cells never become availability claims. */
export type PressureState =
  | { readonly phase: "idle" | "working"; readonly result: null }
  | { readonly phase: "stopped"; readonly result: DownloadResult };

export const PRESSURE_COPY = {
  en: {
    start: "Download region",
    retry: "Retry missing cells",
    working: "Downloading missing cells…",
    complete: "All listed cells are saved offline.",
    quota: "Storage space is low. Free space, then retry missing cells.",
    interrupted: "Download interrupted. Retry missing cells.",
    error: "Download stopped. Retry missing cells.",
    partial: "Missing cells remain UNKNOWN offline.",
    saved: "Saved cells",
    missing: "UNKNOWN cells",
  },
  fr: {
    start: "Télécharger la région",
    retry: "Réessayer les cellules manquantes",
    working: "Téléchargement des cellules manquantes…",
    complete: "Toutes les cellules répertoriées sont enregistrées hors ligne.",
    quota: "L’espace de stockage est insuffisant. Libérez de l’espace, puis réessayez les cellules manquantes.",
    interrupted: "Téléchargement interrompu. Réessayez les cellules manquantes.",
    error: "Téléchargement arrêté. Réessayez les cellules manquantes.",
    partial: "Les cellules manquantes restent INCONNUES hors ligne.",
    saved: "Cellules enregistrées",
    missing: "Cellules INCONNUES",
  },
} as const;

export interface PressureView {
  readonly message: string;
  readonly details: string;
  readonly action: string;
  readonly disabled: boolean;
}

/** Pure presentation function, shared by browser renderer and unit tests. */
export function pressureView(state: PressureState, language: Language): PressureView {
  const copy = PRESSURE_COPY[language];
  if (state.phase === "working") {
    return { message: copy.working, details: "", action: copy.retry, disabled: true };
  }
  if (state.phase === "idle") {
    return { message: "", details: "", action: copy.start, disabled: false };
  }
  const result = state.result;
  if (result === null) {
    return { message: copy.error, details: "", action: copy.retry, disabled: false };
  }
  const message = result.completed ? copy.complete : result.reason === "quota" ? copy.quota :
    result.reason === "interrupted" ? copy.interrupted : copy.error;
  const separator = language === "fr" ? "\u00a0:" : ":";
  const details = `${copy.saved}${separator} ${result.available.length}. ${copy.missing}${separator} ${result.missing.length}.` +
    (result.missing.length > 0 ? ` ${copy.partial}` : "");
  return { message, details, action: copy.retry, disabled: result.completed };
}

export interface PressureController {
  readonly getState: () => PressureState;
  readonly retry: () => Promise<DownloadResult | null>;
  readonly subscribe: (listener: (state: PressureState) => void) => () => void;
  readonly dispose: () => void;
}

/** Serialises retries and ensures late resolutions cannot update a disposed view. */
export function createPressureController(
  manifest: RegionManifest,
  dependencies: DownloadDependencies,
): PressureController {
  let state: PressureState = { phase: "idle", result: null };
  let pending: Promise<DownloadResult | null> | null = null;
  let disposed = false;
  const listeners = new Set<(next: PressureState) => void>();
  const publish = (next: PressureState): void => {
    if (disposed) return;
    state = next;
    for (const listener of listeners) listener(next);
  };
  return {
    getState: () => state,
    subscribe(listener) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    retry() {
      if (disposed) return Promise.resolve(null);
      if (pending) return pending;
      if (state.phase === "stopped" && state.result.completed) return Promise.resolve(state.result);
      publish({ phase: "working", result: null });
      const task = downloadRegion(manifest, dependencies)
        .then((result) => {
          publish({ phase: "stopped", result });
          return disposed ? null : result;
        })
        .catch(() => {
          // Manifest or store errors must not be mistaken for a completed region.
          const result: DownloadResult = {
            regionId: manifest.regionId,
            available: [],
            missing: manifest.cells.map((cell) => cell.id),
            completed: false,
            reason: "download-error",
          };
          publish({ phase: "stopped", result });
          return disposed ? null : result;
        })
        .finally(() => { pending = null; });
      pending = task;
      return task;
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}

/**
 * Explicit opt-in UI: hosts mount this panel beside their offline download control.
 * The host is responsible for first-party fetching and open-licence data selection.
 */
export function mountStoragePressurePanel(
  root: HTMLElement,
  manifest: RegionManifest,
  dependencies: DownloadDependencies,
  language: Language,
): () => void {
  return mountOfflineDashboard(root, manifest, dependencies, language);
}
