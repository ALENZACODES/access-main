import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import {
  EMPTY_SAVE_READING,
  SAVE_QUESTIONS,
  SAVE_UNKNOWN,
  answeredSave,
  checkSave,
  readSave,
  saveAnswerText,
  saveCheck,
  saveFindingText,
  saveHost,
  saveQuestionName,
  saveSummary,
  type SaveEnv,
  type SaveHost,
  type SaveReading,
} from "./saveLive";

const ALL: SaveHost = { blob: () => true, address: () => true, attribute: () => true };
const reading = (over: Partial<SaveReading> = {}): SaveReading => ({ blob: true, address: true, attribute: true, ...over });

describe("readSave", () => {
  it("keeps a plain yes or no", () => {
    expect(readSave(ALL)).toEqual({ blob: true, address: true, attribute: true });
    expect(readSave({ blob: () => false, address: () => false, attribute: () => false })).toEqual({ blob: false, address: false, attribute: false });
  });

  it("says unknown for a question the host does not have", () => {
    expect(readSave({})).toEqual(EMPTY_SAVE_READING);
    expect(readSave({ blob: () => true })).toEqual({ blob: true, address: null, attribute: null });
  });

  it("says unknown, not No, for an answer that is not a yes or a no", () => {
    for (const v of [undefined, null, 0, 1, "", "true", "yes", {}, [], () => true, Symbol("s"), Number.NaN]) {
      expect(readSave({ blob: () => v }).blob, String(typeof v)).toBeNull();
    }
  });

  it("says unknown for a question that throws, and still asks the others", () => {
    const boom = (): never => {
      throw new Error("no");
    };
    expect(readSave({ blob: boom, address: () => true, attribute: boom })).toEqual({ blob: null, address: true, attribute: null });
  });

  it("ignores a member that is not a function", () => {
    expect(readSave({ blob: true as never, address: "x" as never })).toEqual(EMPTY_SAVE_READING);
  });

  it("calls each method on the host, so a method that uses this still works", () => {
    const host = {
      yes: true,
      blob(this: { yes: boolean }) {
        return this.yes;
      },
    };
    expect(readSave(host).blob).toBe(true);
  });

  it("asks each question once", () => {
    const calls: string[] = [];
    readSave({ blob: () => calls.push("blob") && true, address: () => calls.push("address") && true, attribute: () => calls.push("attribute") && true });
    expect(calls).toEqual(["blob", "address", "attribute"]);
  });

  it("does not change the host", () => {
    const host = { ...ALL };
    readSave(host);
    expect(Object.keys(host)).toEqual(["blob", "address", "attribute"]);
  });
});

describe("answers and findings", () => {
  it("lists the questions that got a yes or no, in order", () => {
    expect(answeredSave(reading())).toEqual(["blob", "address", "attribute"]);
    expect(answeredSave(reading({ blob: null, attribute: false }))).toEqual(["address", "attribute"]);
    expect(answeredSave(EMPTY_SAVE_READING)).toEqual([]);
  });

  it("has no finding when all three are yes", () => {
    expect(checkSave(reading())).toEqual([]);
  });

  it("has a no-answer finding for a question left unknown", () => {
    expect(checkSave(reading({ address: null }))).toEqual([{ code: "no-answer", question: "address" }]);
  });

  it("has a missing finding for a question the browser said No to", () => {
    expect(checkSave(reading({ blob: false }))).toEqual([{ code: "missing", question: "blob" }]);
  });

  it("keeps the order of the questions when there are several findings", () => {
    expect(checkSave({ blob: null, address: false, attribute: null }).map((f) => `${f.code}:${f.question}`)).toEqual(["no-answer:blob", "missing:address", "no-answer:attribute"]);
  });

  it("builds the view the panel keeps", () => {
    const v = saveCheck(reading({ attribute: false }));
    expect(v.answered).toBe(3);
    expect(v.findings).toEqual([{ code: "missing", question: "attribute" }]);
    expect(v.reading).toEqual(reading({ attribute: false }));
  });
});

