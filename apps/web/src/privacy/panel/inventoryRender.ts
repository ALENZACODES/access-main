import type { Locale } from "./copyLint";
import { esc } from "./html";
import type { InventoryEntry } from "./inventory";
import { sortInventory } from "./inventory";
import { PANEL_STRINGS } from "./strings";
import { STRINGS as NOTICE_STRINGS } from "../onDeviceNotice";

/**
 * Narrow-screen reflow for the inventory table. Below 40em (covers 320px) each
 * row stacks as a card with the column name on the cell, so the table does not
 * overflow and no tabindex scroller is required.
 */
const INVENTORY_REFLOW_CSS = `<style>
.privacy-inventory{max-width:100%}
.privacy-inventory table{width:100%;max-width:100%;border-collapse:collapse}
.privacy-inventory th,.privacy-inventory td{overflow-wrap:anywhere}
@media (max-width: 40em){
  .privacy-inventory table,
  .privacy-inventory tbody,
  .privacy-inventory tr,
  .privacy-inventory th,
  .privacy-inventory td{display:block;width:100%;max-width:100%;box-sizing:border-box}
  .privacy-inventory thead{display:none}
  .privacy-inventory tr{margin:0 0 1rem}
  .privacy-inventory th[scope="row"]{font-weight:700}
  .privacy-inventory td::before{content:attr(data-label);display:block;font-weight:600}
}
</style>`;

/**
 * An accessible data table in a named region. The wrapper is not in the tab
 * order: a tabindex on a div fails the shell audit, which only counts native
 * controls as keyboard-operable. At 320px the table reflows into stacked
 * cards instead of scrolling sideways.
 */
export function renderInventoryTableHtml(locale: Locale, entries: readonly InventoryEntry[]): string {
  const s = PANEL_STRINGS[locale];
  const where = NOTICE_STRINGS[locale].where;
  const c = s.columns;
  const rows = sortInventory(entries, locale)
    .map((e) => {
      const cells = [
        `<th scope="row">${esc(e.label[locale])}</th>`,
        `<td data-label="${esc(c.where)}">${esc(where[e.where ?? "unknown"])}</td>`,
        `<td data-label="${esc(c.purpose)}">${esc(e.purpose?.[locale] ?? s.unknown)}</td>`,
        `<td data-label="${esc(c.keptFor)}">${esc(e.keptFor?.[locale] ?? s.unknown)}</td>`,
        `<td data-label="${esc(c.source)}">${esc(e.source[locale])}${e.licence !== undefined ? ` (${esc(e.licence)})` : ""}, ${esc(e.recordedOn)}</td>`,
      ];
      return `<tr data-id="${esc(e.id)}">${cells.join("")}</tr>`;
    })
    .join("");
  const head = [c.item, c.where, c.purpose, c.keptFor, c.source]
    .map((h) => `<th scope="col">${esc(h)}</th>`)
    .join("");
  return (
    `<div class="privacy-inventory" role="region" aria-labelledby="privacy-inventory-caption">` +
    INVENTORY_REFLOW_CSS +
    `<table data-privacy-inventory><caption id="privacy-inventory-caption">${esc(s.inventoryCaption)}</caption>` +
    `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
  );
}
