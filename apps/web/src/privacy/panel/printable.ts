// A standalone page the person can save or print. It works offline: no
// scripts, no outside styles, fonts or images, and a policy that allows nothing
// but its own inline style.

import { esc } from "./html";
import { formatBytes, storedSummary } from "./copyExtra";
import { MORE_STRINGS } from "./copyMore";
import type { Locale } from "./copyLint";
import type { InventoryEntry } from "./inventory";
import { renderInventoryTableHtml } from "./inventoryRender";
import type { ExportFile } from "./localData";
import type { Reconciled } from "./reconcile";
import { PANEL_STRINGS } from "./strings";

export const PRINTABLE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'";

const CSS =
  "body{font:16px/1.5 system-ui,sans-serif;color:#111;background:#fff;margin:0}" +
  "main{max-width:60rem;margin:0 auto;padding:1rem}" +
  "table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:.5rem;text-align:left;vertical-align:top}" +
  "caption{text-align:left;font-weight:700;padding:.5rem 0}" +
  "@media print{body{font-size:12pt}a{color:inherit}}";

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface PrintableInput {
  locale: Locale;
  now: Date;
  inventory: readonly InventoryEntry[];
  stored: Reconciled;
  reviewedOn?: string;
}

export function renderPrintableDocument(i: PrintableInput): string {
  const m = MORE_STRINGS[i.locale].printable;
  const p = PANEL_STRINGS[i.locale];
  const summary = storedSummary(i.locale, {
    count: i.stored.items.length,
    bytes: i.stored.totalBytes,
    undocumented: i.stored.undocumented.length,
  });
  const names =
    i.stored.items.length === 0
      ? ""
      : `<ul>${i.stored.items.map((x) => `<li>${esc(x.key)} (${esc(formatBytes(i.locale, x.bytes))})</li>`).join("")}</ul>`;
  return (
    `<!doctype html><html lang="${i.locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta http-equiv="Content-Security-Policy" content="${esc(PRINTABLE_CSP)}">` +
    `<title>${esc(m.title)}</title><style>${CSS}</style></head><body><main>` +
    `<h1>${esc(m.heading)}</h1><p>${esc(p.scopeNote)}</p><p>${esc(m.generated(localDate(i.now)))}` +
    `${i.reviewedOn === undefined ? "" : ` ${esc(m.reviewed(i.reviewedOn))}`}</p>` +
    `${renderInventoryTableHtml(i.locale, i.inventory)}` +
    `<h2>${esc(m.storedHeading)}</h2><p>${esc(summary)}</p>${names}</main></body></html>`
  );
}

export function buildPrintable(i: PrintableInput): ExportFile {
  return {
    filename: `${i.locale === "fr" ? "l-app-page" : "the-app-page"}-${localDate(i.now)}.html`,
    mime: "text/html",
    text: renderPrintableDocument(i),
    count: i.stored.items.length,
  };
}
