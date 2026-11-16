import type { Locale } from "./copyLint";
import { assertValidInventory, type InventoryEntry } from "./inventory";
import { eraseLocalData, exportLocalData, listKeys, type ExportFile } from "./localData";
import { renderPrivacyPanelHtml } from "./panel";
import { detectLocale, loadPrefs, savePrefs, type PrivacyPrefs } from "./preferences";
import type { Status } from "./strings";
import type { StorageLike } from "./storage";

export interface ControllerDeps {
  /** null when the browser does not allow storage */
  storage: StorageLike | null;
  /** Every key the App writes starts with this. Export and erase act on it only. */
  prefix: string;
  inventory: readonly InventoryEntry[];
  now: () => Date;
  reviewedOn?: string;
  /** e.g. navigator.languages, used only when no preference is stored */
  languages?: readonly string[];
}

export interface PrivacyState {
  prefs: PrivacyPrefs;
  confirmingErase: boolean;
  status: Status | null;
  lastExport: ExportFile | null;
}

export type PrivacyAction =
  | { type: "export" }
  | { type: "erase-ask" }
  | { type: "erase-cancel" }
  | { type: "erase-confirm" }
  | { type: "set-locale"; locale: Locale };

export interface PrivacyController {
  getState(): PrivacyState;
  dispatch(action: PrivacyAction): PrivacyState;
  html(): string;
}

/** Throws at start-up if the inventory breaks the wording or data rules. */
export function createPrivacyController(deps: ControllerDeps): PrivacyController {
  assertValidInventory(deps.inventory);
  const initial: PrivacyPrefs =
    loadPrefs(deps.storage, deps.prefix) ?? { locale: detectLocale(deps.languages ?? []) };
  let state: PrivacyState = { prefs: initial, confirmingErase: false, status: null, lastExport: null };

  const unavailable = (): PrivacyState => ({
    ...state,
    confirmingErase: false,
    status: { kind: "unavailable" },
    lastExport: null,
  });

  function dispatch(action: PrivacyAction): PrivacyState {
    const storage = deps.storage;
    switch (action.type) {
      case "set-locale": {
        const prefs: PrivacyPrefs = { locale: action.locale };
        savePrefs(storage, deps.prefix, prefs);
        state = { ...state, prefs };
        break;
      }
      case "export": {
        if (storage === null) {
          state = unavailable();
          break;
        }
        const file = exportLocalData(storage, deps.prefix, deps.now(), state.prefs.locale);
        state =
          file.count === 0
            ? { ...state, confirmingErase: false, status: { kind: "nothing" }, lastExport: null }
            : { ...state, confirmingErase: false, status: { kind: "exported", count: file.count }, lastExport: file };
        break;
      }
      case "erase-ask": {
        if (storage === null) {
          state = unavailable();
        } else if (listKeys(storage, deps.prefix).length === 0) {
          state = { ...state, confirmingErase: false, status: { kind: "nothing" }, lastExport: null };
        } else {
          state = { ...state, confirmingErase: true, status: null, lastExport: null };
        }
        break;
      }
      case "erase-cancel":
        state = { ...state, confirmingErase: false, status: null, lastExport: null };
        break;
      case "erase-confirm": {
        if (storage === null) {
          state = unavailable();
          break;
        }
        const r = eraseLocalData(storage, deps.prefix);
        const status: Status =
          r.failed.length > 0
            ? { kind: "erase-partial", failed: r.failed.length }
            : r.removed === 0
              ? { kind: "nothing" }
              : { kind: "erased", count: r.removed };
        state = { ...state, confirmingErase: false, status, lastExport: null };
        break;
      }
    }
    return state;
  }

  return {
    getState: () => state,
    dispatch,
    html: () =>
      renderPrivacyPanelHtml({
        locale: state.prefs.locale,
        inventory: deps.inventory,
        ...(deps.reviewedOn !== undefined ? { reviewedOn: deps.reviewedOn } : {}),
        confirmingErase: state.confirmingErase,
        status: state.status,
      }),
  };
}
