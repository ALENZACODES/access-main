import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import {
  BROWSER_QUESTIONS,
  BROWSER_UNKNOWN,
  EMPTY_BROWSER_READING,
  answeredQuestions,
  browserAnswerText,
  browserCheck,
  browserFindingText,
  browserHost,
  browserQuestionName,
  browserSize,
  browserSummary,
  checkBrowser,
  cleanBytes,
  cleanLanguage,
  readBrowser,
  type BrowserEnv,
  type BrowserHost,
  type BrowserReading,
} from "./browserLive";

const full: BrowserReading = { language: "fr-CA", online: true, contrast: false, motion: true, usage: 12_345_678, quota: 50_000_000_000, persisted: false };

describe("cleanLanguage", () => {
  it("keeps a language tag as the browser writes it", () => {
    for (const v of ["en", "fr", "fr-CA", "en-US", "zh-Hant-TW", "de-CH-1996", "sr-Latn-RS"]) expect(cleanLanguage(v), v).toBe(v);
  });

  it("trims spaces", () => {
    expect(cleanLanguage("  fr-CA ")).toBe("fr-CA");
  });

  it("gives null for a value that is not a language tag", () => {
    for (const v of ["", " ", "e", "fr_CA", "englishlang", "fr-", "-fr", "fr CA", "<b>", "fr-CA-aaaaaaaaa", "x".repeat(40), "fr\u0000", "fr\nCA"]) expect(cleanLanguage(v), JSON.stringify(v)).toBeNull();
  });

  it("gives null for anything that is not text", () => {
    for (const v of [undefined, null, 0, 1, true, {}, [], ["fr"], () => "fr", Symbol("x")]) expect(cleanLanguage(v)).toBeNull();
  });

  it("does not accept a tag longer than thirty-five characters", () => {
    expect(cleanLanguage(`fr-${"a".repeat(8)}-${"b".repeat(8)}-${"c".repeat(8)}-${"d".repeat(8)}`)).toBeNull();
  });
});

