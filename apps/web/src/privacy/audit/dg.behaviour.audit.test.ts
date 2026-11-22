// Behaviour audit: what a person typed never comes back in the message of an error. The four tools that keep notes
// and questions on this device (the inquiry book, the preparation notebook, the handoff rehearsal and the
// reconciliation workbook) are called with a canary in every slot that takes text, in ten forms a validator may
// reject, and every error that is thrown is checked for the canary in its name, message and cause. It checks the
// calls listed here; it cannot say that no other call leaks.

import { describe, expect, it } from "vitest";
import { CANARY, MAX_MESSAGE, judge, probe, sweep, variantsOf, type Variant } from "./dgCanary";
import { addInquiryEvent, addInquiryPlace, addInquiryQuestion, decodeInquiryBook, emptyInquiryBook, renameInquiryPlace, updateInquiryQuestion, validateInquiryBook, type InquiryBook } from "../../offline/robust/accessInquiry";
import { PREPARATION_TOPICS, addPreparationEntry, newPreparationNotebook, parsePreparationNotebook, updatePreparationEntry, validatePreparationNotebook } from "../../offline/robust/accessPreparation";
import { parseHandoffBook, validateHandoffCapture } from "../../offline/robust/handoffRehearsal";
import { parseWorkbook, validateWorkbookCapture } from "../../offline/robust/reconciliationWorkbook";

const AT = "2026-11-01T10:00:00.000Z";
const LATER = "2026-11-02T10:00:00.000Z";
const place = (over: Record<string, unknown> = {}) => ({ id: "p1", label: "Cafe", area: "Downtown", plannedDate: null, createdAt: AT, updatedAt: AT, ...over }) as never;
const question = (over: Record<string, unknown> = {}) => ({ id: "q1", placeId: "p1", topic: "entrance", prompt: "Is there a step?", importance: "standard", progress: "to-ask", condition: "UNKNOWN", createdAt: AT, updatedAt: AT, ...over }) as never;
const event = (over: Record<string, unknown> = {}) => ({ id: "e1", questionId: "q1", at: LATER, channel: "phone", note: "Asked", sourceDate: null, ...over }) as never;

/** A document in which every text is the variant, at the depth where a validator would look for it. */
function everywhere(v: Variant, depth = 3): unknown {
  const o: Record<string, unknown> = {};
  for (const k of ["id", "label", "area", "note", "text", "question", "answer", "prompt", "sourceName", "sourceDate", "regionId", "region", "format", "schema", "at", "createdAt", "updatedAt", "startedAt", "kind", "status", "channel", "topic"]) o[k] = v.text;
  if (depth > 0) for (const k of ["places", "questions", "events", "entries", "history", "cells", "notes", "before", "after", "source", "sources"]) o[k] = [everywhere(v, depth - 1)];
  return o;
}

const book = (): InquiryBook => addInquiryQuestion(addInquiryPlace(emptyInquiryBook(), place()), question());

describe("the helper sees a leak", () => {
  it("is not fooled: a tool that repeats its input is caught", () => {
    const bad = sweep((v) => {
      throw new TypeError(`Invalid label ${v.text}`);
    });
    expect(bad.length).toBeGreaterThan(5);
  });
});

describe("the inquiry book", () => {
  it("starts with a valid book that the calls below build on", () => expect(book().places).toHaveLength(1));
  it.each([["id"], ["label"], ["area"], ["plannedDate"], ["createdAt"], ["updatedAt"]])("does not repeat a typed place %s in an error", (field) => expect(sweep((v) => addInquiryPlace(emptyInquiryBook(), place({ [field]: v.text })))).toEqual([]));
  it.each([["id"], ["placeId"], ["topic"], ["prompt"], ["importance"], ["progress"], ["condition"], ["createdAt"]])("does not repeat a typed question %s in an error", (field) => expect(sweep((v) => addInquiryQuestion(addInquiryPlace(emptyInquiryBook(), place()), question({ [field]: v.text })))).toEqual([]));
  it.each([["id"], ["questionId"], ["at"], ["channel"], ["note"], ["sourceDate"]])("does not repeat a typed event %s in an error", (field) => expect(sweep((v) => addInquiryEvent(book(), event({ [field]: v.text })))).toEqual([]));
  it("does not repeat a typed new label, id or time when renaming a place", () => {
    expect(sweep((v) => renameInquiryPlace(book(), "p1", v.text, LATER))).toEqual([]);
    expect(sweep((v) => renameInquiryPlace(book(), v.text, "New", LATER))).toEqual([]);
    expect(sweep((v) => renameInquiryPlace(book(), "p1", "New", v.text))).toEqual([]);
  });
  it("does not repeat a typed prompt, an id or a progress when updating a question", () => {
    expect(sweep((v) => updateInquiryQuestion(book(), "q1", { prompt: v.text }, LATER))).toEqual([]);
    expect(sweep((v) => updateInquiryQuestion(book(), v.text, { prompt: "x" }, LATER))).toEqual([]);
    expect(sweep((v) => updateInquiryQuestion(book(), "q1", { progress: v.text as never }, LATER))).toEqual([]);
  });
  it("does not repeat anything typed into a book that is read back", () => {
    expect(sweep((v) => decodeInquiryBook(JSON.stringify(everywhere(v))))).toEqual([]);
    expect(sweep((v) => validateInquiryBook(everywhere(v)))).toEqual([]);
    expect(sweep((v) => validateInquiryBook(v.text))).toEqual([]);
  });
});

