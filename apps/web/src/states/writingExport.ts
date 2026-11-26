/** The wording findings as text or CSV, made on this device. Every finding listed is written, not only those shown. */
import type { SavedFile } from "./downloadFile";
import { csvCell } from "./exportData";
import type { Locale } from "./stateCopy";
import { WR_CSV_HEADER, WR_CSV_NAME, WR_TEXT_NAME, wrCaveat, wrApostropheLine, wrDirectionLine, wrHitLine, wrNoAddress, wrNoName, wrStyleLine } from "./writingCopy";
import type { WritingFinding } from "./writingReport";
import { fieldOfRule } from "./writingRules";

/** One row per thing noticed, so a place with two hits has two rows. The street-type and direction notes have their own rows, with the rules "street-type-mix", "direction-mix" and "apostrophe-mix". */
export function writingToCsv(findings: readonly WritingFinding[], locale: Locale, opts: { bom?: boolean } = {}): string {
  const rows: string[][] = [[...WR_CSV_HEADER]];
  for (const f of findings) {
    for (const h of f.hits) rows.push([f.id, f.name ?? "", f.address ?? "", fieldOfRule(h.rule), h.rule, h.seen ?? "", ""]);
    if (f.styleMix) rows.push([f.id, f.name ?? "", f.address ?? "", "address", "street-type-mix", "", wrStyleLine(f.styleMix, locale)]);
    if (f.apostropheMix) rows.push([f.id, f.name ?? "", f.address ?? "", "name", "apostrophe-mix", "", wrApostropheLine(f.apostropheMix, locale)]);
    if (f.directionMix) rows.push([f.id, f.name ?? "", f.address ?? "", "address", "direction-mix", "", wrDirectionLine(f.directionMix, locale)]);
  }
  return (opts.bom ? "﻿" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function writingToText(findings: readonly WritingFinding[], locale: Locale): string {
  const out: string[] = [wrCaveat(locale), ""];
  for (const f of findings) {
    out.push(`${f.name ?? wrNoName(locale)} (${f.id})`);
    out.push(`  ${f.address ?? wrNoAddress(locale)}`);
    for (const h of f.hits) out.push(`  - ${wrHitLine(h, locale)}`);
    if (f.styleMix) out.push(`  - ${wrStyleLine(f.styleMix, locale)}`);
    if (f.apostropheMix) out.push(`  - ${wrApostropheLine(f.apostropheMix, locale)}`);
    if (f.directionMix) out.push(`  - ${wrDirectionLine(f.directionMix, locale)}`);
    out.push("");
  }
  return out.join("\n");
}

export const writingCsvFile = (f: readonly WritingFinding[], l: Locale): SavedFile => ({ name: WR_CSV_NAME[l], mime: "text/csv;charset=utf-8", content: writingToCsv(f, l, { bom: true }) });
export const writingTextFile = (f: readonly WritingFinding[], l: Locale): SavedFile => ({ name: WR_TEXT_NAME[l], mime: "text/plain;charset=utf-8", content: writingToText(f, l) });
