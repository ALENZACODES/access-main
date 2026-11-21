import { describe, expect, it } from "vitest";
import { auditHtml, formatViolations } from "../audit/htmlAudit";
import { checkParity } from "../audit/parity";
import { rawTexts } from "../audit/rawTexts";
import { lintCopy, type Locale } from "./copyLint";
import type { WordingChange } from "./wordingHistory";
import { WORDING_STRINGS, renderWordingChangesHtml, wordingBlocks, wordingChangesAsText } from "./wordingSection";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const LOCALES: Locale[] = ["en", "fr"];
const CHANGE: WordingChange = {
  purposeId: "route-reports",
  answeredVersion: 1,
  currentVersion: 2,
  answeredOn: "2026-11-05",
  answer: "granted",
  before: { label: { en: "Keep my reports", fr: "Garder mes signalements" }, description: { en: "Keep reports on this device.", fr: "Garder les signalements sur cet appareil." } },
  after: { label: { en: "Keep my reports", fr: "Garder mes signalements" }, description: { en: "Keep reports on this device and share a copy.", fr: "Garder les signalements sur cet appareil et en partager une copie." } },
  notes: [{ en: "Sharing a copy was added.", fr: "Le partage d’une copie a été ajouté." }],
};
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("wordingBlocks", () => {
  it("gives the title, the answer with its date, both wordings and the notes", () => {
    const [b] = wordingBlocks("en", [CHANGE]);
    expect(b).toMatchObject({ id: "route-reports", title: "Keep my reports", answered: "You answered yes on 2026-11-05.", earlier: "Keep reports on this device.", now: "Keep reports on this device and share a copy.", notes: ["Sharing a copy was added."] });
  });
  it("says no for a declined answer, in both languages", () => {
    expect(wordingBlocks("en", [{ ...CHANGE, answer: "declined" }])[0]?.answered).toBe("You answered no on 2026-11-05.");
    expect(wordingBlocks("fr", [{ ...CHANGE, answer: "declined" }])[0]?.answered).toBe("Vous avez répondu non le 2026-11-05.");
  });
  it("shows the comparison as added words only for a pure addition", () => {
    const d = wordingBlocks("en", [CHANGE])[0]?.diff ?? [];
    expect(d.map((s) => s.kind)).toEqual(["same", "removed", "added"]);
  });
  it("shows no comparison and no earlier wording when the earlier wording is not on record", () => {
    const b = wordingBlocks("en", [{ ...CHANGE, before: null }])[0];
    expect(b).toMatchObject({ earlier: null, diff: null, spacingOnly: false });
  });
  it("shows the label before and now only when the label changed", () => {
    expect(wordingBlocks("en", [CHANGE])[0]).toMatchObject({ labelEarlier: null, labelNow: null });
    const changed = { ...CHANGE, after: { ...CHANGE.after, label: { en: "Keep and share my reports", fr: "Garder et partager mes signalements" } } };
    expect(wordingBlocks("en", [changed])[0]).toMatchObject({ labelEarlier: "Keep my reports", labelNow: "Keep and share my reports" });
  });
  it("says only spacing changed when the words are the same", () => {
    const spaced = { ...CHANGE, after: { ...CHANGE.after, description: { en: "Keep  reports on this device.", fr: CHANGE.after.description.fr } } };
    expect(wordingBlocks("en", [spaced])[0]?.spacingOnly).toBe(true);
  });
});

