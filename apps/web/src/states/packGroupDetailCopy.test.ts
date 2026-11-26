import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { type BucketKey, bucketOf } from "./packFingerprint";
import type { DetailProblem } from "./packGroupDetail";
import { compareDetail, makeDetailCode, parseDetailCode } from "./packGroupDetail";
import * as copy from "./packGroupDetailCopy";
import { place, varied } from "./placeFixtures";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const LOCALES: readonly Locale[] = ["en", "fr"];
const PROBLEMS: readonly DetailProblem[] = ["empty", "too-long", "not-a-code", "unsupported-version", "malformed", "incomplete", "typo"];
const one: BucketKey[] = ["3"];
const three: BucketKey[] = ["3", "a", "c"];

const base = varied(81, 50);
const detail = (places: typeof base, keys: BucketKey[]) => {
  const m = makeDetailCode(places, keys);
  const r = m.ok ? parseDetailCode(m.code) : null;
  if (!r || !r.ok) throw new Error("no code");
  return r.detail;
};
const comparisons = [
  compareDetail(base, detail(base, three)),
  compareDetail(base, detail([...base, place(Array.from({ length: 300 }, (_, i) => `zz-extra-${i}`).find((id) => three.includes(bucketOf(id)))!, {})], three)),
  compareDetail(base.filter((p) => p.id !== base.find((q) => three.includes(bucketOf(q.id)))!.id), detail(base, three)),
  compareDetail(base, detail(base.map((p, i) => (i % 3 === 0 ? place(p.id, { name: "e" }) : p), ), three)),
  compareDetail([], detail([], one)),
];

function everything(locale: Locale): string[] {
  const out: string[] = [
    copy.detailIntro(one, locale), copy.detailIntro(three, locale), copy.detailTooMany(1200, 1000, locale), copy.detailTooMany(1, 1000, locale), copy.detailCopyButton(1, locale),
    copy.detailCopyButton(9, locale), copy.detailCopied(locale), copy.detailCopyFailed(locale), copy.detailCodeLabel(locale), copy.detailPasteLabel(locale), copy.detailOtherName(locale),
    copy.detailMore(1, locale), copy.detailMore(5, locale), copy.detailLimit(locale), copy.detailGroupsMismatch(three, one, locale),
  ];
  for (const p of PROBLEMS) out.push(copy.detailProblem(p, undefined, locale), copy.detailProblem(p, "tok", locale));
  for (const c of comparisons) out.push(copy.detailSummary(c, locale));
  for (const k of copy.DETAIL_LIST_KINDS) out.push(copy.detailListHeading(k, 1, locale), copy.detailListHeading(k, 7, locale));
  return out;
}

describe("the detail copy", () => {
  it("passes the App's copy rules in both languages", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(lintCopy(s, l), s).toEqual([]);
  });
  it("has French with the right spacing and apostrophes", () => {
    for (const s of everything("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("never writes the French word for UNKNOWN", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(s, s).not.toMatch(/inconnu/i);
  });
  it("has a different sentence in each language", () => {
    const en = everything("en");
    const fr = everything("fr");
    expect(en).toHaveLength(fr.length);
    for (let i = 0; i < en.length; i += 1) expect(en[i], en[i]).not.toBe(fr[i]);
  });
  it("never says which device is right or that a record is correct", () => {
    for (const l of LOCALES) {
      for (const s of everything(l)) {
        expect(s, s).not.toMatch(/\b(correct|accurate|wrong|outdated|stale|checked|confirmed)\b/i);
        expect(s, s).not.toMatch(/exact|erroné|périmé|confirmé/i);
      }
    }
    expect(copy.detailLimit("en")).toContain("do not say which device has the better record");
    expect(copy.detailLimit("fr")).toContain("ne disent pas quel appareil a le meilleur enregistrement");
  });
  it("gives a different refusal for each problem", () => {
    for (const l of LOCALES) expect(new Set(PROBLEMS.map((p) => copy.detailProblem(p, undefined, l))).size).toBe(PROBLEMS.length);
  });
  it("tells the two codes apart by name", () => {
    expect(copy.detailProblem("not-a-code", undefined, "en")).toMatch(/PACKGRP.*PACKFP/);
  });
  it("says one group or several, in both languages", () => {
    expect(copy.detailIntro(one, "en")).toContain("for the group that differ (3)");
    expect(copy.detailIntro(three, "en")).toContain("for the 3 groups that differ (3, a, c)");
    expect(copy.detailIntro(one, "fr")).toContain("pour le groupe qui diffère (3)");
    expect(copy.detailIntro(three, "fr")).toContain("pour les 3 groupes qui diffèrent (3, a, c)");
  });
  it("says every place matches when nothing differs inside the groups", () => {
    expect(copy.detailSummary(comparisons[0]!, "en")).toMatch(/^In these groups, all \d+ places? match\. The difference is somewhere else\.$/);
    expect(copy.detailSummary(comparisons[0]!, "fr")).toContain("correspondent tous");
  });
  it("counts each kind in the summary", () => {
    const only = comparisons[1]!;
    expect(copy.detailSummary(only, "en")).toContain("0 only on this device, 1 only on the other device, 0 on both with different details");
    const gone = comparisons[2]!;
    expect(copy.detailSummary(gone, "en")).toContain("0 only on this device, 1 only on the other device");
    expect(gone.onlyThere.length).toBeGreaterThan(0);
  });
  it("uses the singular for one place and the plural otherwise", () => {
    expect(copy.detailCopyButton(1, "en")).toBe("Copy the detail code (1 place)");
    expect(copy.detailCopyButton(9, "en")).toBe("Copy the detail code (9 places)");
    expect(copy.detailCopyButton(1, "fr")).toContain("1 lieu)");
    expect(copy.detailCopyButton(9, "fr")).toContain("9 lieux)");
    expect(copy.detailMore(1, "fr")).toBe("et 1 autre");
    expect(copy.detailMore(5, "fr")).toBe("et 5 autres");
  });
  it("names the part of a code that cannot be read only when it is known", () => {
    expect(copy.detailProblem("malformed", "g", "en")).toContain("(g)");
    expect(copy.detailProblem("malformed", undefined, "en")).not.toContain("(");
  });
});
