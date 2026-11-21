import { describe, expect, it } from "vitest";
import {
  addInquiryEvent, addInquiryPlace, addInquiryQuestion, addTemplateQuestions,
  decodeInquiryBook, emptyInquiryBook, encodeInquiryBook, inquiryPage,
  inquiryQuestionCoverage, inquirySummary, inquiryUnansweredByTopic,
  INQUIRY_TEMPLATES, INQUIRY_TOPICS, removeInquiryEvent, removeInquiryPlace,
  removeInquiryQuestion, renameInquiryPlace, replaceInquiryEvent, rescheduleInquiryPlace,
  updateInquiryQuestion, validateInquiryBook, type InquiryBook, type InquiryEvent,
  type InquiryPlace, type InquiryQuestion, type InquiryTopic,
} from "./accessInquiry";

const first = "2026-11-20T10:00:00.000Z";
const second = "2026-11-20T11:00:00.000Z";
const third = "2026-11-20T12:00:00.000Z";
const place: InquiryPlace = {
  id: "library", label: "Public library", area: "Ontario",
  plannedDate: "2026-12-01", createdAt: first, updatedAt: first,
};
const question: InquiryQuestion = {
  id: "entry-question", placeId: "library", topic: "entrance",
  prompt: "Which entrance avoids steps?", importance: "essential", progress: "to-ask",
  condition: "UNKNOWN", createdAt: first, updatedAt: first,
};
const event: InquiryEvent = {
  id: "event-1", questionId: "entry-question", at: second,
  channel: "phone", note: "Asked about the side entrance", sourceDate: "2026-11-20",
};
const book = (): InquiryBook => addInquiryQuestion(addInquiryPlace(emptyInquiryBook(), place), question);
const withEvent = (): InquiryBook => addInquiryEvent(book(), event);

