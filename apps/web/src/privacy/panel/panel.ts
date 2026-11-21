import type { Locale } from "./copyLint";
import { button, esc, TARGET_STYLE } from "./html";
import type { InventoryEntry } from "./inventory";
import { renderInventoryTableHtml } from "./inventoryRender";
import type { ActivityEntry } from "./activityLog";
import type { ChangesView } from "./changes";
import { EXTRA_STRINGS } from "./copyExtra";
import { renderActivityHtml, renderChangesHtml, renderDeviceHtml, renderImportHtml, renderNetworkHtml, renderProtectedHtml, renderSignalsHtml, renderStoredHtml, type DeviceView, type NetworkView } from "./panelSections";
import type { Signals } from "./signals";
import { MORE_STRINGS } from "./copyMore";
import type { Reconciled } from "./reconcile";
import { consentStatus, type ConsentState, type Purpose } from "./consent";
import { PANEL_STRINGS, type Status } from "./strings";
import type { RefusedWrite } from "./consentGate";
import { renderOutsideHtml, type OutsideItem } from "./outsideSection";
import type { DescribedDevice } from "./deviceRegister";
import { renderDeviceKnownHtml } from "./deviceKnown";
import { renderFeaturesHtml, type FeatureView } from "./featureSection";
import { renderAddressesHtml } from "./addressSection";
import { renderGlanceHtml } from "./glanceSection";
import type { ReceiptRow } from "./receipt";
import { renderReceiptHtml } from "./receiptSection";
import type { HandoffRow } from "./handoffRegister";
import { renderHandoffHtml } from "./handoffSection";
import type { QueryRow } from "./queryRegister";
import type { AddressCheck } from "./queryLive";
import { renderQueryHtml } from "./querySection";
import type { AutoRow } from "./autoRegister";
import type { WorkerCheckView } from "./autoLive";
import { renderAutoHtml } from "./autoSection";
import type { PickRow } from "./pickRegister";
import { renderPickHtml } from "./pickSection";
import type { BrowserRow } from "./browserRegister";
import type { BrowserCheckView } from "./browserLive";
import { renderBrowserHtml } from "./browserSection";
import type { RetentionRow } from "./retentionRegister";
import { renderRetentionHtml, type RetentionCheckView } from "./retentionSection";
import type { StatementResult } from "./statementRegister";
import { renderStatementsHtml } from "./statementSection";
import type { GlanceSources } from "./glance";
import type { AddressRegisterView } from "./addressView";
import { renderRefusedHtml } from "./refusedSection";
import { renderOnDeviceNoticeHtml } from "../onDeviceNotice";

export interface PanelView {
  locale: Locale;
  inventory: readonly InventoryEntry[];
  reviewedOn?: string;
  confirmingErase: boolean;
  status: Status | null;
  purposes?: readonly Purpose[];
  consent?: ConsentState;
  /** Writes the consent gate stopped this visit. Leave undefined to hide the section. */
  refused?: readonly RefusedWrite[];
  /** What the App keeps that Download and Erase do not reach. Leave undefined to hide the section. */
  outside?: readonly OutsideItem[];
  /** Entries newest first. Leave undefined to hide the activity section. */
  activity?: readonly ActivityEntry[];
  /** Leave undefined to hide the stored-items section. */
  stored?: Reconciled;
  /** Leave undefined to hide the changes section. */
  changes?: ChangesView;
  /** Leave undefined to hide the network section. */
  network?: NetworkView;
  /** A restore file was checked and waits for confirmation. */
  importPending?: boolean;
  /** Show the browser signals section. Pass null before they have been read: every answer shows as Unknown. */
  signals?: Signals | null;
  /** Leave undefined to hide the offline storage section. */
  device?: DeviceView;
  /** What each name found on the device is, from the App's own list. Leave undefined to hide the section. */
  deviceNames?: DescribedDevice | null;
  /** What the App asks of the browser. Leave undefined to hide the section. */
  features?: FeatureView;
  /** The web addresses and network requests in the App. Leave undefined to hide the section. */
  addresses?: AddressRegisterView;
  /** The counts behind the lists. Leave undefined to hide the section. */
  glance?: GlanceSources;
  /** The record of the person's choices. Leave undefined to hide the section. */
  receipt?: readonly ReceiptRow[];
  /** The links that open another app. Leave undefined to hide the section. */
  handoffs?: readonly HandoffRow[];
  /** What is kept, for how long and how much. Leave undefined to hide the section. */
  retention?: readonly RetentionRow[];
  /** The result of comparing the list with what is stored. Leave undefined before the person asks. */
  retentionCheck?: RetentionCheckView;
  queries?: readonly QueryRow[];
  queryCheck?: AddressCheck;
  /** Whether the check button is shown. Off when the page cannot read its own address. */
  queryCanCheck?: boolean;
  /** The places that start work on their own. Leave undefined to hide the section. */
  auto?: readonly AutoRow[];
  /** What the browser said about offline workers. Leave undefined before the person asks. */
  workerCheck?: WorkerCheckView;
  /** The places that read a file you choose. Leave undefined to hide the section. */
  picks?: readonly PickRow[];
  /** The places that ask the browser about the device or settings. Leave undefined to hide the section. */
  browser?: readonly BrowserRow[];
  /** What the browser said when asked now. Leave undefined before the person asks. */
  browserCheck?: BrowserCheckView;
  /** Where the App says data stays on the device or is not sent. Leave undefined to hide the section. */
  statements?: readonly StatementResult[];
  /** Show the buttons that download everything the App keeps on this device. */
  keptList?: boolean;
  /** Show the protected copy section. */
  protectedCopy?: boolean;
}

