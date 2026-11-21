import { downloadRegion, type DownloadDependencies, type DownloadResult, type Language, type RegionManifest } from "./regionDownload";

/** User-facing download state. Cells not downloaded are named as such, never as available and never as UNKNOWN. */
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
    partial: "Cells not downloaded are not available offline.",
    saved: "Saved cells",
    missing: "Cells not downloaded",
  },
  fr: {
    start: "Télécharger la région",
    retry: "Réessayer les cellules manquantes",
    working: "Téléchargement des cellules manquantes…",
    complete: "Toutes les cellules répertoriées sont enregistrées hors ligne.",
    quota: "L’espace de stockage est insuffisant. Libérez de l’espace, puis réessayez les cellules manquantes.",
    interrupted: "Téléchargement interrompu. Réessayez les cellules manquantes.",
    error: "Téléchargement arrêté. Réessayez les cellules manquantes.",
    partial: "Les cellules non téléchargées ne sont pas disponibles hors ligne.",
    saved: "Cellules enregistrées",
    missing: "Cellules non téléchargées",
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
  if (state.phase !== "stopped" || state.result === null) {
    return { message: "", details: "", action: copy.start, disabled: false };
  }
  const result: DownloadResult = state.result;
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
 * The full offline dashboard owns several substantial optional subpanels.
 * Load them as a separate chunk only when this view is mounted, keeping the
 * public synchronous teardown contract and preventing a late mount after exit.
 */
export function mountStoragePressurePanel(
  root: HTMLElement,
  manifest: RegionManifest,
  dependencies: DownloadDependencies,
  language: Language,
): () => void {
  let disposed = false;
  let unmount: (() => void) | null = null;
  const status = root.ownerDocument.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = language === "fr" ? "Chargement des renseignements hors ligne…" : "Loading offline details…";
  root.append(status);
  void import("./offlineDashboard").then(({ mountOfflineDashboard }) => {
    if (disposed) return;
    unmount = mountOfflineDashboard(root, manifest, dependencies, language);
    status.remove();
  }).catch(() => {
    if (disposed) return;
    status.textContent = language === "fr"
      ? "Les renseignements hors ligne sont indisponibles. État UNKNOWN."
      : "Offline details are unavailable. Status UNKNOWN.";
  });
  return () => {
    disposed = true;
    unmount?.();
    status.remove();
  };
}