describe("the words", () => {
  it("names each question in both languages, and they differ", () => {
    for (const q of SAVE_QUESTIONS) {
      expect(saveQuestionName("en", q).length).toBeGreaterThan(8);
      expect(saveQuestionName("fr", q)).not.toBe(saveQuestionName("en", q));
    }
  });

  it("answers Yes, No or Unknown, in both languages", () => {
    expect([saveAnswerText("en", "blob", reading()), saveAnswerText("en", "blob", reading({ blob: false })), saveAnswerText("en", "blob", reading({ blob: null }))]).toEqual(["Yes", "No", "Unknown"]);
    expect([saveAnswerText("fr", "blob", reading()), saveAnswerText("fr", "blob", reading({ blob: false })), saveAnswerText("fr", "blob", reading({ blob: null }))]).toEqual(["Oui", "Non", "Inconnu"]);
    expect(SAVE_UNKNOWN).toEqual({ en: "Unknown", fr: "Inconnu" });
  });

  it("says a missing thing in words, and does not claim the download fails", () => {
    const f = { code: "missing", question: "address" } as const;
    expect(saveFindingText("en", f)).toBe("Making an address for the file: the browser says this is not available here, so a download button may do nothing.");
    expect(saveFindingText("fr", f)).toBe("Fabriquer une adresse pour le fichier\u00A0: le navigateur dit que ce n’est pas possible ici, alors le bouton d’un téléchargement peut ne rien faire.");
  });

  it("says an unanswered question in words", () => {
    const f = { code: "no-answer", question: "blob" } as const;
    expect(saveFindingText("en", f)).toBe("Making a file in memory: the browser gave no answer.");
    expect(saveFindingText("fr", f)).toBe("Fabriquer un fichier en mémoire\u00A0: le navigateur n’a pas répondu.");
  });

  it("writes the summary with the right plural, in both languages", () => {
    expect([saveSummary("en", 3), saveSummary("en", 1, 1), saveSummary("en", 0)]).toEqual(["3 answers to 3 questions.", "1 answer to 1 question.", "0 answers to 3 questions."]);
    expect([saveSummary("fr", 3), saveSummary("fr", 1, 1), saveSummary("fr", 0)]).toEqual(["3 réponses sur 3 questions.", "1 réponse sur 1 question.", "0 réponse sur 3 questions."]);
  });

  it("passes the copy rules, in every state", () => {
    const states: SaveReading[] = [reading(), reading({ blob: false }), reading({ address: null }), EMPTY_SAVE_READING];
    for (const l of ["en", "fr"] as const) {
      for (const q of SAVE_QUESTIONS) {
        expect(lintCopy(l, saveQuestionName(l, q))).toEqual([]);
        for (const r of states) expect(lintCopy(l, saveAnswerText(l, q, r))).toEqual([]);
        for (const code of ["missing", "no-answer"] as const) expect(lintCopy(l, saveFindingText(l, { code, question: q })), `${l} ${code} ${q}`).toEqual([]);
      }
      expect(lintCopy(l, saveSummary(l, 2))).toEqual([]);
    }
  });

  it("never says verified, in either language", () => {
    for (const l of ["en", "fr"] as const) for (const q of SAVE_QUESTIONS) expect(saveFindingText(l, { code: "missing", question: q })).not.toMatch(/verif|vérif/i);
  });
});

describe("saveHost over a made-up browser", () => {
  const link = { download: "" };
  const env = (over: Partial<SaveEnv> = {}): SaveEnv => ({ Blob: function Blob() {}, URL: { createObjectURL: () => "blob:x" }, document: { createElement: () => link }, ...over });

  it("says yes when the three things are there", () => {
    expect(readSave(saveHost(env()))).toEqual({ blob: true, address: true, attribute: true });
  });

  it("says No when the browser has the object but not the thing", () => {
    expect(readSave(saveHost(env({ Blob: undefined, URL: {}, document: { createElement: () => ({}) } })))).toEqual({ blob: false, address: false, attribute: false });
  });

  it("says unknown when there is nothing to look at", () => {
    expect(readSave(saveHost({ URL: undefined }))).toEqual({ blob: false, address: null, attribute: null });
    expect(readSave(saveHost({ Blob: function B() {}, URL: null, document: {} }))).toEqual({ blob: true, address: null, attribute: null });
  });

  it("says unknown when the link it makes to look at is not an object", () => {
    expect(readSave(saveHost(env({ document: { createElement: () => undefined } }))).attribute).toBeNull();
    expect(readSave(saveHost(env({ document: { createElement: () => null } }))).attribute).toBeNull();
    expect(readSave(saveHost(env({ document: { createElement: () => "a" } }))).attribute).toBeNull();
  });

  it("says unknown when making the link throws", () => {
    expect(readSave(saveHost(env({ document: { createElement: () => { throw new Error("no"); } } }))).attribute).toBeNull();
  });

  it("makes one link to look at, of the kind a download uses, and never puts it on the page", () => {
    const made: string[] = [];
    const appended: unknown[] = [];
    const doc = { createElement: (t: string) => (made.push(t), { download: "" }), body: { appendChild: (n: unknown) => appended.push(n) } };
    readSave(saveHost(env({ document: doc })));
    expect(made).toEqual(["a"]);
    expect(appended).toEqual([]);
  });

  it("never makes a file or an address, and never clicks", () => {
    let blobs = 0;
    let urls = 0;
    let clicks = 0;
    const B = function Blob() {
      blobs += 1;
    };
    const URLish = { createObjectURL: () => (urls += 1, "x"), revokeObjectURL: () => undefined };
    readSave(saveHost(env({ Blob: B, URL: URLish, document: { createElement: () => ({ download: "", click: () => (clicks += 1) }) } })));
    expect([blobs, urls, clicks]).toEqual([0, 0, 0]);
  });

  it("works in a browser where URL is a function, as the real one is", () => {
    const URLfn = Object.assign(function URL() {}, { createObjectURL: () => "x" });
    expect(readSave(saveHost(env({ URL: URLfn }))).address).toBe(true);
  });

  it("looks at the real browser of the test run without throwing", () => {
    expect(() => readSave(saveHost())).not.toThrow();
  });
});
