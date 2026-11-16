import type { Locale } from "./copyLint";
import { button, esc, TARGET_STYLE } from "./html";
import type { InventoryEntry } from "./inventory";
import { renderInventoryTableHtml } from "./inventoryRender";
import { PANEL_STRINGS, type Status } from "./strings";
import { renderOnDeviceNoticeHtml } from "../onDeviceNotice";

export interface PanelView {
  locale: Locale;
  inventory: readonly InventoryEntry[];
  reviewedOn?: string;
  confirmingErase: boolean;
  status: Status | null;
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
    `<h2 id="privacy-panel-title">${esc(s.title)}</h2><p>${esc(s.scopeNote)}</p>` +
    `${notice}${renderInventoryTableHtml(view.locale, view.inventory)}` +
    `${languageFieldset(view.locale, s.languageLegend)}` +
    `<div>${button("export", s.exportButton)}${button("erase", s.eraseButton)}</div>` +
    `${confirm}<p role="status" aria-live="polite" tabindex="-1" data-privacy-status>${status}</p></section>`
  );
}
