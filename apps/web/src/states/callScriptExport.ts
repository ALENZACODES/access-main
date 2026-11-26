/** The call script as a text file and as one self-contained printable page. Made on this device from the script on screen. */
import type { CallScript, ScriptLine } from "./callScript";
import { callScriptHtmlName, callScriptTextName } from "./callScriptCopy";
import type { SavedFile } from "./downloadFile";
import { escapeHtml } from "./renderHtml";
import type { Locale } from "./stateCopy";
import { scriptCopy as c } from "./callScriptCopy";

// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g;
const clean = (s: string): string => s.replace(CONTROL, "");

const RULE = "_".repeat(40);

function textLine(line: ScriptLine, n: number | null, locale: Locale): string[] {
  const out: string[] = [];
  const mark = line.kind === "ask" ? (n === null ? "? " : `${n}. `) : line.kind === "say" ? "- " : "";
  out.push(`${mark}${clean(line.text)}`);
  if (line.basis) out.push(`   ${c.basisLabel(locale)} ${clean(line.basis)}`);
  if (line.kind === "ask" || line.kind === "note" || line.kind === "field") {
    const label = line.kind === "ask" ? c.answerLabel(locale) : "";
    for (let i = 0; i < line.writeLines; i += 1) out.push(`   ${i === 0 && label ? `${label} ` : ""}${RULE}`);
  }
  return out;
}

/** Plain text, one line at a time, with ruled lines to write on when printed. */
export function scriptToText(script: CallScript, locale: Locale): string {
  const out: string[] = [clean(script.title), ""];
  for (const section of script.sections) {
    out.push(clean(section.heading).toUpperCase(), "");
    let n = 0;
    for (const line of section.lines) {
      if (line.kind === "ask" && section.id === "questions") n += 1;
      out.push(...textLine(line, line.kind === "ask" && section.id === "questions" ? n : null, locale), "");
    }
  }
  out.push(clean(script.footer), "");
  return out.join("\n");
}

export function scriptTextFile(script: CallScript, locale: Locale): SavedFile {
  return { name: callScriptTextName[locale], mime: "text/plain;charset=utf-8", content: scriptToText(script, locale) };
}

const CSS = [
  "html { font-size: 13pt; }",
  "body { margin: 0 auto; max-width: 42rem; padding: 1.5rem 1rem; font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #000; background: #fff; }",
  "h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }",
  "h2 { font-size: 1.2rem; margin: 1.75rem 0 0.5rem; padding-top: 0.5rem; border-top: 0.15rem solid #000; }",
  "p { margin: 0.5rem 0; }",
  "ol { padding-left: 1.5rem; }",
  "li { margin-top: 0.75rem; }",
  ".basis { font-size: 0.9rem; }",
  ".rule { height: 2rem; border-bottom: 0.1rem solid #000; }",
  "@page { margin: 15mm; }",
  "@media print { body { padding: 0; max-width: none; } h2 { break-after: avoid; } li, .field { break-inside: avoid; } }",
].join("\n");

function htmlLine(line: ScriptLine, locale: Locale): string {
  const rules = Array.from({ length: line.writeLines }, () => '<div class="rule"></div>').join("");
  const basis = line.basis ? `<p class="basis">${escapeHtml(c.basisLabel(locale))} ${escapeHtml(clean(line.basis))}</p>` : "";
  return `${escapeHtml(clean(line.text))}${basis}${rules}`;
}

/** A complete HTML5 page with no script and no external file. Everything from the pack is escaped. */
export function scriptToHtml(script: CallScript, locale: Locale): string {
  const body: string[] = [`<h1>${escapeHtml(clean(script.title))}</h1>`];
  for (const section of script.sections) {
    body.push(`<h2>${escapeHtml(clean(section.heading))}</h2>`);
    if (section.id === "questions") {
      body.push(section.lines.length === 0 ? `<p>${escapeHtml(c.noQuestions(locale))}</p>` : `<ol>${section.lines.map((l) => `<li>${htmlLine(l, locale)}</li>`).join("")}</ol>`);
    } else {
      for (const line of section.lines) body.push(line.kind === "field" ? `<div class="field"><p>${htmlLine(line, locale)}</p></div>` : `<p>${htmlLine(line, locale)}</p>`);
    }
  }
  body.push(`<p class="basis">${escapeHtml(clean(script.footer))}</p>`);
  return [
    "<!DOCTYPE html>",
    `<html lang="${locale}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(clean(script.title))}</title>`,
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    `<main>${body.join("\n")}</main>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function scriptHtmlFile(script: CallScript, locale: Locale): SavedFile {
  return { name: callScriptHtmlName[locale], mime: "text/html;charset=utf-8", content: scriptToHtml(script, locale) };
}
