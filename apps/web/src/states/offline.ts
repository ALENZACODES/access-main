/**
 * Offline awareness. Pure state machine plus a thin monitor over browser events.
 * The banner states what is shown and when it was saved; it never implies the
 * information is current.
 */
import { type Locale, MIN_TOUCH_TARGET_PX, type StateAction } from "./stateCopy";
import { formatDate, isIsoDate } from "./provenance";
import { t } from "./typography";

export type Connectivity = "online" | "offline";

export interface ConnectivityState {
  readonly status: Connectivity;
  /** ISO date of the last successful save of data on this device, or null. */
  readonly lastSavedOn: string | null;
}

export type ConnectivityEvent =
  | { readonly type: "online" }
  | { readonly type: "offline" }
  | { readonly type: "saved"; readonly on: string };

export const initialConnectivity = (online: boolean): ConnectivityState => ({
  status: online ? "online" : "offline",
  lastSavedOn: null,
});

export function connectivityReducer(state: ConnectivityState, event: ConnectivityEvent): ConnectivityState {
  switch (event.type) {
    case "online":
      return state.status === "online" ? state : { ...state, status: "online" };
    case "offline":
      return state.status === "offline" ? state : { ...state, status: "offline" };
    case "saved":
      return isIsoDate(event.on) ? { ...state, lastSavedOn: event.on } : state;
  }
}

export interface OfflineBanner {
  readonly role: "status";
  readonly title: string;
  readonly description: string;
  readonly actions: readonly StateAction[];
}

/** Banner to show while offline, or null while online. */
export function offlineBanner(state: ConnectivityState, locale: Locale): OfflineBanner | null {
  if (state.status === "online") return null;
  const saved = state.lastSavedOn;
  const description = saved
    ? t(
        locale,
        `Showing information saved on this device on ${formatDate(saved, locale)}.`,
        `Affichage des renseignements enregistrés sur cet appareil le ${formatDate(saved, locale)}.`,
      )
    : t(
        locale,
        "No information is saved on this device yet.",
        "Aucun renseignement n'est encore enregistré sur cet appareil.",
      );
  return {
    role: "status",
    title: t(locale, "You are offline", "Vous êtes hors ligne"),
    description,
    actions: [
      { id: "retry", label: t(locale, "Try again", "Réessayer"), minTargetPx: MIN_TOUCH_TARGET_PX },
    ],
  };
}

/** The slice of window/EventTarget the monitor needs (so tests can fake it). */
export interface ConnectivityTarget {
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
}

/**
 * Subscribe to connectivity changes. Returns an unsubscribe function.
 * `onChange` is called once immediately with the current state.
 */
export function createConnectivityMonitor(
  target: ConnectivityTarget,
  isOnline: () => boolean,
  onChange: (state: ConnectivityState) => void,
  lastSavedOn: string | null = null,
): () => void {
  let state: ConnectivityState = { ...initialConnectivity(isOnline()), lastSavedOn };
  const dispatch = (e: ConnectivityEvent): void => {
    const next = connectivityReducer(state, e);
    if (next !== state) {
      state = next;
      onChange(state);
    }
  };
  const goOnline = (): void => dispatch({ type: "online" });
  const goOffline = (): void => dispatch({ type: "offline" });
  target.addEventListener("online", goOnline);
  target.addEventListener("offline", goOffline);
  onChange(state);
  return () => {
    target.removeEventListener("online", goOnline);
    target.removeEventListener("offline", goOffline);
  };
}