const LOCALE_NAMES: ReadonlyArray<{ locale: Locale; name: string }> = [
  { locale: "en", name: "English" },
  { locale: "fr", name: "Français" },
];

function languageFieldset(current: Locale, legend: string): string {
  const radios = LOCALE_NAMES.map(
    ({ locale, name }) =>
      `<label style="display:inline-flex;align-items:center;${TARGET_STYLE}">` +
      `<input type="radio" name="privacy-locale" value="${locale}" data-locale-option${locale === current ? " checked" : ""}>` +
      `<span lang="${locale}">${esc(name)}</span></label>`,
  ).join("");
  return `<fieldset><legend>${esc(legend)}</legend>${radios}</fieldset>`;
}

function renderConsentHtml(view: PanelView): string {
  const purposes = view.purposes ?? [];
  if (purposes.length === 0) return "";
  const c = PANEL_STRINGS[view.locale].consent;
  const state = view.consent ?? {};
  const blocks = purposes.map((p) => {
    const st = consentStatus(state, p);
    const statusId = `privacy-consent-status-${p.id}`;
    const text =
      st.value === "granted"
        ? c.granted(st.decidedOn ?? "")
        : st.value === "declined"
          ? c.declined(st.decidedOn ?? "")
          : st.stale
            ? c.stale
            : c.unknown;
    const toggle = (action: string, visible: string, aria: string, pressed: boolean): string =>
      `<button type="button" data-action="${action}" data-purpose="${esc(p.id)}" aria-pressed="${pressed}" ` +
      `aria-label="${esc(aria)}" aria-describedby="${statusId}" style="${TARGET_STYLE}">${esc(visible)}</button>`;
    return (
      `<div role="group" aria-labelledby="privacy-consent-${esc(p.id)}" data-purpose-block="${esc(p.id)}">` +
      `<h4 id="privacy-consent-${esc(p.id)}">${esc(p.label[view.locale])}</h4>` +
      `<p>${esc(p.description[view.locale])}</p>` +
      `<p id="${statusId}">${esc(text)}</p>` +
      toggle("consent-grant", c.allow, c.ariaAllow(p.label[view.locale]), st.value === "granted") +
      toggle("consent-decline", c.decline, c.ariaDecline(p.label[view.locale]), st.value === "declined") +
      `</div>`
    );
  });
  return `<div data-privacy-consent><h3>${esc(c.heading)}</h3><p>${esc(c.note)}</p>${blocks.join("")}</div>`;
}

