import { assertValidPurposes, loadConsent, saveConsent, setConsent, type ConsentState, type Purpose } from "./consent";
import type { Locale } from "./copyLint";
import { purgeExpired } from "./expiry";
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
  /** Optional features the person can allow. Empty or omitted hides the section. */
  purposes?: readonly Purpose[];
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
  consent: ConsentState;
}

export type PrivacyAction =
  | { type: "export" }
  | { type: "erase-ask" }
  | { type: "erase-cancel" }
  | { type: "erase-confirm" }
  | { type: "set-locale"; locale: Locale }
  | { type: "consent"; purposeId: string; value: "granted" | "declined" };

export interface PrivacyController {
  getState(): PrivacyState;
  dispatch(action: PrivacyAction): PrivacyState;
  html(): string;
}

/**
 * Throws at start-up if the inventory or the purposes break the wording or data
 * rules. On start it also removes expired local items (see expiry.ts).
 */
export function createPrivacyController(deps: ControllerDeps): PrivacyController {
  assertValidInventory(deps.inventory);
  const purposes = deps.purposes ?? [];
  assertValidPurposes(purposes);
  const initial: PrivacyPrefs =
    loadPrefs(deps.storage, deps.prefix) ?? { locale: detectLocale(deps.languages ?? []) };
  const purged = deps.storage === null ? 0 : purgeExpired(deps.storage, deps.prefix, deps.now()).purged.length;
  let state: PrivacyState = {
    prefs: initial,
    confirmingErase: false,
    status: purged > 0 ? { kind: "expired-removed", count: purged } : null,
    lastExport: null,
    consent: loadConsent(deps.storage, deps.prefix, purposes),
  };

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
      case "consent": {
        const purpose = purposes.find((p) => p.id === action.purposeId);
        if (purpose === undefined) break;
        const consent = setConsent(state.consent, purpose, action.value, deps.now());
        const saved = saveConsent(storage, deps.prefix, consent);
        state = {
          ...state,
          consent,
          confirmingErase: false,
          lastExport: null,
          status: saved
            ? { kind: "consent-saved", value: action.value, label: purpose.label[state.prefs.locale] }
            : { kind: "save-failed" },
        };
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
        state = { ...state, confirmingErase: false, status, lastExport: null, consent: {} };
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
        purposes,
        consent: state.consent,
        ...(deps.reviewedOn !== undefined ? { reviewedOn: deps.reviewedOn } : {}),
        confirmingErase: state.confirmingErase,
        status: state.status,
      }),
  };
}
