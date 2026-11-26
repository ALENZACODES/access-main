/** The groups as text or CSV, made on this device. Every place in every group is written, not only those shown. */
import type { SavedFile } from "./downloadFile";
import { csvCell } from "./exportData";
import type { Locale } from "./stateCopy";
import { WG_CSV_HEADER, WG_CSV_NAME, WG_TEXT_NAME, wgCaveat, wgGroupTitle, wgLinksLine, wgNoName, wgSizeLine, wgSketchHeading, wgSketchShared, wgTagMix } from "./walkGroupCopy";
import { analyseGroup } from "./walkGroupLinks";
import { membersByName, nameGroup } from "./walkGroupName";
import { sketchGroup } from "./walkGroupSketch";
import type { WalkGroup } from "./walkGroups";

interface Cell {
  readonly v: string;
  readonly number: boolean;
}

const coord = (n: number) => n.toFixed(6);

/** One row per place. Group numbers start at 1 in the order given. Coordinates have six decimals and a dot. */
export function groupsToCsv(groups: readonly WalkGroup[], opts: { bom?: boolean } = {}): string {
  // Cells from the pack go through csvCell. Numbers made here (digits, a dot and a minus sign) are written as they are:
  // csvCell would put an apostrophe before a negative longitude.
  const text = (v: string): Cell => ({ v, number: false });
  const num = (v: string): Cell => ({ v, number: true });
  const rows: Cell[][] = [[...WG_CSV_HEADER].map(text)];
  groups.forEach((g, i) => {
    const name = nameGroup(g).text ?? "";
    const analysis = analyseGroup(g, g.distanceM);
    const nearest = new Map(analysis?.neighbours.map((nb) => [nb.id, nb.nearestM] as const));
    const links = new Set(analysis?.links);
    for (const m of membersByName(g.members)) {
      rows.push([num(String(i + 1)), text(name), num(String(g.members.length)), num(String(g.spreadM)), num(g.widthM === null ? "" : String(g.widthM)), text(m.id), text(m.name ?? ""), text(m.tag), text(m.address ?? ""), num(m.location ? coord(m.location.lat) : ""), num(m.location ? coord(m.location.lon) : ""), num(String(nearest.get(m.id) ?? "")), text(analysis === null ? "" : links.has(m.id) ? "yes" : "no")]);
    }
  });
  return (opts.bom ? "﻿" : "") + rows.map((r) => r.map((c) => (c.number ? c.v : csvCell(c.v))).join(",")).join("\r\n") + "\r\n";
}

export function groupsToText(groups: readonly WalkGroup[], locale: Locale): string {
  const out: string[] = [wgCaveat(locale), ""];
  groups.forEach((g, i) => {
    out.push(`${i + 1}. ${wgGroupTitle(nameGroup(g), locale)}`);
    out.push(`   ${wgSizeLine(g.members.length, g.spreadM, g.widthM, locale)}`);
    out.push(`   ${wgTagMix(g.tags, locale)}`);
    const a = analyseGroup(g, g.distanceM);
    const byId = new Map(g.members.map((m) => [m.id, m.name ?? wgNoName(locale)] as const));
    if (a && a.links.length > 0) out.push(`   ${wgLinksLine(a.links.map((id) => byId.get(id) ?? id), g.distanceM, locale)}`);
    const sketch = sketchGroup(g.members);
    if (sketch) {
      out.push(`   ${wgSketchHeading(locale)}`);
      for (const line of sketch.lines) out.push(`   | ${line}`);
      for (const e of sketch.legend) out.push(`   ${e.letter} = ${e.place.name ?? wgNoName(locale)} (${e.place.id})${e.shared ? `, ${wgSketchShared(locale)}` : ""}`);
    }
    for (const m of membersByName(g.members)) out.push(`   - ${m.name ?? wgNoName(locale)} (${m.id})${m.address ? `, ${m.address}` : ""}`);
    out.push("");
  });
  return out.join("\n");
}

export const groupsCsvFile = (g: readonly WalkGroup[], l: Locale): SavedFile => ({ name: WG_CSV_NAME[l], mime: "text/csv;charset=utf-8", content: groupsToCsv(g, { bom: true }) });
export const groupsTextFile = (g: readonly WalkGroup[], l: Locale): SavedFile => ({ name: WG_TEXT_NAME[l], mime: "text/plain;charset=utf-8", content: groupsToText(g, l) });
