/**
 * The handout as one self-contained web page: no script, no external file, no tracking. Opened in
 * any browser it can be read at the chosen size or printed. Everything taken from the pack is
 * escaped, so a place name cannot add markup.
 */
import { SIZE_POINTS, type Handout } from "./handout";
import { escapeHtml } from "./renderHtml";

// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g;

/** HTML text and attribute values: control characters dropped, then the markup characters escaped by the shared escaper. */
export function escapeHandoutHtml(value: string): string {
  return escapeHtml(value.replace(CONTROL, ""));
}

/** Black on white, a plain system font, generous spacing, and no colour carrying meaning. Sizes are in points so print matches the screen. */
export function handoutCss(sizePoints: number): string {
  return [
    `html { font-size: ${sizePoints}pt; }`,
    "body { margin: 0 auto; max-width: 42rem; padding: 1.5rem 1rem; font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #000; background: #fff; overflow-wrap: anywhere; }",
    "h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }",
    "h2 { font-size: 1.2rem; margin: 2rem 0 0.5rem; padding-top: 0.75rem; border-top: 0.15rem solid #000; }",
    "h3 { font-size: 1.1rem; margin: 1.25rem 0 0.25rem; }",
    "ol.ask { margin: 0; padding-left: 1.5rem; }",
    "ol.ask li { margin-top: 0.75rem; }",
    ".answer { height: 2.5rem; border-bottom: 0.1rem solid #000; }",
    "dl { margin: 0; }",
    "dt { font-weight: bold; margin-top: 0.5rem; }",
    "dd { margin: 0; }",
    "footer p { margin: 0.5rem 0; }",
    "@page { margin: 15mm; }",
    "@media print { body { padding: 0; max-width: none; } article { break-inside: avoid; } h2 { break-after: avoid; } }",
  ].join("\n");
}

/** A complete HTML5 document. The language is set so a screen reader and the browser's hyphenation use the right one. */
export function handoutToHtml(h: Handout): string {
  const body: string[] = ["<main>", `<h1>${escapeHandoutHtml(h.title)}</h1>`, `<p>${escapeHandoutHtml(h.intro)}</p>`];
  h.entries.forEach((e, i) => {
    body.push('<article>', `<h2>${i + 1}. ${escapeHandoutHtml(e.heading)}</h2>`, "<dl>");
    for (const l of e.lines) body.push(`<dt>${escapeHandoutHtml(l.label)}</dt>`, `<dd>${escapeHandoutHtml(l.value)}</dd>`);
    if (e.note) body.push(`<dt>${escapeHandoutHtml("Note")}</dt>`, `<dd>${escapeHandoutHtml(e.note)}</dd>`);
    body.push("</dl>");
    if (e.questions.length > 0) {
      body.push(`<h3>${escapeHandoutHtml(h.locale === "fr" ? "Questions à poser" : "Questions to ask")}</h3>`, '<ol class="ask">');
      for (const q of e.questions) body.push(`<li>${escapeHandoutHtml(q)}<div class="answer"></div></li>`);
      body.push("</ol>");
    }
    body.push("</article>");
  });
  body.push("</main>", "<footer>", ...h.footer.map((f) => `<p>${escapeHandoutHtml(f)}</p>`), "</footer>");
  return [
    "<!DOCTYPE html>",
    `<html lang="${h.locale}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHandoutHtml(h.title)}</title>`,
    `<style>\n${handoutCss(SIZE_POINTS[h.size])}\n</style>`,
    "</head>",
    "<body>",
    ...body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
