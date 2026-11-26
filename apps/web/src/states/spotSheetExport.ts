/**
 * The spot-check sheet as plain text, CSV and a printable web page. All three carry the same
 * questions with room to answer. The page has no script and no external file. Everything taken
 * from the pack is escaped, and a CSV cell that could be read as a formula is made safe.
 */
import { csvCell } from "./exportData";
import { SIZE_POINTS } from "./handout";
import { escapeHandoutHtml, handoutCss } from "./handoutHtml";
import type { SpotSheet } from "./spotSheet";
import { CHECK_KEYS, labels, seedLabel } from "./spotSheetCopy";

const EOL = "\r\n";

export const SPOT_CSV_HEADER = ["n", "place_id", "place_name", "pack_tag", "pack_source", "pack_retrieved_on", ...CHECK_KEYS, "date_looked", "notes"] as const;

/** The names of the pack's own fields are fixed tokens, the same in both languages. */
export function spotSheetToCsv(sheet: SpotSheet, opts: { bom?: boolean } = {}): string {
  const rows: string[][] = [[...SPOT_CSV_HEADER]];
  for (const e of sheet.entries) {
    const name = e.lines[0]?.value ?? "UNKNOWN";
    rows.push([String(e.n), e.id, name, e.tag, e.source, e.retrievedOn, ...CHECK_KEYS.map(() => ""), "", ""]);
  }
  return (opts.bom ? "\uFEFF" : "") + rows.map((r) => r.map(csvCell).join(",")).join(EOL) + EOL;
}

const BLANK = "________________";

export function spotSheetToText(sheet: SpotSheet): string {
  const out: string[] = [sheet.title, "", sheet.intro, `${seedLabel(sheet.locale)}: ${sheet.seed}`, ""];
  for (const e of sheet.entries) {
    out.push(e.heading, ...e.lines.map((l) => `  ${l.label}: ${l.value}`), "", `  ${labels.questions(sheet.locale)}`);
    for (const c of sheet.checks) out.push(`  - ${c.question}`, `    ${c.answers.map((a) => `[ ] ${a.label}`).join("   ")}`);
    out.push(`  ${labels.visitedOn(sheet.locale)}: ${BLANK}`, `  ${labels.notes(sheet.locale)}: ${BLANK}`, "");
  }
  out.push(...sheet.footer);
  return out.join(EOL) + EOL;
}

const e = escapeHandoutHtml;

const EXTRA_CSS = [
  ".box { display: inline-block; width: 0.9em; height: 0.9em; border: 0.1rem solid #000; vertical-align: -0.1em; margin-right: 0.3em; }",
  ".opts span.opt { margin-right: 1.25rem; white-space: nowrap; }",
  "ul.checks { list-style: none; margin: 0; padding: 0; }",
  "ul.checks li { margin-top: 0.75rem; }",
].join("\n");

/** A complete HTML5 document, large print, ready to print. */
export function spotSheetToHtml(sheet: SpotSheet): string {
  const body: string[] = [`<h1>${e(sheet.title)}</h1>`, `<p>${e(sheet.intro)}</p>`, `<p>${e(seedLabel(sheet.locale))}: ${e(sheet.seed)}</p>`];
  for (const entry of sheet.entries) {
    body.push("<article>", `<h2>${e(entry.heading)}</h2>`, "<dl>");
    for (const l of entry.lines) body.push(`<dt>${e(l.label)}</dt>`, `<dd>${e(l.value)}</dd>`);
    body.push("</dl>", `<h3>${e(labels.questions(sheet.locale))}</h3>`, '<ul class="checks">');
    for (const c of sheet.checks) {
      const opts = c.answers.map((a) => `<span class="opt"><span class="box" aria-hidden="true"></span>${e(a.label)}</span>`).join(" ");
      body.push(`<li>${e(c.question)}<div class="opts">${opts}</div></li>`);
    }
    body.push("</ul>", `<p>${e(labels.visitedOn(sheet.locale))}:</p><div class="answer"></div>`, `<p>${e(labels.notes(sheet.locale))}:</p><div class="answer"></div>`, "</article>");
  }
  body.push("<footer>", ...sheet.footer.map((f) => `<p>${e(f)}</p>`), "</footer>");
  return [
    "<!DOCTYPE html>",
    `<html lang="${sheet.locale}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(sheet.title)}</title>`,
    `<style>\n${handoutCss(SIZE_POINTS.large)}\n${EXTRA_CSS}\n</style>`,
    "</head>",
    "<body>",
    ...body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
