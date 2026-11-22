/** The possible repeats as text or CSV. Made on this device from what is listed. */
import { DUP_CSV_HEADER, DUP_CSV_NAME, DUP_TEXT_NAME, dupMemberFields, dupNoName, dupReasonsLine, dupTagsDiffer, dupTextCaveat } from "./duplicateCopy";
import type { DuplicateReport } from "./duplicateGroups";
import { csvCell } from "./exportData";
import type { SavedFile } from "./downloadFile";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";

const byId = (places: readonly PackPlaceRecord[]): Map<string, PackPlaceRecord> => new Map(places.map((p) => [p.id, p] as const));

export interface DuplicateCsvOptions {
  readonly bom?: boolean;
}

/** One row per compared pair inside a group. Reasons and tags are fixed English tokens. */
export function duplicatesToCsv(report: DuplicateReport, places: readonly PackPlaceRecord[], opts: DuplicateCsvOptions = {}): string {
  const map = byId(places);
  const rows: string[][] = [[...DUP_CSV_HEADER]];
  report.groups.forEach((g, gi) => {
    for (const { a, b, pair } of g.pairs) {
      const pa = map.get(a);
      const pb = map.get(b);
      rows.push([String(gi + 1), a, pa?.name ?? "", b, pb?.name ?? "", String(pair.score), pair.reasons.join(" "), pair.metres === null ? "" : String(Math.round(pair.metres)), pa?.tag ?? "", pb?.tag ?? ""]);
    }
  });
  return (opts.bom ? "﻿" : "") + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function duplicatesToText(report: DuplicateReport, places: readonly PackPlaceRecord[], locale: Locale): string {
  const map = byId(places);
  const f = dupMemberFields(locale);
  const out: string[] = [dupTextCaveat(locale), ""];
  report.groups.forEach((g, gi) => {
    out.push(`${gi + 1}. ${g.ids.length}`);
    for (const id of g.ids) {
      const p = map.get(id);
      out.push(`  - ${p?.name ?? dupNoName(locale)} (${f.id} ${id}); ${f.address}: ${p?.address ?? "UNKNOWN"}; ${f.kind}: ${p?.category ?? "UNKNOWN"}; ${f.tag}: ${p?.tag ?? "unknown"}`);
    }
    for (const { a, b, pair } of g.pairs) out.push(`  ${a} / ${b}: ${pair.score}; ${dupReasonsLine(pair.reasons, locale)}`);
    if (g.tagsDiffer) out.push(`  ${dupTagsDiffer(locale)}`);
    out.push("");
  });
  return out.join("\n");
}

export const duplicatesCsvFile = (r: DuplicateReport, places: readonly PackPlaceRecord[], locale: Locale): SavedFile => ({ name: DUP_CSV_NAME[locale], mime: "text/csv;charset=utf-8", content: duplicatesToCsv(r, places, { bom: true }) });
export const duplicatesTextFile = (r: DuplicateReport, places: readonly PackPlaceRecord[], locale: Locale): SavedFile => ({ name: DUP_TEXT_NAME[locale], mime: "text/plain;charset=utf-8", content: duplicatesToText(r, places, locale) });
