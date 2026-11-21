import { loadActivity, recordActivity, type ActivityEntry } from "./activityLog";
import { diffInventory, loadSeen, saveSeen, snapshot, type ChangesView } from "./changes";
import type { OutsideItem } from "./outsideSection";
import { removeForPurpose, type GateRule, type RefusedWrite } from "./consentGate";
import { assertValidPurposes, loadConsent, saveConsent, setConsent, type ConsentState, type Purpose } from "./consent";
import type { Locale } from "./copyLint";
import { purgeExpired } from "./expiry";
import { assertValidInventory, type InventoryEntry } from "./inventory";
import { inventoryAsCsv, inventoryAsText } from "./inventoryExport";
import { ownEntries } from "./ownEntries";
import { reconcile } from "./reconcile";
import { describeDevice, type DeviceRow } from "./deviceRegister";
import type { AddressRegisterView } from "./addressView";
import type { FeatureRow } from "./featureRegister";
import { featuresAsCsv, featuresAsText } from "./featureExport";
import { addressesAsCsv, addressesAsText } from "./addressExport";
import { glanceAsCsv, glanceAsText } from "./glanceSection";
import { receiptRows, type ReceiptRow } from "./receipt";
import { checkStatements, type StatementResult, type StatementRow } from "./statementRegister";
import { statementsAsCsv, statementsAsText } from "./statementSection";
import { receiptAsCsv, receiptAsText } from "./receiptSection";
import type { HandoffRow } from "./handoffRegister";
import { handoffAsCsv, handoffAsText } from "./handoffSection";
import type { BrowserRow } from "./browserRegister";
import { BROWSER_QUESTIONS, browserCheck, readBrowser, type BrowserCheckView, type BrowserHost } from "./browserLive";
import { browserAsCsv, browserAsText } from "./browserSection";
import type { RetentionRow } from "./retentionRegister";
import { comparedCount, checkStored } from "./retentionLive";
import { retentionAsCsv, retentionAsText, type RetentionCheckView } from "./retentionSection";
import type { QueryRow } from "./queryRegister";
import { checkAddress, type AddressCheck } from "./queryLive";
import { queryAsCsv, queryAsText } from "./querySection";
import { glanceFigures, type GlanceSources } from "./glance";
import { readFeatureStates, type FeatureHost, type FeatureStates } from "./permissions";
import { keptAsCsv, keptAsText, type KeptSources } from "./keptExport";
import { clearDevice, removable, scanDevice, type ClearOptions, type DeviceHost, type DeviceScan } from "./deviceStorage";
import { protect, unprotect, passphraseProblem, type CryptoLike } from "./protectedBackup";
import { readSignals, type SignalHost, type Signals } from "./signals";
import { buildPrintable } from "./printable";
import { buildSupportSummary } from "./supportSummary";
import { applyImport, prepareImport, type ImportPlan } from "./importData";
import { loadBlocked } from "./egressLog";
import type { EgressPolicy } from "./egress";
import { assertScope, scopeKeysPresent, type DataScope } from "./dataScope";
import { eraseLocalData, exportLocalData, type ExportFile } from "./localData";
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
  /** Where to read the writes the consent gate stopped (for example `() => gate.refused()`). Omit to hide that section. */
  refused?: () => readonly RefusedWrite[];
  /**
   * The consent gate's rules. When given, saying "do not allow" also removes what that
   * feature already saved on this device, and the status says how many items went.
   * Omit to keep the data and only stop new saves.
   */
  withdrawRules?: readonly GateRule[];
  /**
   * Exact names outside `prefix` that Download, Erase and Restore also cover (for example
   * `app.preferences.v1`). They must not start with `prefix`. Omit to cover the prefix only.
   */
  extraKeys?: readonly string[];
  /** What the App keeps outside this panel's prefix. Shown as a plain list so the person knows Erase does not reach it. Omit to hide it. */
  outside?: readonly OutsideItem[];
  /** The App's own list of caches and databases. With `device`, the panel says what each name found on the device is. */
  deviceRegister?: readonly DeviceRow[];
  /** The App's list of browser features and the browser to ask. With it, the panel shows what the App asks of the browser. */
  features?: { register: readonly FeatureRow[]; host: FeatureHost };
  /** The web addresses and network requests in the App. With it, the panel shows them and offers a download. */
  addresses?: AddressRegisterView;
  /** Show a short count of each list above. Needs at least one of the lists above to have something to count. */
  glance?: boolean;
  /** Where the App says data stays on the device or is not sent. Checked against `addresses`; without it, every row is shown as not checked. */
  statements?: readonly StatementRow[];
  /** Show the record of the person's choices, with a download. Needs `purposes`. Pass `register` through `kept` to list what each choice lets the App save. */
  receipt?: boolean;
  /** The links in the App that open another app. With it, the panel lists them and offers a download. */
  handoffs?: readonly HandoffRow[];
  /** What the App keeps, for how long and how much, as read from its code. With it, the panel shows the list and offers a download. */
  retention?: readonly RetentionRow[];
  /** The places in the App that ask the browser about the device or settings, and the browser to ask now. With it, the panel shows the list, offers a download and can ask. */
  browser?: { register: readonly BrowserRow[]; host: BrowserHost };
  /** The names the App reads from and builds into a web address. With it, the panel lists them and offers a download. */
  queries?: readonly QueryRow[];
  /** Reads the part of this page's address after the question mark, for example `() => window.location.search`. With it and `queries`, the panel can examine the address. Nothing is stored or changed. */
  address?: () => string;
  /** The App's lists of what it keeps. With them, the panel offers a download of everything kept on this device. */
  kept?: Pick<KeptSources, "register" | "unscanned">;
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
  /** Show the browser signals section. Pass `window`. */
  signals?: SignalHost;
  /** Show the offline storage section. Removal is offered only for names that start with a prefix given here. */
  device?: { host: DeviceHost } & ClearOptions;
  /** Offer protected copies (passphrase). Pass `crypto`. */
  crypto?: CryptoLike;
  /** PBKDF2 iterations for new protected copies. Default 310,000. Lower values are for tests only. */
  protectedIterations?: number;
  /** Lowest iteration count accepted when opening. Default 100,000. Lower values are for tests only. */
  minProtectedIterations?: number;
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
  /** null until read, or when the section is off */
  signals: Signals | null;
  scan: DeviceScan | null;
  /** The browser's answers about features, or null before the check */
  featureStates: FeatureStates | null;
  /** What comparing the retention list with the stored values found, or null before the person asks */
  retentionCheck: RetentionCheckView | null;
  /** What the browser said when asked, or null before the person asks */
  browserCheck: BrowserCheckView | null;
  /** What reading the address of this page found, or null before the person asks */
  queryCheck: AddressCheck | null;
  confirmingClearDevice: boolean;
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
  | { type: "export-kept-csv" }
  | { type: "export-kept-text" }
  | { type: "export-features-csv" }
  | { type: "export-features-text" }
  | { type: "export-addresses-csv" }
  | { type: "export-addresses-text" }
  | { type: "export-glance-csv" }
  | { type: "export-glance-text" }
  | { type: "export-receipt-csv" }
  | { type: "export-receipt-text" }
  | { type: "export-handoff-csv" }
  | { type: "export-handoff-text" }
  | { type: "check-retention" }
  | { type: "check-query" }
  | { type: "export-query-csv" }
  | { type: "export-query-text" }
  | { type: "export-browser-csv" }
  | { type: "export-browser-text" }
  | { type: "export-retention-csv" }
  | { type: "export-retention-text" }
  | { type: "export-statements-csv" }
  | { type: "export-statements-text" }
  | { type: "mark-seen" }
  | { type: "import-load"; text: string }
  | { type: "import-confirm" }
  | { type: "import-cancel" }
  | { type: "export-support" }
  | { type: "export-printable" }
  | { type: "clear-device-ask" }
  | { type: "clear-device-cancel" }
  /** Used by dispatchAsync. Shows a status and nothing else. */
  | { type: "report"; status: Status }
  | { type: "publish"; file: ExportFile; status: Status }
  | { type: "signals-read"; signals: Signals }
  | { type: "device-scanned"; scan: DeviceScan }
  | { type: "features-read"; states: FeatureStates }
  | { type: "browser-read"; check: BrowserCheckView };

