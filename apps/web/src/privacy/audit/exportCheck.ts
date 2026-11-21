// Checks one downloaded file against what the App promises for it (exportContract.ts) and against the rules every
// file follows: a dated name, the right type, a stable first line or heading row, line endings the programs people
// open them in expect, and no cell a spreadsheet program would run as a formula. Each problem is one plain line.
// Node only, never shipped.

import type { Locale } from "../panel/copyLint";
import type { ExportFile } from "../panel/localData";
import { DELIMITER, type CsvContract, type ExportContract, type JsonContract, type TextContract } from "./exportContract";
import { parseCsv } from "./csvParse";

const MIME = { csv: "text/csv", text: "text/plain", json: "application/json" } as const;
const EXT = { csv: "csv", text: "txt", json: "json" } as const;
const DATE = "\\d{4}-\\d{2}-\\d{2}";
const BOM = "﻿";

function nameProblems(file: ExportFile, c: ExportContract, locale: Locale): string[] {
  const want = new RegExp(`^${c.stem[locale].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-${DATE}\\.${EXT[c.kind]}$`);
  const out: string[] = [];
  if (!want.test(file.filename)) out.push(`file name "${file.filename}" is not "${c.stem[locale]}-YYYY-MM-DD.${EXT[c.kind]}"`);
  if (file.mime !== MIME[c.kind]) out.push(`type is ${file.mime}, not ${MIME[c.kind]}`);
  if (file.text.startsWith(BOM)) out.push("the file starts with a byte order mark");
  if (file.text.includes("\u0000")) out.push("the file holds a null character");
  return out;
}

function csvProblems(file: ExportFile, c: CsvContract, locale: Locale): string[] {
  const out: string[] = [];
  const parsed = parseCsv(file.text, DELIMITER[locale]);
  out.push(...parsed.problems);
  const [header, ...body] = parsed.rows;
  const want = c.header[locale];
  if (header === undefined) return [...out, "the file has no heading row"];
  if (header.join("\u0001") !== want.join("\u0001")) out.push(`heading row is [${header.join(" | ")}], not [${want.join(" | ")}]`);
  body.forEach((r, i) => {
    if (r.length !== want.length) out.push(`row ${i + 2} has ${r.length} cells, the heading row has ${want.length}`);
    r.forEach((cell, j) => {
      if (/^[=+\-@\t\r]/.test(cell)) out.push(`row ${i + 2}, cell ${j + 1} starts with a character a spreadsheet runs as a formula`);
    });
  });
  if (file.count !== body.length) out.push(`count is ${file.count}, the file has ${body.length} rows`);
  return out;
}

function textProblems(file: ExportFile, c: TextContract, locale: Locale): string[] {
  const out: string[] = [];
  if (file.text.includes("\r")) out.push("the text file holds a carriage return");
  if (!file.text.endsWith("\n")) out.push("the text file does not end with a line break");
  else if (file.text.endsWith("\n\n\n")) out.push("the text file ends with more than one blank line");
  const first = file.text.split("\n")[0] ?? "";
  if (first !== c.title[locale]) out.push(`first line is "${first}", not "${c.title[locale]}"`);
  file.text.split("\n").forEach((line, i) => {
    if (/[ \t]+$/.test(line)) out.push(`line ${i + 1} ends with a space`);
    if (locale === "fr" && /\S :/.test(line)) out.push(`line ${i + 1} has an ordinary space before a colon, which French needs as a no-break space`);
    if (locale === "en" && /\S\u00a0:/.test(line)) out.push(`line ${i + 1} has a no-break space before a colon in English`);
  });
  return out;
}

function jsonProblems(file: ExportFile, c: JsonContract): string[] {
  let body: unknown;
  try {
    body = JSON.parse(file.text);
  } catch {
    return ["the file is not valid JSON"];
  }
  const out: string[] = [];
  if (typeof body !== "object" || body === null || Array.isArray(body)) return ["the file is not a JSON object"];
  const o = body as Record<string, unknown>;
  if (Object.keys(o).join(",") !== c.keys.join(",")) out.push(`keys are [${Object.keys(o).join(", ")}], not [${c.keys.join(", ")}]`);
  if (o.format !== c.format) out.push(`format is ${JSON.stringify(o.format)}, not ${JSON.stringify(c.format)}`);
  if (o.version !== c.version) out.push(`version is ${JSON.stringify(o.version)}, not ${c.version}`);
  if (typeof o.exportedAt !== "string" || Number.isNaN(Date.parse(o.exportedAt))) out.push("exportedAt is not a date");
  const items = o.items;
  if (typeof items !== "object" || items === null || Array.isArray(items)) out.push("items is not an object");
  else {
    const entries = Object.entries(items as Record<string, unknown>);
    if (entries.some(([, v]) => typeof v !== "string")) out.push("an item is not a string");
    if (file.count !== entries.length) out.push(`count is ${file.count}, the file has ${entries.length} items`);
  }
  if (!file.text.endsWith("}\n")) out.push("the JSON file does not end with a closing brace and one line break");
  return out;
}

/** Every way the file differs from its contract. Empty when it keeps its promises. */
export function checkExportFile(file: ExportFile, contract: ExportContract, locale: Locale): string[] {
  const out = nameProblems(file, contract, locale);
  if (contract.kind === "csv") out.push(...csvProblems(file, contract, locale));
  else if (contract.kind === "text") out.push(...textProblems(file, contract, locale));
  else out.push(...jsonProblems(file, contract));
  return out;
}

/** Problems with the contracts themselves: repeated ids, mixed-up stems, headings that cannot be read back. */
export function checkContracts(contracts: readonly ExportContract[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const stems = new Map<string, string>();
  for (const c of contracts) {
    const key = `${c.kind}:${c.id}`;
    if (ids.has(key)) out.push(`${key}: listed twice`);
    ids.add(key);
    for (const l of ["en", "fr"] as const) {
      const s = c.stem[l];
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) out.push(`${key}: ${l} stem "${s}" is not lower-case words joined by hyphens`);
      const other = stems.get(`${c.kind}:${l}:${s}`);
      if (other !== undefined) out.push(`${key}: ${l} stem "${s}" is also used by ${other}`);
      stems.set(`${c.kind}:${l}:${s}`, key);
    }
    if (c.kind === "csv") {
      for (const l of ["en", "fr"] as const) {
        const h = c.header[l];
        if (h.length === 0) out.push(`${key}: ${l} heading row is empty`);
        if (new Set(h).size !== h.length) out.push(`${key}: ${l} heading row repeats a heading`);
        if (h.some((x) => x.trim() === "" || x.includes(DELIMITER[l]) || /["\r\n]/.test(x))) out.push(`${key}: a ${l} heading is empty or needs quoting`);
      }
      if (c.header.en.length !== c.header.fr.length) out.push(`${key}: English and French heading rows have different lengths`);
    }
    if (c.kind === "text" && (c.title.en.trim() === "" || c.title.fr.trim() === "")) out.push(`${key}: a title is empty`);
  }
  return out;
}
