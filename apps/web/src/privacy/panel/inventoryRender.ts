import type { Locale } from "./copyLint";
import { esc } from "./html";
import type { InventoryEntry } from "./inventory";
import { sortInventory } from "./inventory";
import { PANEL_STRINGS } from "./strings";
import { STRINGS as NOTICE_STRINGS } from "../onDeviceNotice";

/**
 * Narrow-screen reflow for the inventory table. Below 40em (covers 320px) each
 * row stacks as a card. Column names live in the DOM (a span in each cell) so
 * they are available to screen readers when the thead is hidden. They are
 * visually hidden on wide screens and shown as the card label when stacked.
 */
const INVENTORY_REFLOW_CSS = `<style>
.privacy-inventory{max-width:100%;position:relative}
.privacy-inventory table{width:100%;max-width:100%;border-collapse:collapse}
.privacy-inventory th,.privacy-inventory td{overflow-wrap:anywhere}
.privacy-inventory-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (max-width: 40em){
  .privacy-inventory table,
  .privacy-inventory tbody,
  .privacy-inventory tr,
  .privacy-inventory th,
  .privacy-inventory td{display:block;width:100%;max-width:100%;box-sizing:border-box}
  .privacy-inventory thead{display:none}
  .privacy-inventory tr{margin:0 0 1rem}
  .privacy-inventory th[scope="row"]{font-weight:700}
  .privacy-inventory-label{position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto;white-space:normal;display:block;font-weight:600}
}
</style>`;

function labelledCell(label: string, value: string): string {
  return `<td><span class="privacy-inventory-label">${esc(label)}</span>${value}</td>`;
}

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
        labelledCell(c.where, esc(where[e.where ?? "unknown"])),
        labelledCell(c.purpose, esc(e.purpose?.[locale] ?? s.unknown)),
        labelledCell(c.keptFor, esc(e.keptFor?.[locale] ?? s.unknown)),
        labelledCell(
          c.source,
          `${esc(e.source[locale])}${e.licence !== undefined ? ` (${esc(e.licence)})` : ""}, ${esc(e.recordedOn)}`,
        ),
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
