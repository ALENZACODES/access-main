import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { progress, pruneDone, toggleDone } from "./visitChecks";
import { VISIT_FILTERS, filterCounts, filterPlan } from "./visitFilter";
import { MAX_MAILTO_LENGTH, askableQuestions, draftMessage, mailtoHref } from "./visitMessage";
import { visitPlanToCsv, visitPlanToText, visitRows } from "./visitPlanText";
import { QUESTION_TOPICS, buildVisitPlan, questionsFor, tagQuestionCount } from "./visitQuestions";

const TODAY = "2026-11-19";
const OSM = "OpenStreetMap, Geofabrik Ontario extract";

/** A small seeded generator so a failing pack can be rebuilt from its seed. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const TAGS = ["yes", "limited", "no", "designated", "", "maybe", "UNKNOWN", undefined];
const NOTES = [undefined, undefined, "Ramp at the side door", "Rampe côté porte", "x ".repeat(150), "=1+1", 'say "hi", please'];
const NAMES = ["Alpha", "Beta, Inc.", "Café Étoile", "", "=Name", "<b>Bold</b>", "O'Neil"];

function randomPack(seed: number, size: number): PackPlaceRecord[] {
  const next = lcg(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const items = Array.from({ length: size }, (_, i) => ({
    id: `p${i}`,
    name: pick(NAMES),
    wheelchair: pick(TAGS),
    wheelchair_description: pick(NOTES),
    address: next() < 0.3 ? undefined : `${i} Main Street`,
    lat: next() < 0.2 ? undefined : 43 + next(),
    lon: next() < 0.2 ? undefined : -80 + next(),
    provenance: next() < 0.2 ? null : { source_name: OSM, licence: "ODbL-1.0", retrieved_at: next() < 0.3 ? "2024-01-01" : "2026-11-01", tier: 0 },
  }));
  return [...parsePackPlaces(items).places];
}

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 2026];
const SIZES = [0, 1, 2, 5, 12, 60];

describe("visit questions over generated packs", () => {
  for (const seed of SEEDS) {
    for (const size of SIZES) {
      const places = randomPack(seed, size);
      const label = `seed ${seed}, ${size} places`;
      const en = buildVisitPlan(places, 2, "en", TODAY);
      const fr = buildVisitPlan(places, 2, "fr", TODAY);

      it(`makes one entry per place, each with a tag question and a last contact question (${label})`, () => {
        expect(en.places.map((p) => p.id)).toEqual(places.map((p) => p.id));
        expect(tagQuestionCount(en)).toBe(places.length);
        for (const p of en.places) expect(p.questions[p.questions.length - 1]!.topic).toBe("contact");
      });

      it(`counts questions the same way however they are added up (${label})`, () => {
        expect(en.total).toBe(en.places.reduce((n, p) => n + p.questions.length, 0));
        expect(visitRows(en)).toHaveLength(en.total);
        expect(visitPlanToCsv(en).split("\r\n")).toHaveLength(en.total + 2);
        expect(visitPlanToText(en, "en", TODAY).match(/\[ \] \d+\. /g)?.length ?? 0).toBe(en.total);
      });

      it(`gives every question a distinct key and asks in the fixed order (${label})`, () => {
        const keys = en.places.flatMap((p) => p.questions.map((q) => q.key));
        expect(new Set(keys).size).toBe(keys.length);
        for (const p of en.places) {
          const ranks = p.questions.map((q) => QUESTION_TOPICS.indexOf(q.topic));
          expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
        }
      });

      it(`asks the same questions in both languages (${label})`, () => {
        expect(fr.places.map((p) => p.questions.map((q) => [q.key, q.topic]))).toEqual(en.places.map((p) => p.questions.map((q) => [q.key, q.topic])));
        expect(fr.total).toBe(en.total);
      });

      it(`puts every question and its basis in the text and CSV (${label})`, () => {
        const text = visitPlanToText(en, "en", TODAY);
        const csv = visitPlanToCsv(en);
        for (const p of en.places) {
          for (const q of p.questions) {
            expect(text).toContain(q.text);
            expect(text).toContain(q.basis);
          }
        }
        expect(csv.length > 0).toBe(true);
      });

      it(`keeps the French text clean and free of INCONNU and a straight apostrophe (${label})`, () => {
        const text = visitPlanToText(fr, "fr", TODAY);
        expect(text).not.toMatch(/INCONNU/i);
        const packWords = new Set(places.map((p) => p.name));
        for (const line of text.split("\n")) {
          // A place's name and a quoted note are the pack's own words, so they are not the App's copy to lint.
          if (line.includes("«") || packWords.has(line)) continue;
          expect(lintCopy(line, "fr"), line).toEqual([]);
        }
      });

      it(`makes a place's questions the same each time, whatever else is in the plan (${label})`, () => {
        for (const p of places.slice(0, 5)) {
          expect(questionsFor(p, "en", TODAY)).toEqual(en.places.find((x) => x.id === p.id)!.questions);
        }
      });

      it(`ticks and unticks without losing track (${label})`, () => {
        const keys = en.places.flatMap((p) => p.questions.map((q) => q.key));
        let done: ReadonlySet<string> = new Set();
        for (const k of keys) done = toggleDone(done, k);
        expect(progress(done, en)).toEqual({ asked: keys.length, total: en.total });
        for (const k of keys) done = toggleDone(done, k);
        expect(progress(done, en).asked).toBe(0);
        expect(pruneDone(new Set([...keys, "zzz:contact:0"]), en).size).toBe(keys.length);
      });
    }
  }
});

describe("what the questions never do", () => {
  const places = randomPack(5, 60);
  const all = (["en", "fr"] as const).flatMap((locale) => buildVisitPlan(places, 0, locale, TODAY).places.flatMap((p) => p.questions.map((q) => ({ locale, q }))));
  it("has questions to look at", () => {
    expect(all.length).toBeGreaterThan(100);
  });
  it("never ends a question without a question mark, in either language", () => {
    for (const { q, locale } of all.filter((x) => x.q.topic !== "note")) expect(q.text.endsWith(locale === "fr" ? " ?" : "?"), q.text).toBe(true);
  });
  it("never leaves an escape sequence or a stray backslash in a question", () => {
    for (const { q } of all) expect(`${q.text} ${q.basis}`).not.toContain("\\");
  });
  it("never states an answer: no question says a place is or is not accessible", () => {
    for (const { q } of all) expect(q.text).not.toMatch(/\b(is|are) (fully |wheelchair )?accessible\b|\bn'est pas accessible|\best accessible\b/i);
  });
  it("never uses ranking, safety or advice words", () => {
    for (const { q } of all) expect(`${q.text} ${q.basis}`).not.toMatch(/\b(best|worst|better|safe|safest|recommend\w*|suitable|should|meilleur\w*|sûr\w*|recommand\w*|devriez)\b/i);
  });
  it("never uses the words verified or vérifié", () => {
    for (const { q } of all) expect(`${q.text} ${q.basis}`).not.toMatch(/verif|vérif/i);
  });
});

describe("filters and messages over generated packs", () => {
  for (const seed of SEEDS) {
    const places = randomPack(seed, 30);
    const plan = buildVisitPlan(places, 0, "en", TODAY);
    // Tick every third question, in plan order, so the not-asked filter has something to leave out.
    const keys = plan.places.flatMap((p) => p.questions.map((q) => q.key));
    const done = new Set(keys.filter((_, i) => i % 3 === 0));

    it(`never shows a question the plan does not hold, and never changes one (seed ${seed})`, () => {
      const byKey = new Map(plan.places.flatMap((p) => p.questions.map((q) => [q.key, q] as const)));
      for (const f of VISIT_FILTERS) {
        for (const p of filterPlan(plan, f, done).places) for (const q of p.questions) expect(byKey.get(q.key), q.key).toEqual(q);
      }
    });

    it(`counts each filter as the questions it shows, with the not-asked count falling by the ticks (seed ${seed})`, () => {
      const counts = filterCounts(plan, done);
      for (const f of VISIT_FILTERS) expect(counts[f]).toBe(filterPlan(plan, f, done).total);
      expect(counts["not-asked"]).toBe(plan.total - done.size);
      expect(counts["way-in"] + counts.record + plan.places.length).toBe(plan.total);
    });

    it(`makes a message only for places with a question left, listing exactly those (seed ${seed})`, () => {
      for (const p of plan.places) {
        const left = askableQuestions(p, done);
        const message = draftMessage(p, "en", done);
        if (left.length === 0) expect(message).toBeNull();
        else {
          expect(message!.body.match(/^\d+\. /gm)).toHaveLength(left.length);
          for (const q of left) expect(message!.body).toContain(q.text);
          for (const q of p.questions.filter((x) => !left.includes(x))) expect(message!.body).not.toContain(q.text);
        }
      }
    });

    it(`gives a mail link only when it fits, and one that reads back to the message (seed ${seed})`, () => {
      for (const p of plan.places) {
        const message = draftMessage(p, "en");
        if (message === null) continue;
        const href = mailtoHref(message);
        if (href === null) continue;
        expect(href.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH);
        expect(new URLSearchParams(href.slice("mailto:?".length)).get("body")).toBe(message.body.replace(/\n/g, "\r\n"));
      }
    });
  }
});