describe("access inquiry book lifecycle", () => {
  it("starts empty with a versioned format", () => {
    expect(emptyInquiryBook()).toEqual({ format: "access-inquiry-book-v1", places: [], questions: [], events: [] });
  });
  it("does not reuse the same mutable array between empty books", () => {
    expect(emptyInquiryBook()).not.toBe(emptyInquiryBook());
  });
  it("adds a place without creating an accessibility assertion", () => {
    expect(addInquiryPlace(emptyInquiryBook(), place).places).toEqual([place]);
  });
  it("adds an explicitly unknown question", () => {
    expect(book().questions[0]?.condition).toBe("UNKNOWN");
  });
  it("does not mutate the original empty book", () => {
    const original = emptyInquiryBook();
    addInquiryPlace(original, place);
    expect(original.places).toHaveLength(0);
  });
  it("does not mutate the original question", () => {
    const original = book();
    updateInquiryQuestion(original, question.id, { progress: "asked" }, second);
    expect(original.questions[0]?.progress).toBe("to-ask");
  });
  it("updates a label without erasing questions", () => {
    const updated = renameInquiryPlace(book(), place.id, "Community venue", second);
    expect(updated.places[0]?.label).toBe("Community venue");
    expect(updated.questions).toHaveLength(1);
  });
  it("tracks a changed planned date", () => {
    const updated = rescheduleInquiryPlace(book(), place.id, "2026-12-09", second);
    expect(updated.places[0]?.plannedDate).toBe("2026-12-09");
  });
  it("permits explicitly unknown visit dates", () => {
    expect(rescheduleInquiryPlace(book(), place.id, null, second).places[0]?.plannedDate).toBeNull();
  });
  it("requires an existing place for changes", () => {
    expect(() => renameInquiryPlace(book(), "absent", "A", second)).toThrow();
  });
  it("removes related questions and events when a place is removed", () => {
    expect(removeInquiryPlace(withEvent(), place.id)).toMatchObject({ places: [], questions: [], events: [] });
  });
  it("does not allow deleting a missing place", () => {
    expect(() => removeInquiryPlace(book(), "absent")).toThrow();
  });
  it("keeps reply notes after changing question progress", () => {
    const updated = updateInquiryQuestion(withEvent(), question.id, { progress: "reply-noted" }, third);
    expect(updated.events).toHaveLength(1);
    expect(updated.questions[0]?.progress).toBe("reply-noted");
  });
  it("never updates physical conditions when a reply is recorded", () => {
    const updated = updateInquiryQuestion(withEvent(), question.id, { progress: "reply-noted" }, third);
    expect(updated.questions[0]?.condition).toBe("UNKNOWN");
  });
  it("rejects fabricated condition changes at the update API", () => {
    const invalid = { ...question, condition: "accessible" };
    expect(() => validateInquiryBook({ ...book(), questions: [invalid] })).toThrow();
  });
  it("allows a question prompt to be revised", () => {
    expect(updateInquiryQuestion(book(), question.id, { prompt: "Who can describe the entrance?" }, second)
      .questions[0]?.prompt).toContain("entrance");
  });
  it("allows importance to be changed", () => {
    expect(updateInquiryQuestion(book(), question.id, { importance: "important" }, second)
      .questions[0]?.importance).toBe("important");
  });
  it("rejects changes to an unknown question", () => {
    expect(() => updateInquiryQuestion(book(), "absent", { progress: "asked" }, second)).toThrow();
  });
  it("removes question notes when deleting a question", () => {
    expect(removeInquiryQuestion(withEvent(), question.id).events).toHaveLength(0);
  });
  it("does not remove the place when deleting its last question", () => {
    expect(removeInquiryQuestion(withEvent(), question.id).places).toHaveLength(1);
  });
  it("tracks manually entered notes by question", () => {
    expect(withEvent().events[0]?.questionId).toBe(question.id);
  });
  it("does not interpret notes as proof of any physical condition", () => {
    expect(withEvent().questions[0]?.condition).toBe("UNKNOWN");
  });
  it("supports replacing an event", () => {
    const changed = replaceInquiryEvent(withEvent(), { ...event, note: "Follow-up requested" });
    expect(changed.events[0]?.note).toBe("Follow-up requested");
  });
  it("supports removing an event", () => {
    expect(removeInquiryEvent(withEvent(), event.id).events).toHaveLength(0);
  });
  it("refuses deletion of an unknown event", () => {
    expect(() => removeInquiryEvent(withEvent(), "absent")).toThrow();
  });
  it("refuses replacing an unknown event", () => {
    expect(() => replaceInquiryEvent(withEvent(), { ...event, id: "absent" })).toThrow();
  });
  it("orders manually added events chronologically", () => {
    const late = { ...event, id: "late", at: third };
    const created = addInquiryEvent(addInquiryEvent(book(), late), event);
    expect(created.events.map((item) => item.id)).toEqual(["event-1", "late"]);
  });
  it("never allows an event before its question was created", () => {
    expect(() => addInquiryEvent(book(), { ...event, at: "2026-11-19T10:00:00.000Z" })).toThrow();
  });
  it("never accepts a source date later than the event", () => {
    expect(() => addInquiryEvent(book(), { ...event, sourceDate: "2026-12-01" })).toThrow();
  });
  it("accepts an event without a source date", () => {
    expect(addInquiryEvent(book(), { ...event, sourceDate: null }).events[0]?.sourceDate).toBeNull();
  });
  it("requires a note to contain readable content", () => {
    expect(() => addInquiryEvent(book(), { ...event, note: "  " })).toThrow();
  });
  it("does not require a specific contact channel", () => {
    expect(addInquiryEvent(book(), { ...event, channel: "other" }).events[0]?.channel).toBe("other");
  });
});