/** Actions that wait for the browser. Passphrases are used once and never kept. */
export type PrivacyAsyncAction =
  | { type: "read-signals" }
  | { type: "scan-device" }
  | { type: "check-features" }
  | { type: "check-browser" }
  | { type: "clear-device-confirm" }
  | { type: "protected-export"; passphrase: string; confirm: string }
  | { type: "protected-import"; text: string; passphrase: string };

export interface PrivacyController {
  getState(): PrivacyState;
  dispatch(action: PrivacyAction): PrivacyState;
  dispatchAsync(action: PrivacyAsyncAction): Promise<PrivacyState>;
  /** Called after every dispatch. Returns a function that stops the calls. */
  subscribe(listener: (state: PrivacyState) => void): () => void;
  html(): string;
}

/**
 * Throws at start-up if the inventory or the purposes break the wording or data
 * rules. On start it also removes expired local items (see expiry.ts).
 */
/** The statement rows set beside the places that make requests, or null when none were given. */
function statementsFor(deps: ControllerDeps): StatementResult[] | null {
  if (deps.statements === undefined || deps.statements.length === 0) return null;
  return checkStatements(deps.statements, deps.addresses === undefined ? null : deps.addresses.calls);
}

/** What the counts are made from: only the lists the controller was given. Null when there is nothing to count. */
function glanceSources(deps: ControllerDeps): GlanceSources | null {
  if (deps.glance !== true) return null;
  const src: GlanceSources = {
    ...(deps.kept !== undefined ? { kept: deps.kept } : {}),
    ...(deps.deviceRegister !== undefined ? { device: deps.deviceRegister } : {}),
    ...(deps.features !== undefined ? { features: deps.features.register } : {}),
    ...(deps.addresses !== undefined ? { addresses: deps.addresses } : {}),
    ...(statementsFor(deps) !== null ? { statements: statementsFor(deps) as StatementResult[] } : {}),
  };
  return glanceFigures(src).length === 0 ? null : src;
}

