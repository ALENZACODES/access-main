/** Runs the wording rules over a list of places and sorts the results for the page and the saved files. */
import type { PackPlaceRecord } from "./packPlaces";
import { WRITING_RULES, addressHits, fieldOfRule, nameHits, type RuleHit, type WritingField, type WritingRule } from "./writingRules";
import { apostropheIds, findApostropheMix, type ApostropheMix } from "./writingApostrophe";
import { findDirectionMixes } from "./writingDirection";
import { findStyleMixes, minorityIndex, type StyleMix } from "./writingStyle";

/** One place with at least one thing the rules noticed. */
export interface WritingFinding {
  readonly id: string;
  readonly name: string | null;
  readonly address: string | null;
  readonly hits: readonly RuleHit[];
  /** Set when the address uses the less common of two forms of a street type. */
  readonly styleMix: StyleMix | null;
  /** Set when the address uses the less common of two forms of a direction ("W" or "West"). */
  readonly directionMix: StyleMix | null;
  /** Set when the name uses the less common of the two kinds of apostrophe. */
  readonly apostropheMix: ApostropheMix | null;
}

export interface WritingReport {
  readonly findings: readonly WritingFinding[];
  /** Places looked at: those with a name or an address. */
  readonly checked: number;
  /** Places with neither a name nor an address. */
  readonly nothingToRead: number;
  readonly byRule: Readonly<Record<WritingRule, number>>;
  /** Places pointed out for the less common street-type form. */
  readonly styleMinority: number;
  readonly mixes: readonly StyleMix[];
  /** Places pointed out for the less common direction form. */
  readonly directionMinority: number;
  readonly directionMixes: readonly StyleMix[];
  /** Set when both kinds of apostrophe are in use among the names. */
  readonly apostropheMix: ApostropheMix | null;
}

const emptyCounts = (): Record<WritingRule, number> => Object.fromEntries(WRITING_RULES.map((r) => [r, 0])) as Record<WritingRule, number>;

export function buildWritingReport(places: readonly PackPlaceRecord[]): WritingReport {
  const mixes = findStyleMixes(places);
  const minority = minorityIndex(mixes);
  const directionMixes = findDirectionMixes(places);
  const directionMinorityIds = minorityIndex(directionMixes);
  const apostropheMix = findApostropheMix(places);
  const apostropheOf = apostropheIds(apostropheMix);
  const byRule = emptyCounts();
  const findings: WritingFinding[] = [];
  let checked = 0;
  let nothingToRead = 0;
  for (const p of places) {
    if (p.name === null && p.address === null) {
      nothingToRead += 1;
      continue;
    }
    checked += 1;
    const hits = [...nameHits(p.name, p.address), ...addressHits(p.address)];
    const styleMix = minority.get(p.id) ?? null;
    const directionMix = directionMinorityIds.get(p.id) ?? null;
    const apostrophe = apostropheOf.has(p.id) ? apostropheMix : null;
    if (hits.length === 0 && styleMix === null && directionMix === null && apostrophe === null) continue;
    for (const h of hits) byRule[h.rule] += 1;
    findings.push({ id: p.id, name: p.name, address: p.address, hits, styleMix, directionMix, apostropheMix: apostrophe });
  }
  return { findings, checked, nothingToRead, byRule, styleMinority: findings.filter((f) => f.styleMix !== null).length, mixes, directionMinority: findings.filter((f) => f.directionMix !== null).length, directionMixes, apostropheMix };
}

export type WritingFilter = "all" | "names" | "addresses" | "style" | "direction" | "apostrophe" | WritingRule;
export const WRITING_FILTER_GROUPS: readonly WritingFilter[] = ["all", "names", "addresses", "style", "direction", "apostrophe"];

export const isWritingFilter = (v: unknown): v is WritingFilter => typeof v === "string" && ((WRITING_FILTER_GROUPS as readonly string[]).includes(v) || (WRITING_RULES as readonly string[]).includes(v));

function matches(f: WritingFinding, filter: WritingFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "names":
      return f.hits.some((h) => fieldOfRule(h.rule) === "name");
    case "addresses":
      return f.hits.some((h) => fieldOfRule(h.rule) === "address");
    case "style":
      return f.styleMix !== null;
    case "direction":
      return f.directionMix !== null;
    case "apostrophe":
      return f.apostropheMix !== null;
    default:
      return f.hits.some((h) => h.rule === filter);
  }
}

export const filterWriting = (findings: readonly WritingFinding[], filter: WritingFilter): WritingFinding[] => findings.filter((f) => matches(f, filter));

export type WritingOrder = "most" | "name" | "pack";
export const WRITING_ORDERS: readonly WritingOrder[] = ["most", "name", "pack"];
export const DEFAULT_WRITING_ORDER: WritingOrder = "most";
export const isWritingOrder = (v: unknown): v is WritingOrder => typeof v === "string" && (WRITING_ORDERS as readonly string[]).includes(v);

/** How many things were noticed about a place, the street-type, direction and apostrophe forms each counted as one. */
export const noticed = (f: WritingFinding): number => f.hits.length + (f.styleMix ? 1 : 0) + (f.directionMix ? 1 : 0) + (f.apostropheMix ? 1 : 0);

export function orderWriting(findings: readonly WritingFinding[], order: WritingOrder): WritingFinding[] {
  const out = [...findings];
  if (order === "pack") return out;
  const byName = (a: WritingFinding, b: WritingFinding) => {
    if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
    return (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);
  };
  return order === "name" ? out.sort(byName) : out.sort((a, b) => noticed(b) - noticed(a) || byName(a, b));
}

/** The rules that noticed something, with their counts, most first then in rule order. Rules with none are left out. */
export function ruleTally(report: Pick<WritingReport, "byRule">): { rule: WritingRule; count: number; field: WritingField }[] {
  return WRITING_RULES.map((rule, i) => ({ rule, count: report.byRule[rule], field: fieldOfRule(rule), i }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .map(({ rule, count, field }) => ({ rule, count, field }));
}
