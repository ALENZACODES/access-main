/** The tag-and-note findings as text or CSV. Made on this device from what is listed. */
import type { SavedFile } from "./downloadFile";
import { csvCell } from "./exportData";
import type { Disagreement } from "./tagNoteCheck";
import { TN_CSV_HEADER, TN_CSV_NAME, TN_TEXT_NAME, tnCaveat, tnDirectionLabel, tnKindLine, tnNoName, tnTagLine, tnWeightLine } from "./tagNoteCopy";
import type { Locale } from "./stateCopy";

export interface TagNoteCsvOptions {
  readonly bom?: boolean;
}

const words = (d: Disagreement, against: boolean): string => d.signals.filter((s) => d.against.includes(s) === against).map((s) => s.text).join(" | ");

/** One row per place. The kind, weight and tag are fixed English tokens. */
export function findingsToCsv(findings: readonly Disagreement[], opts: TagNoteCsvOptions = {}): string {
  const rows: string[][] = [[...TN_CSV_HEADER]];
  for (const d of findings) rows.push([d.id, d.name ?? "", d.tag, d.kind, d.weight, words(d, true), words(d, false), d.note]);
  return (opts.bom ? "﻿" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function findingsToText(findings: readonly Disagreement[], locale: Locale): string {
  const out: string[] = [tnCaveat(locale), ""];
  for (const d of findings) {
    out.push(`${d.name ?? tnNoName(locale)} (${d.id})`);
    out.push(`  ${tnTagLine(d.tag, locale)}`);
    out.push(`  ${tnKindLine(d.kind, locale)} ${tnWeightLine(d.weight, locale)}`);
    out.push(`  ${d.signals.map((s) => `${s.text} (${tnDirectionLabel(s.direction, locale)})`).join(", ")}`);
    out.push(`  ${d.note}`);
    out.push("");
  }
  return out.join("\n");
}

export const findingsCsvFile = (f: readonly Disagreement[], locale: Locale): SavedFile => ({ name: TN_CSV_NAME[locale], mime: "text/csv;charset=utf-8", content: findingsToCsv(f, { bom: true }) });
export const findingsTextFile = (f: readonly Disagreement[], locale: Locale): SavedFile => ({ name: TN_TEXT_NAME[locale], mime: "text/plain;charset=utf-8", content: findingsToText(f, locale) });