describe("the preparation notebook", () => {
  const nb = () => newPreparationNotebook("toronto", AT);
  const topic = PREPARATION_TOPICS[0];
  it("does not repeat a typed id, topic or question when adding an entry", () => {
    expect(sweep((v) => addPreparationEntry(nb(), { id: v.text, topic: topic as never, question: "Is it open?" }, AT))).toEqual([]);
    expect(sweep((v) => addPreparationEntry(nb(), { id: "a", topic: v.text as never, question: "Is it open?" }, AT))).toEqual([]);
    expect(sweep((v) => addPreparationEntry(nb(), { id: "a", topic: topic as never, question: v.text }, AT))).toEqual([]);
    expect(sweep((v) => addPreparationEntry(nb(), { id: "a", topic: topic as never, question: "Is it open?", cellId: v.text }, AT))).toEqual([]);
    expect(sweep((v) => addPreparationEntry(nb(), { id: "a", topic: topic as never, question: "Is it open?" }, v.text))).toEqual([]);
  });
  const withEntry = () => addPreparationEntry(nb(), { id: "a", topic: topic as never, question: "Is it open?" }, AT);
  it.each([["answer"], ["sourceName"], ["sourceDate"], ["status"], ["evidence"]])("does not repeat a typed %s when updating an entry", (field) => expect(sweep((v) => updatePreparationEntry(withEntry(), "a", { [field]: v.text } as never, LATER))).toEqual([]));
  it("does not repeat a typed entry id or time when updating", () => {
    expect(sweep((v) => updatePreparationEntry(withEntry(), v.text, { answer: "x" } as never, LATER))).toEqual([]);
    expect(sweep((v) => updatePreparationEntry(withEntry(), "a", { answer: "x" } as never, v.text))).toEqual([]);
  });
  it("does not repeat anything typed into a notebook that is read back", () => {
    expect(sweep((v) => parsePreparationNotebook(JSON.stringify(nb()), v.text))).toEqual([]);
    expect(sweep((v) => parsePreparationNotebook(JSON.stringify(everywhere(v)), "toronto"))).toEqual([]);
    expect(sweep((v) => validatePreparationNotebook(everywhere(v), v.text))).toEqual([]);
    expect(sweep((v) => validatePreparationNotebook(nb(), v.text))).toEqual([]);
  });
});

describe("the handoff rehearsal and the reconciliation workbook", () => {
  it("do not repeat anything typed into a handoff that is read back", () => {
    expect(sweep((v) => parseHandoffBook(JSON.stringify(everywhere(v)), "toronto"))).toEqual([]);
    expect(sweep((v) => parseHandoffBook(JSON.stringify(everywhere(v)), v.text))).toEqual([]);
    expect(sweep((v) => validateHandoffCapture(everywhere(v)))).toEqual([]);
    expect(sweep((v) => validateHandoffCapture(v.text))).toEqual([]);
  });
  it("do not repeat anything typed into a workbook that is read back", () => {
    expect(sweep((v) => parseWorkbook(JSON.stringify(everywhere(v)), "toronto"))).toEqual([]);
    expect(sweep((v) => parseWorkbook(JSON.stringify(everywhere(v)), v.text))).toEqual([]);
    expect(sweep((v) => validateWorkbookCapture(everywhere(v)))).toEqual([]);
    expect(sweep((v) => validateWorkbookCapture(v.text))).toEqual([]);
  });
});

describe("known: text that is not JSON", () => {
  // The four readers pass text straight to JSON.parse, and the SyntaxError that comes back is thrown as it is. On
  // Node 22 its message repeats the start of the text that was read. This is reported to the lanes that own those
  // files and is not edited here. When a reader is changed to throw its own short message, the row for it fails
  // and must be moved up into the sweeps above.
  const readers: Array<[string, (text: string) => unknown]> = [
    ["decodeInquiryBook", (x) => decodeInquiryBook(x)],
    ["parsePreparationNotebook", (x) => parsePreparationNotebook(x, "toronto")],
    ["parseHandoffBook", (x) => parseHandoffBook(x, "toronto")],
    ["parseWorkbook", (x) => parseWorkbook(x, "toronto")],
  ];
  it.each(readers)("%s throws the raw SyntaxError of JSON.parse for text that is not JSON", (_name, read) => {
    const o = probe(() => read(CANARY));
    expect(o.threw).toBe(true);
    expect(o.name).toBe("SyntaxError");
  });
  it.each(readers)("%s throws its own short error for JSON that is not a document", (_name, read) => {
    const o = probe(() => read(JSON.stringify({ text: CANARY })));
    expect(judge(o)).toEqual({ ok: true, problems: [] });
    expect(o.name).not.toBe("SyntaxError");
  });
});

describe("the canary and its forms", () => {
  it("is not a word any of these tools writes", () => {
    const texts = [JSON.stringify(book()), JSON.stringify(newPreparationNotebook("toronto", AT)), JSON.stringify(PREPARATION_TOPICS)];
    for (const t of texts) expect(t.toLowerCase()).not.toContain(CANARY);
  });
  it("is in every form", () => {
    for (const v of variantsOf()) expect(v.text.toLowerCase()).toContain(CANARY);
  });
  it("makes errors that are short", () => {
    const o = probe(() => addInquiryPlace(emptyInquiryBook(), place({ label: variantsOf()[7]?.text })));
    expect(o.threw).toBe(true);
    expect(judge(o).ok).toBe(true);
    expect(o.message.length).toBeLessThanOrEqual(MAX_MESSAGE);
  });
});
