import type { Locale } from "./copyLint";
import { esc } from "./html";
import type { InventoryEntry } from "./inventory";
import { sortInventory } from "./inventory";
import { PANEL_STRINGS } from "./strings";
import { STRINGS as NOTICE_STRINGS } from "../onDeviceNotice";

/**
 * An accessible data table in a named region. The wrapper is not in the tab
 * order: a tabindex on a div fails the shell audit, which only counts native
 * controls as keyboard-operable.
 */
export function renderInventoryTableHtml(locale: Locale, entries: readonly InventoryEntry[]): string {
  const s = PANEL_STRINGS[locale];
  const where = NOTICE_STRINGS[locale].where;
  const rows = sortInventory(entries, locale)
    .map((e) => {
      const cells = [
        `<th scope="row">${esc(e.label[locale])}</th>`,
        `<td>${esc(where[e.where ?? "unknown"])}</td>`,
        `<td>${esc(e.purpose?.[locale] ?? s.unknown)}</td>`,
        `<td>${esc(e.keptFor?.[locale] ?? s.unknown)}</td>`,
        `<td>${esc(e.source[locale])}${e.licence !== undefined ? ` (${esc(e.licence)})` : ""}, ${esc(e.recordedOn)}</td>`,
      ];
      return `<tr data-id="${esc(e.id)}">${cells.join("")}</tr>`;
    })
    .join("");
  const c = s.columns;
  const head = [c.item, c.where, c.purpose, c.keptFor, c.source]
    .map((h) => `<th scope="col">${esc(h)}</th>`)
    .join("");
  return (
    `<div role="region" aria-labelledby="privacy-inventory-caption" style="overflow-x:auto">` +
    `<table data-privacy-inventory><caption id="privacy-inventory-caption">${esc(s.inventoryCaption)}</caption>` +
    `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
  );
}
