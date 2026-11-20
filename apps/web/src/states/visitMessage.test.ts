import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { MAX_MAILTO_LENGTH, askableQuestions, draftMessage, draftToText, mailtoHref } from "./visitMessage";
import { type PlaceQuestions, buildVisitPlan } from "./visitQuestions";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const mk = (over: Record<string, unknown> = {}): PackPlaceRecord => parsePackPlaces([{ id: "p1", name: "Alpha Hall", wheelchair: "limited", address: "1 Main Street", lat: 43.6, lon: -79.3, provenance: OSM, ...over }]).places[0]!;
const entry = (over: Record<string, unknown> = {}, locale: "en" | "fr" = "en"): PlaceQuestions => buildVisitPlan([mk(over)], 0, locale, TODAY).places[0]!;

describe("askableQuestions", () => {
  it("leaves out the contact question", () => {
    const qs = askableQuestions(entry(), new Set());
    expect(qs.map((q) => q.topic)).toEqual(["limited-meaning", "other-entrance"]);
  });
  it("leaves out questions already ticked", () => {
    const p = entry();
    expect(askableQuestions(p, new Set([p.questions[0]!.key])).map((q) => q.topic)).toEqual(["other-entrance"]);
  });
  it("is empty when the only questions are ticked or the contact one", () => {
    const p = entry({ wheelchair: "no" });
    expect(askableQuestions(p, new Set([p.questions[0]!.key]))).toEqual([]);
  });
});

describe("draftMessage", () => {
  it("has a subject and a body that begins with a greeting", () => {
    const m = draftMessage(entry(), "en")!;
    expect(m.subject).toBe("Questions before a visit");
    expect(m.body.startsWith("Hello,\n\n")).toBe(true);
  });
  it("names the place in the opening sentence", () => {
    expect(draftMessage(entry(), "en")!.body).toContain("I am planning to visit Alpha Hall and have a few questions");
  });
  it("says 'your place' when the pack gives no name", () => {
    expect(draftMessage(entry({ name: "" }), "en")!.body).toContain("visit your place");
    expect(draftMessage(entry({ name: "" }, "fr"), "fr")!.body).toContain("à votre lieu");
  });
  it("explains what 'the pack' means and that details may be missing or out of date", () => {
    const body = draftMessage(entry(), "en")!.body;
    expect(body).toContain('"the pack" means that copy');
    expect(body).toContain("missing or may be out of date");
  });
  it("numbers the questions from 1 and uses their exact text", () => {
    const p = entry();
    const body = draftMessage(p, "en")!.body;
    expect(body).toContain(`1. ${p.questions[0]!.text}`);
    expect(body).toContain(`2. ${p.questions[1]!.text}`);
    expect(body).not.toContain("3. ");
  });
  it("leaves out the contact question and any that are ticked", () => {
    const p = entry();
    const body = draftMessage(p, "en", new Set([p.questions[0]!.key]))!.body;
    expect(body).not.toContain("How can I reach someone there");
    expect(body).not.toContain(p.questions[0]!.text);
    expect(body).toContain("1. Is there another way in");
  });
  it("is null when nothing is left to ask", () => {
    const p = entry({ wheelchair: "no" });
    expect(draftMessage(p, "en", new Set([p.questions[0]!.key]))).toBeNull();
  });
  it("ends with thanks and then the exact OpenStreetMap credit", () => {
    const lines = draftMessage(entry(), "en")!.body.trimEnd().split("\n");
    expect(lines[lines.length - 1]).toBe("© OpenStreetMap contributors");
    expect(lines[lines.length - 3]).toBe("Thank you for your time.");
  });
  it("says nothing about the sender: no name, address, phone or email", () => {
    const body = draftMessage(entry(), "en")!.body;
    expect(body).not.toMatch(/@|\d{3}[- ]\d{3}[- ]\d{4}|\bmy name\b|\bI live\b/i);
  });
  it("is clean copy in both languages apart from the place name", () => {
    for (const locale of ["en", "fr"] as const) {
      const m = draftMessage(entry({}, locale), locale)!;
      for (const line of [m.subject, ...m.body.split("\n")]) {
        if (line.includes("Alpha Hall")) continue;
        expect(lintCopy(line, locale), line).toEqual([]);
      }
    }
  });
  it("sets French quotes and punctuation with the right spaces", () => {
    const body = draftMessage(entry({}, "fr"), "fr")!.body;
    expect(body).toContain("« le pack »");
    expect(body).not.toMatch(/ [:;!?]/);
    expect(body).not.toContain("'");
  });
  it("is the same each time", () => {
    expect(draftMessage(entry(), "en")).toEqual(draftMessage(entry(), "en"));
  });
});

describe("mailtoHref", () => {
  it("starts with mailto: and an empty address", () => {
    expect(mailtoHref(draftMessage(entry(), "en")!)!.startsWith("mailto:?subject=")).toBe(true);
  });
  it("encodes the subject and the body so they read back the same", () => {
    const m = draftMessage(entry(), "en")!;
    const href = mailtoHref(m)!;
    const params = new URLSearchParams(href.slice("mailto:?".length));
    expect(params.get("subject")).toBe(m.subject);
    expect(params.get("body")).toBe(m.body.replace(/\n/g, "\r\n"));
  });
  it("encodes characters that would end a link parameter", () => {
    const m = { subject: "a&b=c", body: "x?y#z\n" };
    const href = mailtoHref(m)!;
    expect(href).not.toMatch(/[#]/);
    expect(href.split("&")).toHaveLength(2);
  });
  it("is null when the link would be too long", () => {
    expect(mailtoHref({ subject: "s", body: "x".repeat(MAX_MAILTO_LENGTH) })).toBeNull();
  });
  it("is allowed right up to the limit", () => {
    const base = "mailto:?subject=s&body=".length;
    expect(mailtoHref({ subject: "s", body: "x".repeat(MAX_MAILTO_LENGTH - base) })).not.toBeNull();
    expect(mailtoHref({ subject: "s", body: "x".repeat(MAX_MAILTO_LENGTH - base + 1) })).toBeNull();
  });
  it("never makes a link with another scheme, whatever the place is called", () => {
    const m = draftMessage(entry({ name: "javascript:alert(1)" }), "en")!;
    expect(mailtoHref(m)!.startsWith("mailto:")).toBe(true);
  });
});

describe("draftToText", () => {
  it("puts the subject first in English and in French", () => {
    const m = draftMessage(entry(), "en")!;
    expect(draftToText(m, "en").startsWith("Subject: Questions before a visit\n\nHello,")).toBe(true);
    const f = draftMessage(entry({}, "fr"), "fr")!;
    expect(draftToText(f, "fr").startsWith("Objet : Questions avant une visite\n\nBonjour,")).toBe(true);
  });
});