describe("renderWordingChangesHtml", () => {
  it("renders nothing when no choice needs answering again", () => {
    for (const l of LOCALES) expect(renderWordingChangesHtml(l, [])).toBe("");
  });
  it("has a labelled group, a heading for each choice and the note", () => {
    const html = renderWordingChangesHtml("en", [CHANGE]);
    expect(html).toContain('data-privacy-wording-changes role="group" aria-labelledby="privacy-wording-title"');
    expect(html).toContain('<h4 id="privacy-wording-route-reports">Keep my reports</h4>');
    expect(textOf(html)).toContain("Your earlier answer no longer counts");
  });
  it("shows what was removed and added as words, not by colour", () => {
    const html = renderWordingChangesHtml("en", [{ ...CHANGE, after: { ...CHANGE.after, description: { en: "Keep reports on your device.", fr: "x" } } }]);
    expect(html).toContain('<li data-change="removed"><strong>Removed:</strong> “this”</li>');
    expect(html).toContain('<li data-change="added"><strong>Added:</strong> “your”</li>');
    expect(html).not.toMatch(/style=|<del|<ins|color/);
  });
  it("quotes the wordings with the quotation marks of the language", () => {
    expect(renderWordingChangesHtml("en", [CHANGE])).toContain("“Keep reports on this device.”");
    expect(renderWordingChangesHtml("fr", [CHANGE])).toContain("« Garder les signalements sur cet appareil. »");
  });
  it("says the earlier wording is not on record rather than showing a comparison", () => {
    const html = renderWordingChangesHtml("en", [{ ...CHANGE, before: null }]);
    expect(textOf(html)).toContain("The wording you answered under is not on record, so no comparison is shown.");
    expect(html).not.toContain("data-change=");
  });
  it("lists what the change was about", () => {
    expect(textOf(renderWordingChangesHtml("en", [CHANGE]))).toContain("What the change was about: Sharing a copy was added.");
  });
  it("gives each choice its own heading id", () => {
    const html = renderWordingChangesHtml("en", [CHANGE, { ...CHANGE, purposeId: "other" }]);
    expect(html.match(/<h4 id="privacy-wording-[a-z-]+"/g)).toEqual(['<h4 id="privacy-wording-route-reports"', '<h4 id="privacy-wording-other"']);
  });
  it("escapes the text of a wording", () => {
    const html = renderWordingChangesHtml("en", [{ ...CHANGE, after: { ...CHANGE.after, description: { en: "<script>x</script>", fr: "x" } } }]);
    expect(html).not.toContain("<script>");
  });
});

describe("wordingChangesAsText", () => {
  it("has the title, the note and a block for each change", () => {
    const f = wordingChangesAsText("en", [CHANGE], NOW);
    expect(f.mime).toBe("text/plain");
    expect(f.filename).toBe("the-app-choices-to-answer-again-2026-11-20.txt");
    expect(f.count).toBe(1);
    expect(f.text.split("\n")[0]).toBe("Choices to answer again");
    expect(f.text).toContain("Keep my reports\n  You answered yes on 2026-11-05.\n  The wording you answered under: “Keep reports on this device.”");
    expect(f.text).toContain("  Added: “device and share a copy.”");
    expect(f.text.endsWith("\n")).toBe(true);
  });
  it("says none needs answering again for no changes", () => {
    const f = wordingChangesAsText("en", [], NOW);
    expect(f.count).toBe(0);
    expect(f.text).toContain("No choice needs to be answered again.");
  });
  it("puts a no-break space before the colon in French", () => {
    const t = wordingChangesAsText("fr", [CHANGE], NOW).text;
    expect(t).toContain("Le texte actuel : « ");
    expect(t).not.toMatch(/\S: \S/);
  });
});

describe("wording", () => {
  it("passes the HTML audit and the copy lint in both languages, with and without an earlier wording", () => {
    for (const l of LOCALES) {
      for (const c of [CHANGE, { ...CHANGE, before: null }]) {
        const html = renderWordingChangesHtml(l, [c]);
        const v = auditHtml(`<section lang="${l}">${html}</section>`);
        expect(v, formatViolations(v)).toEqual([]);
        for (const t of rawTexts(html)) expect(lintCopy(l, t), t).toEqual([]);
      }
      for (const line of wordingChangesAsText(l, [CHANGE], NOW).text.split("\n")) if (line.trim() !== "") expect(lintCopy(l, line.trim()), line).toEqual([]);
    }
  });
  it("has the same shape in English and French", () => {
    const flat = (l: Locale): Record<string, string> => {
      const s = WORDING_STRINGS[l];
      return { heading: s.heading, note: s.note, answeredEarlier: s.answeredEarlier, wordingNow: s.wordingNow, labelEarlier: s.labelEarlier, labelNow: s.labelNow, removed: s.removed, added: s.added, onlySpacing: s.onlySpacing, notOnRecord: s.notOnRecord, notes: s.notes, none: s.none, fileTitle: s.fileTitle };
    };
    expect(checkParity(flat("en"), flat("fr"), {})).toEqual([]);
  });
  it("never says verified or a word for it", () => {
    for (const l of LOCALES) expect(`${renderWordingChangesHtml(l, [CHANGE])}${wordingChangesAsText(l, [CHANGE], NOW).text}`).not.toMatch(/verified|vérif/i);
  });
});