describe("inquiry template catalogue", () => {
  it("has suggestions across all supported topics", () => {
    expect(new Set(INQUIRY_TEMPLATES.map((item) => item.topic)).size).toBe(INQUIRY_TOPICS.length);
  });
  it("contains no repeated template IDs", () => {
    expect(new Set(INQUIRY_TEMPLATES.map((item) => item.id)).size).toBe(INQUIRY_TEMPLATES.length);
  });
  it("uses question wording instead of unsupported answers", () => {
    expect(INQUIRY_TEMPLATES.every((item) => item.prompt.endsWith("?"))).toBe(true);
  });
  it("can add six suggested questions to a new place", () => {
    const chosen = INQUIRY_TEMPLATES.slice(0, 6).map((item) => item.id);
    const updated = addTemplateQuestions(addInquiryPlace(emptyInquiryBook(), place), place.id, chosen, first);
    expect(updated.questions).toHaveLength(6);
  });
  it("rejects repeated template choices", () => {
    const selected = INQUIRY_TEMPLATES[0]?.id ?? "";
    expect(() => addTemplateQuestions(book(), place.id, [selected, selected], second)).toThrow();
  });
  it("rejects an unknown template", () => {
    expect(() => addTemplateQuestions(book(), place.id, ["none"], second)).toThrow();
  });
  it("rejects an unknown destination", () => {
    expect(() => addTemplateQuestions(book(), "elsewhere", ["entrance-step-free"], second)).toThrow();
  });
  it("never assigns a non-UNKNOWN condition to a template", () => {
    const updated = addTemplateQuestions(addInquiryPlace(emptyInquiryBook(), place), place.id,
      INQUIRY_TEMPLATES.slice(0, 12).map((item) => item.id), first);
    expect(updated.questions.every((item) => item.condition === "UNKNOWN")).toBe(true);
  });
  for (const topic of INQUIRY_TOPICS) {
    it(`provides a valid ${topic} template`, () => {
      const sample = INQUIRY_TEMPLATES.find((item) => item.topic === topic);
      expect(sample).toBeDefined();
      expect(sample?.prompt.length).toBeGreaterThan(12);
      expect(sample?.id.length).toBeGreaterThan(3);
    });
  }
});

