export * from "../onDeviceNotice";
export { lintCopy, lintTable } from "./copyLint";
export type { LintCode, LintIssue } from "./copyLint";
export { TARGET_PX } from "./html";
export {
  assertValidInventory,
  isIsoDate,
  sortInventory,
  summarizeInventory,
  validateInventory,
} from "./inventory";
export type {
  Bilingual,
  InventoryEntry,
  InventoryProblem,
  InventorySummary,
  ProblemCode,
} from "./inventory";
export { renderInventoryTableHtml } from "./inventoryRender";
export { createMemoryStorage, safeLocalStorage } from "./storage";
export type { StorageLike } from "./storage";
export { eraseLocalData, exportLocalData, listKeys } from "./localData";
export type { EraseResult, ExportFile } from "./localData";
export { detectLocale, loadPrefs, prefsKey, savePrefs } from "./preferences";
export type { PrivacyPrefs } from "./preferences";
export { PANEL_STRINGS } from "./strings";
export type { PanelStrings, Status } from "./strings";
export { renderPrivacyPanelHtml } from "./panel";
export type { PanelView } from "./panel";
export { createPrivacyController } from "./controller";
export type { ControllerDeps, PrivacyAction, PrivacyController, PrivacyState } from "./controller";
export { adaptElement, browserDownload, mountPrivacyPanel } from "./mount";
export type { MountOptions, PanelEvent, PanelRoot } from "./mount";
export * from "./consent";
export * from "./expiry";
export { ACTIVITY_TTL_DAYS, MAX_ACTIVITY_ENTRIES, formatActivityTime, loadActivity, recordActivity } from "./activityLog";
export type { ActivityEntry, ActivityKind } from "./activityLog";
export { diffInventory, fingerprintEntry, loadSeen, saveSeen, snapshot, SEEN_TTL_DAYS } from "./changes";
export type { ChangesView, SeenList } from "./changes";
export { EXTRA_STRINGS, activityText, formatBytes, storedSummary } from "./copyExtra";
export { csvCell, inventoryAsCsv, inventoryAsText } from "./inventoryExport";
export { matchKey, reconcile } from "./reconcile";
export type { Reconciled, StoredItem } from "./reconcile";
export { ownEntries } from "./ownEntries";
export { LINK_LABELS, PAGE_TITLES, ROUTE_PATHS, matchRoute, renderPrivacyLinkHtml, routeHref } from "./route";
export { installPrivacyRoute } from "./page";
export type { InstalledRoute, RouteOptions, ShellContainer, ShellHost } from "./page";
