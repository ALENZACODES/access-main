// CI audit: the words of every choice the App offers match the newest version in the wording history, in both
// languages. Changing the words of a choice without a new wording version, and a new version without a note on
// what changed, both fail here, so an old yes cannot quietly carry over to a new meaning.

import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import type { ConsentState, Purpose } from "../panel/consent";
import { lintCopy, type Locale } from "../panel/copyLint";
import { LIVE_PURPOSES } from "../panel/live";
import { LIVE_WORDING_HISTORY, wordingChanges, wordingProblems, type WordingHistory } from "../panel/wordingHistory";
import { renderWordingChangesHtml } from "../panel/wordingSection";
import { auditHtml, formatViolations } from "./htmlAudit";
import { rawTexts } from "./rawTexts";

const LOCALES: readonly Locale[] = ["en", "fr"];

describe("wording history against the live choices", () => {
  it("has no problems", () => {
    const p = wordingProblems(LIVE_PURPOSES, LIVE_WORDING_HISTORY);
    expect(p, `\n${p.join("\n")}\n`).toEqual([]);
  });

  it("covers every live choice, and only those", () => {
    expect(LIVE_WORDING_HISTORY.map((h) => h.purposeId).sort()).toEqual(LIVE_PURPOSES.map((p) => p.id).sort());
  });

  it("keeps the words of every version free of a banned term, in both languages", () => {
    for (const h of LIVE_WORDING_HISTORY) {
      for (const v of h.versions) {
        for (const l of LOCALES) {
          expect(lintCopy(l, v.label[l]), `${h.purposeId} v${v.version} ${l} label`).toEqual([]);
          expect(lintCopy(l, v.description[l]), `${h.purposeId} v${v.version} ${l} description`).toEqual([]);
        }
      }
    }
  });

  describe("would fail on a change, so it cannot pass by being blind", () => {
    const p0: Purpose = LIVE_PURPOSES[0]!;
    const h0: WordingHistory = LIVE_WORDING_HISTORY[0]!;

    it("fails when the English description is edited and the version is not raised", () => {
      const edited: Purpose = { ...p0, description: { ...p0.description, en: `${p0.description.en} They may be shared.` } };
      expect(wordingProblems([edited], LIVE_WORDING_HISTORY)).toEqual([`${p0.id}: the en description changed without a new wording version`]);
    });

    it("fails when the French label is edited and the version is not raised", () => {
      const edited: Purpose = { ...p0, label: { ...p0.label, fr: "Autre libellé" } };
      expect(wordingProblems([edited], LIVE_WORDING_HISTORY)).toEqual([`${p0.id}: the fr label changed without a new wording version`]);
    });

    it("fails when the version is raised and the history is not extended", () => {
      expect(wordingProblems([{ ...p0, wordingVersion: p0.wordingVersion + 1 }], LIVE_WORDING_HISTORY)[0]).toContain("history ends at version 1");
    });

    it("fails when a version is added with the new words but no note on what changed", () => {
      const next = { version: 2, label: p0.label, description: { en: `${p0.description.en} They may be shared.`, fr: `${p0.description.fr} Ils peuvent être partagés.` }, changedOn: "2026-12-01" };
      const purpose: Purpose = { ...p0, description: next.description, wordingVersion: 2 };
      expect(wordingProblems([purpose], [{ ...h0, versions: [...h0.versions, next] }]).join("\n")).toContain("does not say what changed");
      expect(wordingProblems([purpose], [{ ...h0, versions: [...h0.versions, { ...next, whatChanged: { en: "Sharing was added.", fr: "Le partage a été ajouté." } }] }])).toEqual([]);
    });
  });

  describe("the panel text for a choice that changed", () => {
    const p0: Purpose = LIVE_PURPOSES[0]!;
    const h0: WordingHistory = LIVE_WORDING_HISTORY[0]!;
    const next = { version: 2, label: p0.label, description: { en: `${p0.description.en} A copy may be shared.`, fr: `${p0.description.fr} Une copie peut être partagée.` }, changedOn: "2026-12-01", whatChanged: { en: "Sharing a copy was added.", fr: "Le partage d’une copie a été ajouté." } };
    const purposes: Purpose[] = [{ ...p0, description: next.description, wordingVersion: 2 }];
    const history: WordingHistory[] = [{ ...h0, versions: [...h0.versions, next] }];
    const consent: ConsentState = { [p0.id]: { value: "granted", decidedOn: "2026-11-15", wordingVersion: 1 } };

    for (const l of LOCALES) {
      it(`passes the HTML audit, the copy lint and the name check (${l})`, () => {
        const html = renderWordingChangesHtml(l, wordingChanges(consent, purposes, history));
        expect(html).toContain("data-privacy-wording-changes");
        const v = auditHtml(`<section lang="${l}">${html}</section>`);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
        expect(containsForbiddenOrg(html)).toBe(false);
      });
    }

    it("shows the added words and what the change was about", () => {
      const html = renderWordingChangesHtml("en", wordingChanges(consent, purposes, history));
      expect(html).toContain("Added:");
      expect(html).toContain("A copy may be shared.");
      expect(html).toContain("Sharing a copy was added.");
    });

    it("shows nothing when the answer is under the current wording", () => {
      const current: ConsentState = { [p0.id]: { value: "granted", decidedOn: "2026-12-02", wordingVersion: 2 } };
      expect(renderWordingChangesHtml("en", wordingChanges(current, purposes, history))).toBe("");
    });
  });
});