describe("querying, sorting and counts", () => {
  const sample = (): InquiryBook => {
    let value = book();
    value = addInquiryQuestion(value, { ...question, id: "parking", topic: "parking",
      prompt: "Is there a nearby designated parking area?", importance: "important" });
    value = addInquiryQuestion(value, { ...question, id: "transport", topic: "transit",
      prompt: "Where can transport stop?", importance: "standard" });
    return value;
  };
  it("counts missing replies without inventing accessibility", () => {
    expect(inquirySummary(sample())).toMatchObject({ places: 1, questions: 3, toAsk: 3,
      replies: 0, essentialOutstanding: 1, unknownConditions: 3 });
  });
  it("counts progress changes independently", () => {
    const value = updateInquiryQuestion(sample(), "parking", { progress: "follow-up" }, second);
    expect(inquirySummary(value).followUps).toBe(1);
  });
  it("counts recorded replies separately from note events", () => {
    const value = addInquiryEvent(sample(), event);
    expect(inquirySummary(value).replies).toBe(0);
  });
  it("retains most recent event date", () => {
    expect(inquirySummary(withEvent()).mostRecentAt).toBe(second);
  });
  it("filters by outstanding status", () => {
    const value = updateInquiryQuestion(sample(), "parking", { progress: "reply-noted" }, second);
    expect(inquiryPage(value, { filter: "outstanding" }).total).toBe(2);
  });
  it("filters by replies explicitly recorded", () => {
    const value = updateInquiryQuestion(sample(), "parking", { progress: "reply-noted" }, second);
    expect(inquiryPage(value, { filter: "reply-noted" }).rows[0]?.question.id).toBe("parking");
  });
  it("filters to essential questions", () => {
    expect(inquiryPage(sample(), { filter: "essential" }).rows.map((item) => item.question.id))
      .toEqual(["entry-question"]);
  });
  it("filters by topic", () => {
    expect(inquiryPage(sample(), { topic: "transit" }).total).toBe(1);
  });
  it("searches by service label", () => {
    expect(inquiryPage(sample(), { search: "LIBRARY" }).total).toBe(3);
  });
  it("searches by note text", () => {
    expect(inquiryPage(addInquiryEvent(sample(), event), { search: "side entrance" }).total).toBe(1);
  });
  it("searches by topic label", () => {
    expect(inquiryPage(sample(), { search: "parking" }).total).toBe(1);
  });
  it("sorts by importance", () => {
    expect(inquiryPage(sample(), { sort: "priority" }).rows[0]?.question.id).toBe("entry-question");
  });
  it("sorts by topic", () => {
    const topics = inquiryPage(sample(), { sort: "topic" }).rows.map((row) => row.question.topic);
    expect(topics).toEqual(["entrance", "parking", "transit"]);
  });
  it("sorts by most recent edit", () => {
    const value = updateInquiryQuestion(sample(), "transport", { progress: "asked" }, second);
    expect(inquiryPage(value, { sort: "recent" }).rows[0]?.question.id).toBe("transport");
  });
  it("retains insertion order by default", () => {
    expect(inquiryPage(sample()).rows.map((row) => row.question.id)).toEqual(["entry-question", "parking", "transport"]);
  });
  it("supports offset paging", () => {
    expect(inquiryPage(sample(), { limit: 2 })).toMatchObject({ total: 3, previous: false, next: true });
    expect(inquiryPage(sample(), { limit: 2, offset: 2 })).toMatchObject({ total: 3, previous: true, next: false });
  });
  it("returns empty pages beyond the last item", () => {
    expect(inquiryPage(sample(), { offset: 100 }).rows).toEqual([]);
  });
  it("returns an empty result for a nonexistent place filter", () => {
    expect(inquiryPage(sample(), { placeId: "elsewhere" }).total).toBe(0);
  });
  it("counts topic coverage for a selected place", () => {
    expect(inquiryQuestionCoverage(sample(), place.id).entrance).toBe(1);
  });
  it("counts outstanding topics separately", () => {
    const value = updateInquiryQuestion(sample(), "parking", { progress: "reply-noted" }, second);
    expect(inquiryUnansweredByTopic(value, place.id)).toMatchObject({ entrance: 1, parking: 0, transit: 1 });
  });
  it("rejects topic counts for an absent place", () => {
    expect(() => inquiryQuestionCoverage(sample(), "not-here")).toThrow();
  });
  it("rejects invalid offsets", () => {
    for (const offset of [-1, 1.5, NaN, Infinity]) {
      expect(() => inquiryPage(sample(), { offset })).toThrow();
    }
  });
  it("rejects invalid page limits", () => {
    for (const limit of [-1, 0, 41, 1.2]) {
      expect(() => inquiryPage(sample(), { limit })).toThrow();
    }
  });
  it("rejects unsupported filter values", () => {
    expect(() => inquiryPage(sample(), { filter: "secret" as "all" })).toThrow();
  });
  it("rejects unsupported sort values", () => {
    expect(() => inquiryPage(sample(), { sort: "secret" as "listed" })).toThrow();
  });
  it("rejects unsupported topic values", () => {
    expect(() => inquiryPage(sample(), { topic: "secret" as InquiryTopic })).toThrow();
  });
});