describe("cleanBytes", () => {
  it("keeps a whole, finite, non-negative number", () => {
    expect(cleanBytes(0)).toBe(0);
    expect(cleanBytes(1234)).toBe(1234);
    expect(cleanBytes(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rounds a fraction to the nearest whole byte", () => {
    expect(cleanBytes(10.4)).toBe(10);
    expect(cleanBytes(10.6)).toBe(11);
  });

  it("gives null for anything else", () => {
    for (const v of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 60, "12", null, undefined, true, {}, [5]]) expect(cleanBytes(v), String(v)).toBeNull();
  });
});

describe("readBrowser", () => {
  const host = (over: Partial<BrowserHost> = {}): BrowserHost => ({
    language: () => "fr-CA",
    online: () => true,
    prefers: (s) => s === "motion",
    storage: async () => ({ usage: 100, quota: 1000, persisted: true }),
    ...over,
  });

  it("gives the answers the host gives", async () => {
    expect(await readBrowser(host())).toEqual({ language: "fr-CA", online: true, contrast: false, motion: true, usage: 100, quota: 1000, persisted: true });
  });

  it("asks each question once, and the display settings by name", async () => {
    const asked: string[] = [];
    await readBrowser({
      language: () => (asked.push("language"), "en"),
      online: () => (asked.push("online"), true),
      prefers: (s) => (asked.push(s), false),
      storage: async () => (asked.push("storage"), {}),
    });
    expect(asked).toEqual(["language", "online", "contrast", "motion", "storage"]);
  });

  it("calls the host's own methods with the host as this", async () => {
    const self = { seen: [] as unknown[], language() { this.seen.push(this); return "en"; }, prefers(this: { seen: unknown[] }) { this.seen.push(this); return false; } };
    await readBrowser(self);
    expect(self.seen).toHaveLength(3);
    expect(self.seen.every((x) => x === self)).toBe(true);
  });

  it("leaves a missing question unknown", async () => {
    expect(await readBrowser({})).toEqual(EMPTY_BROWSER_READING);
    expect((await readBrowser({ language: () => "en" })).online).toBeNull();
  });

  it("leaves a question unknown when the host throws, and still asks the others", async () => {
    const r = await readBrowser(host({ language: () => { throw new Error("no"); }, prefers: () => { throw new Error("no"); } }));
    expect([r.language, r.contrast, r.motion]).toEqual([null, null, null]);
    expect(r.online).toBe(true);
    expect(r.usage).toBe(100);
  });

  it("leaves the storage questions unknown when the storage answer rejects", async () => {
    const r = await readBrowser(host({ storage: () => Promise.reject(new Error("no")) }));
    expect([r.usage, r.quota, r.persisted]).toEqual([null, null, null]);
    expect(r.language).toBe("fr-CA");
  });

  it("leaves the storage questions unknown when the storage method throws before returning a promise", async () => {
    const r = await readBrowser(host({ storage: () => { throw new Error("no"); } }));
    expect(r.usage).toBeNull();
  });

  it("does not accept an answer of the wrong shape", async () => {
    const r = await readBrowser({
      language: () => 42,
      online: () => "yes",
      prefers: () => 1,
      storage: async () => ({ usage: "100", quota: -5, persisted: "true" }),
    });
    expect(r).toEqual(EMPTY_BROWSER_READING);
  });

  it("does not accept a storage answer that is not an object", async () => {
    for (const v of [null, undefined, 5, "x"]) expect(await readBrowser({ storage: async () => v as never }), String(v)).toEqual(EMPTY_BROWSER_READING);
  });

  it("keeps a partial storage answer", async () => {
    const r = await readBrowser({ storage: async () => ({ usage: 5 }) });
    expect([r.usage, r.quota, r.persisted]).toEqual([5, null, null]);
  });

  it("gives a new object each time and never changes the empty reading", async () => {
    const a = await readBrowser({});
    a.language = "fr";
    expect(EMPTY_BROWSER_READING.language).toBeNull();
    expect(await readBrowser({})).toEqual(EMPTY_BROWSER_READING);
  });
});

describe("answeredQuestions and checkBrowser", () => {
  it("counts all six for a full reading and none for an empty one", () => {
    expect(answeredQuestions(full)).toEqual([...BROWSER_QUESTIONS]);
    expect(answeredQuestions(EMPTY_BROWSER_READING)).toEqual([]);
  });

  it("counts storage only when both numbers came", () => {
    expect(answeredQuestions({ ...full, quota: null })).not.toContain("storage");
    expect(answeredQuestions({ ...full, usage: null })).not.toContain("storage");
    expect(answeredQuestions({ ...full, usage: 0, quota: 0 })).toContain("storage");
  });

  it("counts a false answer as an answer", () => {
    expect(answeredQuestions({ ...EMPTY_BROWSER_READING, online: false, contrast: false, motion: false, persisted: false })).toEqual(["online", "contrast", "motion", "persisted"]);
  });

  it("gives a finding for each question with no answer, in order", () => {
    expect(checkBrowser(EMPTY_BROWSER_READING)).toEqual(BROWSER_QUESTIONS.map((question) => ({ code: "no-answer", question })));
    expect(checkBrowser(full)).toEqual([]);
  });

  it("says when the device is offline now, after the missing answers", () => {
    expect(checkBrowser({ ...full, online: false })).toEqual([{ code: "offline-now", question: "online" }]);
    expect(checkBrowser({ ...full, language: null, online: false })).toEqual([
      { code: "no-answer", question: "language" },
      { code: "offline-now", question: "online" },
    ]);
  });

  it("builds the view the panel keeps", () => {
    const v = browserCheck({ ...full, language: null });
    expect(v.answered).toBe(5);
    expect(v.findings).toHaveLength(1);
    expect(v.reading.language).toBeNull();
  });
});

describe("browserSize", () => {
  it("writes small sizes in bytes", () => {
    expect(browserSize("en", 0)).toBe("0 B");
    expect(browserSize("en", 999)).toBe("999 B");
  });

  it("uses decimal units with at most two figures that matter", () => {
    expect(browserSize("en", 1000)).toBe("1 kB");
    expect(browserSize("en", 1500)).toBe("1.5 kB");
    expect(browserSize("en", 12_345_678)).toBe("12 MB");
    expect(browserSize("en", 9_950_000)).toBe("9.9 MB");
    expect(browserSize("en", 50_000_000_000)).toBe("50 GB");
    expect(browserSize("en", 2_500_000_000_000)).toBe("2.5 TB");
  });

  it("stops at terabytes", () => {
    expect(browserSize("en", 5e15)).toBe("5000 TB");
  });

  it("writes French units, a decimal comma and a no-break space", () => {
    expect(browserSize("fr", 1500)).toBe("1,5 ko");
    expect(browserSize("fr", 12_345_678)).toBe("12 Mo");
    expect(browserSize("fr", 10)).toBe("10 o");
  });

  it("writes whole numbers without a trailing .0", () => {
    expect(browserSize("en", 2000)).toBe("2 kB");
    expect(browserSize("fr", 2000)).toBe("2 ko");
  });
});

describe("browserAnswerText", () => {
  it("says each answer in plain words, in both languages", () => {
    expect(BROWSER_QUESTIONS.map((q) => browserAnswerText("en", q, full))).toEqual(["fr-CA", "Yes", "No", "Yes", "12 MB of 50 GB", "No"]);
    expect(BROWSER_QUESTIONS.map((q) => browserAnswerText("fr", q, full))).toEqual(["fr-CA", "Oui", "Non", "Oui", "12 Mo sur 50 Go", "Non"]);
  });

  it("says unknown, never no, for a question with no answer", () => {
    for (const q of BROWSER_QUESTIONS) {
      expect(browserAnswerText("en", q, EMPTY_BROWSER_READING), q).toBe("Unknown");
      expect(browserAnswerText("fr", q, EMPTY_BROWSER_READING), q).toBe("Inconnu");
    }
  });

  it("says storage is unknown when only one of its numbers came", () => {
    expect(browserAnswerText("en", "storage", { ...full, quota: null })).toBe("Unknown");
  });

  it("has the unknown words in both languages", () => {
    expect(BROWSER_UNKNOWN).toEqual({ en: "Unknown", fr: "Inconnu" });
  });
});

describe("the words", () => {
  it("names each question in both languages, and they differ", () => {
    for (const q of BROWSER_QUESTIONS) {
      expect(browserQuestionName("en", q).length).toBeGreaterThan(10);
      expect(browserQuestionName("fr", q)).not.toBe(browserQuestionName("en", q));
    }
  });

  it("says a missing answer and an offline device, and passes the copy rules", () => {
    for (const q of BROWSER_QUESTIONS) {
      for (const l of ["en", "fr"] as const) {
        const t = browserFindingText(l, { code: "no-answer", question: q });
        expect(lintCopy(l, t), t).toEqual([]);
        expect(t).toContain(browserQuestionName(l, q));
      }
    }
    expect(browserFindingText("en", { code: "offline-now", question: "online" })).toBe("Your device says it is offline right now.");
    expect(browserFindingText("fr", { code: "offline-now", question: "online" })).toBe("Votre appareil se dit hors ligne en ce moment.");
  });

  it("puts a no-break space before the colon in French", () => {
    expect(browserFindingText("fr", { code: "no-answer", question: "language" })).toBe("La langue du navigateur : le navigateur n’a pas répondu.");
  });

  it("writes the summary with the right plural, in both languages", () => {
    expect(browserSummary("en", 0)).toBe("0 answers to 6 questions.");
    expect(browserSummary("en", 1, 1)).toBe("1 answer to 1 question.");
    expect(browserSummary("en", 6)).toBe("6 answers to 6 questions.");
    expect(browserSummary("fr", 0)).toBe("0 réponse sur 6 questions.");
    expect(browserSummary("fr", 1, 1)).toBe("1 réponse sur 1 question.");
    expect(browserSummary("fr", 6)).toBe("6 réponses sur 6 questions.");
  });

  it("does not use the word verified or its French forms", () => {
    for (const l of ["en", "fr"] as const) expect(browserSummary(l, 3)).not.toMatch(/verif|vérif/i);
  });
});

describe("browserHost over a browser", () => {
  const calls: string[] = [];
  const env = (over: Partial<BrowserEnv> = {}): BrowserEnv => ({
    navigator: {
      language: "fr-CA",
      onLine: true,
      storage: {
        estimate: async () => (calls.push("estimate"), { usage: 5, quota: 50 }),
        persisted: async () => (calls.push("persisted"), true),
        persist: async () => (calls.push("persist"), true),
      } as never,
    },
    matchMedia: (q) => (calls.push(q), { matches: q.includes("contrast") }),
    ...over,
  });

  it("answers the six questions from the browser", async () => {
    calls.length = 0;
    expect(await readBrowser(browserHost(env()))).toEqual({ language: "fr-CA", online: true, contrast: true, motion: false, usage: 5, quota: 50, persisted: true });
  });

  it("asks only the two display settings the App asks about", async () => {
    calls.length = 0;
    await readBrowser(browserHost(env()));
    expect(calls.filter((c) => c.startsWith("("))).toEqual(["(prefers-contrast: more)", "(prefers-reduced-motion: reduce)"]);
  });

  it("never asks the browser to keep the data", async () => {
    calls.length = 0;
    await readBrowser(browserHost(env()));
    expect(calls).not.toContain("persist");
    expect(calls).toContain("persisted");
  });

  it("leaves everything unknown for a browser with nothing", async () => {
    expect(await readBrowser(browserHost({}))).toEqual(EMPTY_BROWSER_READING);
    expect(await readBrowser(browserHost({ navigator: {} }))).toEqual(EMPTY_BROWSER_READING);
  });

  it("keeps the other answer when only one storage call fails", async () => {
    const e = env();
    (e.navigator!.storage as { estimate: () => Promise<never> }).estimate = () => Promise.reject(new Error("no"));
    expect(await readBrowser(browserHost(e))).toMatchObject({ usage: null, quota: null, persisted: true });
    const f = env();
    (f.navigator!.storage as { persisted: () => Promise<never> }).persisted = () => Promise.reject(new Error("no"));
    expect(await readBrowser(browserHost(f))).toMatchObject({ usage: 5, quota: 50, persisted: null });
  });

  it("leaves a display setting unknown when matchMedia throws or answers nothing", async () => {
    expect(await readBrowser(browserHost(env({ matchMedia: () => { throw new Error("no"); } })))).toMatchObject({ contrast: null, motion: null });
    expect(await readBrowser(browserHost(env({ matchMedia: () => undefined })))).toMatchObject({ contrast: null, motion: null });
  });

  it("does not read anything beyond the six: not the user agent, the screen or the memory", async () => {
    const touched: string[] = [];
    const spy = new Proxy({ language: "en", onLine: true }, { get: (t, k) => (touched.push(String(k)), Reflect.get(t, k)) });
    await readBrowser(browserHost({ navigator: spy as never }));
    expect([...new Set(touched)].sort()).toEqual(["language", "onLine", "storage"]);
  });

  it("uses the real browser by default and does not throw where there is none", async () => {
    await expect(readBrowser(browserHost())).resolves.toBeDefined();
  });
});