export function renderPrivacyPanelHtml(view: PanelView): string {
  const s = PANEL_STRINGS[view.locale];
  const notice = renderOnDeviceNoticeHtml({
    locale: view.locale,
    items: view.inventory.map((e) => ({
      id: e.id,
      label: e.label,
      ...(e.where !== undefined ? { where: e.where } : {}),
    })),
    ...(view.reviewedOn !== undefined ? { reviewedOn: view.reviewedOn } : {}),
  });
  const confirm = view.confirmingErase
    ? `<div role="group" aria-labelledby="privacy-erase-title" data-privacy-confirm>` +
      `<h3 id="privacy-erase-title">${esc(s.confirmTitle)}</h3><p>${esc(s.confirmBody)}</p>` +
      `${button("erase-cancel", s.confirmNo)}${button("erase-confirm", s.confirmYes)}</div>`
    : "";
  const status = view.status === null ? "" : esc(s.status(view.status));
  return (
    `<section lang="${view.locale}" aria-labelledby="privacy-panel-title" data-privacy-panel>` +
    `<h2 id="privacy-panel-title" tabindex="-1">${esc(s.title)}</h2><p>${esc(s.scopeNote)}</p>` +
    `${notice}${renderInventoryTableHtml(view.locale, view.inventory)}` +
    `${view.stored === undefined ? "" : renderStoredHtml(view.locale, view.stored, view.inventory)}` +
    `${view.changes === undefined ? "" : renderChangesHtml(view.locale, view.changes)}` +
    `${view.network === undefined ? "" : renderNetworkHtml(view.locale, view.network)}` +
    `${view.signals === undefined ? "" : renderSignalsHtml(view.locale, view.signals)}` +
    `${view.device === undefined ? "" : renderDeviceHtml(view.locale, view.device)}` +
    `${view.deviceNames === undefined ? "" : renderDeviceKnownHtml(view.locale, view.deviceNames)}` +
    `${view.features === undefined ? "" : renderFeaturesHtml(view.locale, view.features)}` +
    `${view.receipt === undefined ? "" : renderReceiptHtml(view.locale, view.receipt)}` +
    `${view.handoffs === undefined ? "" : renderHandoffHtml(view.locale, view.handoffs)}` +
    `${view.queries === undefined ? "" : renderQueryHtml(view.locale, view.queries, view.queryCheck ?? null, view.queryCanCheck !== false)}` +
    `${view.picks === undefined ? "" : renderPickHtml(view.locale, view.picks)}` +
    `${view.browser === undefined ? "" : renderBrowserHtml(view.locale, view.browser, view.browserCheck ?? null)}` +
    `${view.retention === undefined ? "" : renderRetentionHtml(view.locale, view.retention, view.retentionCheck ?? null)}` +
    `${view.auto === undefined ? "" : renderAutoHtml(view.locale, view.auto, view.workerCheck ?? null)}` +
    `${view.statements === undefined ? "" : renderStatementsHtml(view.locale, view.statements)}` +
    `${view.glance === undefined ? "" : renderGlanceHtml(view.locale, view.glance)}` +
    `${view.addresses === undefined ? "" : renderAddressesHtml(view.locale, view.addresses)}` +
    `${renderConsentHtml(view)}` +
    `${view.outside === undefined ? "" : renderOutsideHtml(view.locale, view.outside)}` +
    `${view.refused === undefined ? "" : renderRefusedHtml(view.locale, view.refused, view.purposes ?? [])}` +
    `${view.activity === undefined ? "" : renderActivityHtml(view.locale, view.activity, view.purposes ?? [])}` +
    `${languageFieldset(view.locale, s.languageLegend)}` +
    `${renderImportHtml(view.locale, view.importPending === true)}` +
    `${view.protectedCopy === true ? renderProtectedHtml(view.locale) : ""}` +
    `<div>${button("export", s.exportButton)}${button("export-list-csv", EXTRA_STRINGS[view.locale].list.csvButton)}` +
    `${button("export-list-text", EXTRA_STRINGS[view.locale].list.textButton)}` +
    `${view.keptList === true ? button("export-kept-csv", EXTRA_STRINGS[view.locale].list.keptCsvButton) + button("export-kept-text", EXTRA_STRINGS[view.locale].list.keptTextButton) : ""}` +
    `${button("export-support", MORE_STRINGS[view.locale].buttons.support)}${button("export-printable", MORE_STRINGS[view.locale].buttons.printable)}` +
    `${button("erase", s.eraseButton)}</div>` +
    `${confirm}<p role="status" aria-live="polite" tabindex="-1" data-privacy-status>${status}</p></section>`
  );
}
