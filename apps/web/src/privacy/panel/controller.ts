import { loadActivity, recordActivity, type ActivityEntry } from "./activityLog";
import { diffInventory, loadSeen, saveSeen, snapshot, type ChangesView } from "./changes";
import { assertValidPurposes, loadConsent, saveConsent, setConsent, type ConsentState, type Purpose } from "./consent";
import type { Locale } from "./copyLint";
import { purgeExpired } from "./expiry";
import { assertValidInventory, type InventoryEntry } from "./inventory";
import { inventoryAsCsv, inventoryAsText } from "./inventoryExport";
import { ownEntries } from "./ownEntries";
import { reconcile } from "./reconcile";
import { buildPrintable } from "./printable";
import { buildSupportSummary } from "./supportSummary";
import { applyImport, prepareImport, type ImportPlan } from "./importData";
import { loadBlocked } from "./egressLog";
import type { EgressPolicy } from "./egress";
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
  /** Keep a visible, local list of the person's privacy actions. Default off. */
  logActivity?: boolean;
  /** Show what changed in the data list since it was last marked as seen. Default off. */
  trackChanges?: boolean;
  /**
   * Show the network section: the addresses the App may contact and the requests
   * that were stopped. Install the guard itself with installPersistentGuard
   * (or the `guard` option of installPrivacyRoute).
   */
  egress?: EgressPolicy;
  /** e.g. navigator.languages, used only when no preference is stored */
  languages?: readonly string[];
}

export interface PrivacyState {
  prefs: PrivacyPrefs;
  confirmingErase: boolean;
  status: Status | null;
  lastExport: ExportFile | null;
  consent: ConsentState;
  /** null when change tracking is off */
  changes: ChangesView | null;
  /** true while a file has been checked and is waiting for the person to confirm */
  importPending: boolean;
}

export type PrivacyAction =
  | { type: "export" }
  | { type: "erase-ask" }
  | { type: "erase-cancel" }
  | { type: "erase-confirm" }
  | { type: "set-locale"; locale: Locale }
  | { type: "consent"; purposeId: string; value: "granted" | "declined" }
  | { type: "export-list-csv" }
  | { type: "export-list-text" }
  | { type: "mark-seen" }
  | { type: "import-load"; text: string }
  | { type: "import-confirm" }
  | { type: "import-cancel" }
  | { type: "export-support" }
  | { type: "export-printable" };