describe("bounded import validation", () => {
  it("round trips a book with historical notes", () => {
    expect(decodeInquiryBook(encodeInquiryBook(withEvent()))).toEqual(withEvent());
  });
  it("preserves UNKNOWN through JSON round trip", () => {
    expect(decodeInquiryBook(encodeInquiryBook(book())).questions[0]?.condition).toBe("UNKNOWN");
  });
  it("rejects unrecognized format", () => {
    expect(() => validateInquiryBook({ ...book(), format: "other" })).toThrow();
  });
  it("rejects duplicate place IDs", () => {
    expect(() => validateInquiryBook({ ...book(), places: [place, place] })).toThrow();
  });
  it("rejects duplicate question IDs", () => {
    expect(() => validateInquiryBook({ ...book(), questions: [question, question] })).toThrow();
  });
  it("rejects duplicate event IDs", () => {
    expect(() => validateInquiryBook({ ...withEvent(), events: [event, event] })).toThrow();
  });
  it("rejects a question pointing to an absent place", () => {
    expect(() => validateInquiryBook({ ...book(), questions: [{ ...question, placeId: "elsewhere" }] })).toThrow();
  });
  it("rejects an event pointing to an absent question", () => {
    expect(() => validateInquiryBook({ ...withEvent(), events: [{ ...event, questionId: "elsewhere" }] })).toThrow();
  });
  it("rejects an invalid source date", () => {
    expect(() => validateInquiryBook({ ...withEvent(), events: [{ ...event, sourceDate: "2026-02-30" }] })).toThrow();
  });
  it("rejects impossible planned dates", () => {
    expect(() => validateInquiryBook({ ...book(), places: [{ ...place, plannedDate: "2026-02-30" }] })).toThrow();
  });
  it("rejects invalid event timestamps", () => {
    expect(() => validateInquiryBook({ ...withEvent(), events: [{ ...event, at: "tomorrow" }] })).toThrow();
  });
  it("rejects a timestamp earlier than question creation", () => {
    expect(() => validateInquiryBook({ ...withEvent(), events: [{ ...event, at: "2026-11-01T10:00:00.000Z" }] })).toThrow();
  });
  it("rejects invalid progress values", () => {
    expect(() => validateInquiryBook({ ...book(), questions: [{ ...question, progress: "finished" }] })).toThrow();
  });
  it("rejects invalid priority values", () => {
    expect(() => validateInquiryBook({ ...book(), questions: [{ ...question, importance: "certain" }] })).toThrow();
  });
  it("rejects unknown contact methods", () => {
    expect(() => validateInquiryBook({ ...withEvent(), events: [{ ...event, channel: "sms" }] })).toThrow();
  });
  it("rejects a blank venue label", () => {
    expect(() => validateInquiryBook({ ...book(), places: [{ ...place, label: " " }] })).toThrow();
  });
  it("rejects a blank question", () => {
    expect(() => validateInquiryBook({ ...book(), questions: [{ ...question, prompt: " " }] })).toThrow();
  });
  it("rejects a blank reply note", () => {
    expect(() => validateInquiryBook({ ...withEvent(), events: [{ ...event, note: " " }] })).toThrow();
  });
  it("rejects text containing NUL", () => {
    expect(() => validateInquiryBook({ ...book(), places: [{ ...place, label: "Hello\u0000name" }] })).toThrow();
  });
  it("rejects more than the allowed places", () => {
    const value = Array.from({ length: 33 }, (_, index) => ({ ...place, id: `venue-${index}` }));
    expect(() => validateInquiryBook({ ...book(), places: value })).toThrow();
  });
  it("rejects more than the allowed questions", () => {
    const value = Array.from({ length: 241 }, (_, index) => ({ ...question, id: `question-${index}` }));
    expect(() => validateInquiryBook({ ...book(), questions: value })).toThrow();
  });
  it("rejects more than the allowed events", () => {
    const value = Array.from({ length: 801 }, (_, index) => ({ ...event, id: `event-${index}` }));
    expect(() => validateInquiryBook({ ...withEvent(), events: value })).toThrow();
  });
  it("rejects files above the import byte limit", () => {
    expect(() => decodeInquiryBook("x".repeat(524289))).toThrow();
  });
  it("rejects syntactically invalid JSON", () => {
    expect(() => decodeInquiryBook("{" )).toThrow();
  });
  it("rejects out-of-order event history", () => {
    const later = { ...event, id: "later", at: third };
    expect(() => validateInquiryBook({ ...withEvent(), events: [later, event] })).toThrow();
  });
  it("rejects updates preceding creation", () => {
    expect(() => validateInquiryBook({ ...book(), questions: [{ ...question, updatedAt: "2026-11-19T10:00:00.000Z" }] })).toThrow();
  });
});
