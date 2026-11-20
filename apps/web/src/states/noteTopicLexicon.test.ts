import { describe, expect, it } from "vitest";
import { lintFrench } from "./typography";
import { CUE_TO_TOPIC, TOPICS, TOPIC_IDS, TOPIC_MAX_CUE_WORDS, TOPIC_NEGATION_REACH, TOPIC_NEGATORS, isTopicId, topicLabel } from "./noteTopicLexicon";
import { foldText } from "./suggest";

describe("the topics", () => {
  it("has one definition for each id, in the same order", () => {
    expect(TOPICS.map((d) => d.id)).toEqual([...TOPIC_IDS]);
    expect(new Set(TOPIC_IDS).size).toBe(TOPIC_IDS.length);
  });
  it("gives every topic a label in each language and at least one cue", () => {
    for (const d of TOPICS) {
      expect(d.en.trim(), d.id).not.toBe("");
      expect(d.fr.trim(), d.id).not.toBe("");
      expect(d.cues.length, d.id).toBeGreaterThan(0);
    }
  });
  it("writes each French label with the right typography and never the French word for UNKNOWN", () => {
    for (const d of TOPICS) {
      expect(lintFrench(d.fr), d.fr).toEqual([]);
      expect(d.fr).not.toMatch(/inconnu/i);
    }
  });
  it("keeps every cue folded, so it can be compared with folded words", () => {
    for (const d of TOPICS) for (const c of d.cues) expect(foldText(c), `${d.id}: ${c}`).toBe(c);
  });
  it("puts each cue under one topic only", () => {
    const all = TOPICS.flatMap((d) => d.cues);
    expect(new Set(all).size).toBe(all.length);
    expect(CUE_TO_TOPIC.size).toBe(all.length);
    for (const d of TOPICS) for (const c of d.cues) expect(CUE_TO_TOPIC.get(c)).toBe(d.id);
  });
  it("has no cue that starts another cue, so which cue is tried first cannot change what is found", () => {
    const all = TOPICS.flatMap((d) => d.cues);
    for (const a of all) for (const b of all) if (a !== b) expect(b.startsWith(`${a} `), `${a} / ${b}`).toBe(false);
  });
  it("counts the longest cue", () => {
    expect(TOPIC_MAX_CUE_WORDS).toBe(Math.max(...TOPICS.flatMap((d) => d.cues.map((c) => c.split(" ").length))));
    expect(TOPIC_MAX_CUE_WORDS).toBeGreaterThanOrEqual(3);
  });
  it("has no cue so common that it says nothing: no single letter, no cue shared with the negators", () => {
    for (const d of TOPICS) for (const c of d.cues) {
      expect(c.length, c).toBeGreaterThan(1);
      expect(TOPIC_NEGATORS.has(c), c).toBe(false);
    }
  });
  it("keeps the negators folded and the reach small", () => {
    for (const n of TOPIC_NEGATORS) expect(foldText(n)).toBe(n);
    expect(TOPIC_NEGATION_REACH).toBeGreaterThanOrEqual(1);
    expect(TOPIC_NEGATION_REACH).toBeLessThanOrEqual(3);
  });
  it("labels a topic in the language asked for", () => {
    expect(topicLabel("steps", "en")).toBe("Steps and stairs");
    expect(topicLabel("steps", "fr")).toBe("Marches et escaliers");
    expect(topicLabel("floor", "fr")).toBe("Étages");
  });
  it("recognises its ids and nothing else", () => {
    expect(TOPIC_IDS.every(isTopicId)).toBe(true);
    for (const bad of ["", "Steps", "step", null, undefined, 3, {}]) expect(isTopicId(bad)).toBe(false);
  });
});