export interface PrivacyController {
  getState(): PrivacyState;
  dispatch(action: PrivacyAction): PrivacyState;
  /** Called after every dispatch. Returns a function that stops the calls. */
  subscribe(listener: (state: PrivacyState) => void): () => void;
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
  const inventory: readonly InventoryEntry[] = [
    ...deps.inventory,
    ...ownEntries({ consent: purposes.length > 0, activity: deps.logActivity === true, changes: deps.trackChanges === true, egress: deps.egress !== undefined }),
  ];
  assertValidInventory(inventory, { allowReservedIds: true });
  const today = (): string => {
    const d = deps.now();
    const p = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const log = (entry: Omit<ActivityEntry, "at">): void => {
    if (deps.logActivity === true) recordActivity(deps.storage, deps.prefix, entry, deps.now());
  };
  const listeners = new Set<(s: PrivacyState) => void>();
  const initial: PrivacyPrefs =
    loadPrefs(deps.storage, deps.prefix) ?? { locale: detectLocale(deps.languages ?? []) };
  const purged = deps.storage === null ? 0 : purgeExpired(deps.storage, deps.prefix, deps.now()).purged.length;
  let changes: ChangesView | null = null;
  if (deps.trackChanges === true) {
    const seen = loadSeen(deps.storage, deps.prefix, deps.now());
    changes = diffInventory(seen, inventory);
    if (seen === null) saveSeen(deps.storage, deps.prefix, snapshot(inventory, today()), deps.now());
  }
  if (purged > 0) log({ kind: "expired-removed", count: purged });
  let state: PrivacyState = {
    prefs: initial,
    confirmingErase: false,
    status: purged > 0 ? { kind: "expired-removed", count: purged } : null,
    lastExport: null,
    consent: loadConsent(deps.storage, deps.prefix, purposes),
    changes,
    importPending: false,
  };
  let plan: ImportPlan | null = null;

  const unavailable = (): PrivacyState => {
    plan = null;
    return unavailableState();
  };
  const unavailableState = (): PrivacyState => ({
    ...state,
    confirmingErase: false,
    status: { kind: "unavailable" },
    lastExport: null,
    importPending: false,
  });
  const stored = (): ReturnType<typeof reconcile> => reconcile(deps.storage, deps.prefix, inventory);
  const blockedNow = (): ReturnType<typeof loadBlocked> =>
    deps.egress === undefined ? { hosts: [] } : loadBlocked(deps.storage, deps.prefix, deps.now());

  function dispatch(action: PrivacyAction): PrivacyState {
    const storage = deps.storage;
    switch (action.type) {
      case "set-locale": {
        if (action.locale !== state.prefs.locale) log({ kind: "language", lang: action.locale });
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
        log({ kind: action.value === "granted" ? "consent-granted" : "consent-declined", purposeId: purpose.id });
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
        if (file.count > 0) log({ kind: "export", count: file.count });
        state =
          file.count === 0
            ? { ...state, confirmingErase: false, status: { kind: "nothing" }, lastExport: null }
            : { ...state, confirmingErase: false, status: { kind: "exported", count: file.count }, lastExport: file };
        break;
      }
      case "export-list-csv":
      case "export-list-text": {
        const csv = action.type === "export-list-csv";
        const loc = state.prefs.locale;
        const file = csv
          ? inventoryAsCsv(loc, inventory, deps.now(), loc === "fr" ? ";" : ",")
          : inventoryAsText(loc, inventory, deps.now(), deps.reviewedOn);
        log({ kind: "list-export", format: csv ? "csv" : "text" });
        state = {
          ...state,
          confirmingErase: false,
          lastExport: file,
          status: { kind: "list-exported", format: csv ? "csv" : "text" },
        };
        break;
      }
      case "mark-seen": {
        if (deps.trackChanges !== true) break;
        saveSeen(storage, deps.prefix, snapshot(inventory, today()), deps.now());
        state = {
          ...state,
          confirmingErase: false,
          lastExport: null,
          changes: { kind: "none", seenOn: today() },
          status: { kind: "seen-saved" },
        };
        break;
      }
      case "export-support":
      case "export-printable": {
        const loc = state.prefs.locale;
        const support = action.type === "export-support";
        const file = support
          ? buildSupportSummary({
              locale: loc,
              now: deps.now(),
              stored: stored(),
              inventoryCount: inventory.length,
              purposes,
              consent: state.consent,
              activity: deps.logActivity === true ? loadActivity(storage, deps.prefix, deps.now()) : [],
              blocked: blockedNow(),
            })
          : buildPrintable({
              locale: loc,
              now: deps.now(),
              inventory,
              stored: stored(),
              ...(deps.reviewedOn !== undefined ? { reviewedOn: deps.reviewedOn } : {}),
            });
        log({ kind: support ? "support-export" : "printable-export" });
        state = {
          ...state,
          confirmingErase: false,
          importPending: false,
          lastExport: file,
          status: { kind: support ? "support-prepared" : "printable-prepared" },
        };
        plan = null;
        break;
      }
      case "import-load": {
        plan = null;
        if (storage === null) {
          state = unavailable();
          break;
        }
        const r = prepareImport(action.text, storage, deps.prefix);
        if (!r.ok) {
          state = { ...state, confirmingErase: false, importPending: false, lastExport: null, status: { kind: "import-problem", code: r.code } };
          break;
        }
        plan = r.plan;
        state = {
          ...state,
          confirmingErase: false,
          importPending: true,
          lastExport: null,
          status: {
            kind: "import-ready",
            additions: r.plan.additions.length,
            overwrites: r.plan.overwrites.length,
            unchanged: r.plan.unchanged.length,
          },
        };
        break;
      }
      case "import-cancel":
        plan = null;
        state = { ...state, importPending: false, lastExport: null, status: { kind: "import-cancelled" } };
        break;
      case "import-confirm": {
        const p = plan;
        plan = null;
        if (storage === null) {
          state = unavailable();
          break;
        }
        if (p === null) {
          state = { ...state, importPending: false, status: null };
          break;
        }
        const r = applyImport(storage, p);
        if (r.failed.length > 0) {
          state = {
            ...state,
            importPending: false,
            lastExport: null,
            status: r.rolledBack ? { kind: "import-rolled-back" } : { kind: "import-stuck", failed: r.restoreFailed.length },
          };
          break;
        }
        purgeExpired(storage, deps.prefix, deps.now());
        log({ kind: "import", count: r.written });
        const restored = loadPrefs(storage, deps.prefix);
        state = {
          ...state,
          prefs: restored ?? state.prefs,
          consent: loadConsent(storage, deps.prefix, purposes),
          importPending: false,
          lastExport: null,
          status: { kind: "import-done", count: r.written },
        };
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
        plan = null;
        const r = eraseLocalData(storage, deps.prefix);
        const status: Status =
          r.failed.length > 0
            ? { kind: "erase-partial", failed: r.failed.length }
            : r.removed === 0
              ? { kind: "nothing" }
              : { kind: "erased", count: r.removed };
        state = {
          ...state,
          confirmingErase: false,
          status,
          lastExport: null,
          consent: {},
          importPending: false,
          changes: deps.trackChanges === true ? { kind: "first-view" } : null,
        };
        break;
      }
    }
    for (const l of listeners) l(state);
    return state;
  }

  return {
    getState: () => state,
    dispatch,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    html: () =>
      renderPrivacyPanelHtml({
        locale: state.prefs.locale,
        inventory,
        stored: stored(),
        ...(deps.egress !== undefined
          ? { network: { selfOrigin: deps.egress.selfOrigin, allowedOrigins: deps.egress.allowedOrigins, blocked: blockedNow() } }
          : {}),
        importPending: state.importPending,
        ...(deps.logActivity === true ? { activity: loadActivity(deps.storage, deps.prefix, deps.now()) } : {}),
        ...(state.changes !== null ? { changes: state.changes } : {}),
        purposes,
        consent: state.consent,
        ...(deps.reviewedOn !== undefined ? { reviewedOn: deps.reviewedOn } : {}),
        confirmingErase: state.confirmingErase,
        status: state.status,
      }),
  };
}