/** The names stored on this device now. Empty when the browser blocks storage. */
function storedKeys(storage: StorageLike | null): string[] {
  const keys: string[] = [];
  if (storage === null) return keys;
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k !== null) keys.push(k);
  }
  return keys;
}

/** The rows of the record of choices, or null when it is off or there are no purposes. */
function receiptFor(deps: ControllerDeps, consent: ConsentState): ReceiptRow[] | null {
  if (deps.receipt !== true || (deps.purposes ?? []).length === 0) return null;
  return receiptRows({
    purposes: deps.purposes ?? [],
    rules: deps.withdrawRules ?? [],
    consent,
    ...(deps.kept !== undefined ? { register: deps.kept.register } : {}),
    keys: storedKeys(deps.storage),
    removesOnNo: deps.withdrawRules !== undefined,
  });
}

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
    signals: null,
    scan: null,
    featureStates: null,
    retentionCheck: null,
    browserCheck: null,
    queryCheck: null,
    confirmingClearDevice: false,
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
    confirmingClearDevice: false,
  });
  const scope: DataScope = { prefix: deps.prefix, keys: deps.extraKeys ?? [] };
  assertScope(scope);
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
        // A file waiting to be restored was checked before this choice. Restoring it afterwards could put back
        // what a "do not allow" has just removed, so the person is asked to load the file again.
        plan = null;
        const consent = setConsent(state.consent, purpose, action.value, deps.now());
        const saved = saveConsent(storage, deps.prefix, consent);
        log({ kind: action.value === "granted" ? "consent-granted" : "consent-declined", purposeId: purpose.id });
        const removed =
          saved && action.value === "declined" && storage !== null && deps.withdrawRules !== undefined
            ? removeForPurpose(storage, deps.withdrawRules, purpose.id).length
            : 0;
        state = {
          ...state,
          consent,
          confirmingErase: false,
          importPending: false,
          lastExport: null,
          status: removed > 0
            ? { kind: "consent-withdrawn", label: purpose.label[state.prefs.locale], removed }
            : saved
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
        const file = exportLocalData(storage, scope, deps.now(), state.prefs.locale);
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
      case "export-kept-csv":
      case "export-kept-text": {
        const kept = deps.kept;
        if (kept === undefined) break;
        const csv = action.type === "export-kept-csv";
        const loc = state.prefs.locale;
        const src = { ...kept, ...(deps.device !== undefined ? { clear: deps.device } : {}), ...(deps.deviceRegister !== undefined ? { device: deps.deviceRegister } : {}) };
        const file = csv ? keptAsCsv(loc, src, deps.now(), loc === "fr" ? ";" : ",") : keptAsText(loc, src, deps.now());
        log({ kind: "kept-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "kept-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "export-features-csv":
      case "export-features-text": {
        if (deps.features === undefined) break;
        const csv = action.type === "export-features-csv";
        const loc = state.prefs.locale;
        const file = csv
          ? featuresAsCsv(loc, deps.features.register, state.featureStates, deps.now(), loc === "fr" ? ";" : ",")
          : featuresAsText(loc, deps.features.register, state.featureStates, deps.now());
        log({ kind: "features-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "features-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "export-addresses-csv":
      case "export-addresses-text": {
        if (deps.addresses === undefined) break;
        const csv = action.type === "export-addresses-csv";
        const loc = state.prefs.locale;
        const file = csv ? addressesAsCsv(loc, deps.addresses, deps.now(), loc === "fr" ? ";" : ",") : addressesAsText(loc, deps.addresses, deps.now());
        log({ kind: "addresses-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "addresses-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "export-glance-csv":
      case "export-glance-text": {
        const src = glanceSources(deps);
        if (src === null) break;
        const csv = action.type === "export-glance-csv";
        const loc = state.prefs.locale;
        const file = csv ? glanceAsCsv(loc, src, deps.now(), loc === "fr" ? ";" : ",") : glanceAsText(loc, src, deps.now());
        log({ kind: "glance-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "glance-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "export-handoff-csv":
      case "export-handoff-text": {
        if (deps.handoffs === undefined || deps.handoffs.length === 0) break;
        const csv = action.type === "export-handoff-csv";
        const loc = state.prefs.locale;
        const file = csv ? handoffAsCsv(loc, deps.handoffs, deps.now(), loc === "fr" ? ";" : ",") : handoffAsText(loc, deps.handoffs, deps.now());
        log({ kind: "handoff-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "handoff-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "check-retention": {
        if (deps.retention === undefined || deps.retention.length === 0) break;
        if (storage === null) {
          state = unavailable();
          break;
        }
        const findings = checkStored(storage, deps.retention, deps.now());
        const compared = comparedCount(storage, deps.retention);
        state = { ...state, confirmingErase: false, lastExport: null, retentionCheck: { compared, findings }, status: { kind: "retention-checked", compared, differences: findings.length } };
        break;
      }
      case "check-query": {
        if (deps.queries === undefined || deps.queries.length === 0 || deps.address === undefined) break;
        let search: string;
        try {
          search = deps.address();
        } catch {
          state = { ...state, confirmingErase: false, lastExport: null, queryCheck: null, status: { kind: "query-unreadable" } };
          break;
        }
        const check = checkAddress(deps.queries, search);
        state = { ...state, confirmingErase: false, lastExport: null, queryCheck: check, status: { kind: "query-checked", params: check.params, findings: check.findings.length } };
        break;
      }
      case "export-query-csv":
      case "export-query-text": {
        if (deps.queries === undefined || deps.queries.length === 0) break;
        const csv = action.type === "export-query-csv";
        const loc = state.prefs.locale;
        const file = csv ? queryAsCsv(loc, deps.queries, deps.now(), loc === "fr" ? ";" : ",") : queryAsText(loc, deps.queries, deps.now());
        log({ kind: "query-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "query-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "export-browser-csv":
      case "export-browser-text": {
        if (deps.browser === undefined || deps.browser.register.length === 0) break;
        const csv = action.type === "export-browser-csv";
        const loc = state.prefs.locale;
        const file = csv ? browserAsCsv(loc, deps.browser.register, deps.now(), loc === "fr" ? ";" : ",") : browserAsText(loc, deps.browser.register, deps.now());
        log({ kind: "browser-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "browser-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "browser-read":
        if (deps.browser === undefined || deps.browser.register.length === 0) break;
        state = { ...state, browserCheck: action.check, confirmingErase: false, lastExport: null, status: { kind: "browser-checked", answered: action.check.answered, asked: BROWSER_QUESTIONS.length } };
        break;
      case "export-retention-csv":
      case "export-retention-text": {
        if (deps.retention === undefined || deps.retention.length === 0) break;
        const csv = action.type === "export-retention-csv";
        const loc = state.prefs.locale;
        const file = csv ? retentionAsCsv(loc, deps.retention, deps.now(), loc === "fr" ? ";" : ",") : retentionAsText(loc, deps.retention, deps.now());
        log({ kind: "retention-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "retention-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "export-receipt-csv":
      case "export-receipt-text": {
        const rows = receiptFor(deps, state.consent);
        if (rows === null) break;
        const csv = action.type === "export-receipt-csv";
        const loc = state.prefs.locale;
        const file = csv ? receiptAsCsv(loc, rows, deps.now(), loc === "fr" ? ";" : ",") : receiptAsText(loc, rows, deps.now());
        log({ kind: "receipt-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "receipt-exported", format: csv ? "csv" : "text" } };
        break;
      }
      case "export-statements-csv":
      case "export-statements-text": {
        const results = statementsFor(deps);
        if (results === null) break;
        const csv = action.type === "export-statements-csv";
        const loc = state.prefs.locale;
        const file = csv ? statementsAsCsv(loc, results, deps.now(), loc === "fr" ? ";" : ",") : statementsAsText(loc, results, deps.now());
        log({ kind: "statements-export", format: csv ? "csv" : "text" });
        state = { ...state, confirmingErase: false, lastExport: file, status: { kind: "statements-exported", format: csv ? "csv" : "text" } };
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
        const r = prepareImport(action.text, storage, scope);
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
      case "report":
        state = { ...state, confirmingErase: false, confirmingClearDevice: false, lastExport: null, status: action.status };
        break;
      case "publish":
        state = { ...state, confirmingErase: false, confirmingClearDevice: false, importPending: false, lastExport: action.file, status: action.status };
        plan = null;
        break;
      case "signals-read":
        if (deps.signals === undefined) break;
        state = { ...state, signals: action.signals };
        break;
      case "device-scanned":
        if (deps.device === undefined) break;
        state = { ...state, scan: action.scan, confirmingClearDevice: false, lastExport: null, status: { kind: "scan-done" } };
        break;
      case "features-read":
        if (deps.features === undefined) break;
        state = { ...state, featureStates: action.states, confirmingErase: false, lastExport: null, status: { kind: "features-checked" } };
        break;
      case "clear-device-ask": {
        const r = deps.device === undefined || state.scan === null ? null : removable(state.scan, deps.device);
        if (r === null || r.caches.length + r.databases.length === 0) {
          state = { ...state, confirmingClearDevice: false, status: r === null ? state.status : { kind: "device-nothing" } };
        } else {
          state = { ...state, confirmingErase: false, confirmingClearDevice: true, status: null, lastExport: null };
        }
        break;
      }
      case "clear-device-cancel":
        state = { ...state, confirmingClearDevice: false, status: null };
        break;
      case "erase-ask": {
        if (storage === null) {
          state = unavailable();
        } else if (scopeKeysPresent(storage, scope).length === 0) {
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
        const r = eraseLocalData(storage, scope);
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
          confirmingClearDevice: false,
          changes: deps.trackChanges === true ? { kind: "first-view" } : null,
        };
        break;
      }
    }
    for (const l of listeners) l(state);
    return state;
  }

  async function dispatchAsync(action: PrivacyAsyncAction): Promise<PrivacyState> {
    switch (action.type) {
      case "read-signals": {
        if (deps.signals === undefined) return state;
        return dispatch({ type: "signals-read", signals: await readSignals(deps.signals) });
      }
      case "check-browser": {
        if (deps.browser === undefined || deps.browser.register.length === 0) return state;
        return dispatch({ type: "browser-read", check: browserCheck(await readBrowser(deps.browser.host)) });
      }
      case "check-features": {
        if (deps.features === undefined) return state;
        return dispatch({ type: "features-read", states: await readFeatureStates(deps.features.host, deps.features.register, deps.now()) });
      }
      case "scan-device": {
        if (deps.device === undefined) return state;
        return dispatch({ type: "device-scanned", scan: await scanDevice(deps.device.host, deps.now()) });
      }
      case "clear-device-confirm": {
        const d = deps.device;
        if (d === undefined || state.scan === null || !state.confirmingClearDevice) return state;
        const r = await clearDevice(d.host, state.scan, d);
        log({ kind: "device-clear", count: r.caches + r.databases });
        dispatch({ type: "device-scanned", scan: await scanDevice(d.host, deps.now()) });
        return dispatch({
          type: "report",
          status: r.failed.length > 0 ? { kind: "device-clear-partial", failed: r.failed.length } : { kind: "device-cleared", caches: r.caches, databases: r.databases },
        });
      }
      case "protected-export": {
        const bad = (code: "mismatch" | NonNullable<ReturnType<typeof passphraseProblem>> | "unsupported" | "too-large"): PrivacyState =>
          dispatch({ type: "report", status: { kind: "protected-problem", code } });
        if (deps.storage === null) return dispatch({ type: "report", status: { kind: "unavailable" } });
        if (deps.crypto === undefined) return bad("unsupported");
        const problem = passphraseProblem(action.passphrase);
        if (problem !== null) return bad(problem);
        if (action.passphrase !== action.confirm) return bad("mismatch");
        const file = exportLocalData(deps.storage, scope, deps.now(), state.prefs.locale);
        if (file.count === 0) return dispatch({ type: "report", status: { kind: "nothing" } });
        const r = await protect(file.text, action.passphrase, deps.prefix, deps.crypto, deps.protectedIterations === undefined ? {} : { iterations: deps.protectedIterations });
        if (!r.ok) return bad(r.code);
        log({ kind: "protected-export", count: file.count });
        return dispatch({
          type: "publish",
          file: { ...file, filename: file.filename.replace(/\.json$/, "-protected.json"), text: r.text },
          status: { kind: "protected-prepared", count: file.count },
        });
      }
      case "protected-import": {
        if (deps.storage === null) return dispatch({ type: "report", status: { kind: "unavailable" } });
        const r = await unprotect(action.text, action.passphrase, deps.prefix, deps.crypto, deps.minProtectedIterations === undefined ? {} : { minIterations: deps.minProtectedIterations });
        if (!r.ok) return dispatch({ type: "report", status: { kind: "protected-problem", code: r.code } });
        log({ kind: "protected-import" });
        return dispatch({ type: "import-load", text: r.plaintext });
      }
    }
  }

  return {
    getState: () => state,
    dispatch,
    dispatchAsync,
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
        ...(deps.signals !== undefined ? { signals: state.signals } : {}),
        ...(deps.device !== undefined
          ? {
              device: {
                scan: state.scan,
                canErase: (deps.device.cachePrefix ?? "") !== "" || (deps.device.dbPrefix ?? "") !== "",
                confirming: state.confirmingClearDevice,
                removableCaches: state.scan === null ? 0 : removable(state.scan, deps.device).caches.length,
                removableDatabases: state.scan === null ? 0 : removable(state.scan, deps.device).databases.length,
              },
            }
          : {}),
        ...(deps.device !== undefined && deps.deviceRegister !== undefined
          ? { deviceNames: state.scan === null ? null : describeDevice(state.scan, deps.deviceRegister, deps.device) }
          : {}),
        ...(deps.features !== undefined ? { features: { register: deps.features.register, states: state.featureStates } } : {}),
        ...(deps.addresses !== undefined ? { addresses: deps.addresses } : {}),
        ...(statementsFor(deps) !== null ? { statements: statementsFor(deps) as StatementResult[] } : {}),
        ...(deps.handoffs !== undefined && deps.handoffs.length > 0 ? { handoffs: deps.handoffs } : {}),
        ...(deps.queries !== undefined && deps.queries.length > 0 ? { queries: deps.queries, queryCanCheck: deps.address !== undefined, ...(state.queryCheck !== null ? { queryCheck: state.queryCheck } : {}) } : {}),
        ...(deps.browser !== undefined && deps.browser.register.length > 0 ? { browser: deps.browser.register, ...(state.browserCheck !== null ? { browserCheck: state.browserCheck } : {}) } : {}),
        ...(deps.retention !== undefined && deps.retention.length > 0 ? { retention: deps.retention, ...(state.retentionCheck !== null ? { retentionCheck: state.retentionCheck } : {}) } : {}),
        ...(receiptFor(deps, state.consent) !== null ? { receipt: receiptFor(deps, state.consent) as ReceiptRow[] } : {}),
        ...(glanceSources(deps) !== null ? { glance: glanceSources(deps) as GlanceSources } : {}),
        ...(deps.kept !== undefined ? { keptList: true } : {}),
        ...(deps.crypto !== undefined ? { protectedCopy: true } : {}),
        ...(deps.logActivity === true ? { activity: loadActivity(deps.storage, deps.prefix, deps.now()) } : {}),
        ...(state.changes !== null ? { changes: state.changes } : {}),
        purposes,
        consent: state.consent,
        ...(deps.refused !== undefined ? { refused: deps.refused() } : {}),
        ...(deps.outside !== undefined ? { outside: deps.outside } : {}),
        ...(deps.reviewedOn !== undefined ? { reviewedOn: deps.reviewedOn } : {}),
        confirmingErase: state.confirmingErase,
        status: state.status,
      }),
  };
}
