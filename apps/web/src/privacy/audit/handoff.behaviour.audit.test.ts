// CI audit: the register says what each link passes on. Here the App's own functions build the links, and the
// link reader says what each one really carries, so a change that adds an address, a name or more precision to a
// link fails here and not only in the register.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HANDOFF_REGISTER, rowsFor } from "../panel/handoffRegister";
import { describeLink, type LinkDescription } from "../panel/handoffLink";
import { previewLink } from "../panel/handoffPreview";
import { MAX_MAILTO_LENGTH, askableQuestions, draftMessage, mailtoHref, type DraftMessage } from "../../states/visitMessage";
import { geoUri } from "../../states/geo";
import type { PlaceQuestions, VisitQuestion } from "../../states/visitQuestions";

const q = (topic: VisitQuestion["topic"], text: string): VisitQuestion => ({ key: `p1:${topic}`, topic, text, basis: "The pack lists no steps." });
const place = (questions: VisitQuestion[], name: string | null = "Maple Library"): PlaceQuestions => ({ id: "p1", name, questions });

const mailOf = (href: string | null): Extract<LinkDescription, { kind: "mailto" }> => {
  expect(href).not.toBeNull();
  const r = describeLink(href ?? "");
  if (!r.ok || r.link.kind !== "mailto") throw new Error(`not a mail link: ${JSON.stringify(r)}`);
  return r.link;
};

describe("the email link says what the register says", () => {
  const row = rowsFor(HANDOFF_REGISTER, "mailto")[0]!;
  const draft = draftMessage(place([q("entrance", "Is the entrance step-free?"), q("inside", "Is there a lift?"), q("contact", "What is your phone number?")]), "en")!;
  const link = mailOf(mailtoHref(draft));

  it("has no address to send to, as the row says", () => {
    expect(row.carries.en).toContain("no address");
    expect(link.to).toEqual([]);
    expect(link.cc).toEqual([]);
    expect(link.bcc).toEqual([]);
  });
  it("has only a subject and a body, and no other field", () => {
    expect(link.otherFields).toEqual([]);
    expect(link.subject).toBe(draft.subject);
    expect(link.bodyChars).toBe([...draft.body.replace(/\n/g, "\r\n")].length);
  });
  it("carries the questions the person chose and leaves out the contact question", () => {
    expect(draft.body).toContain("Is the entrance step-free?");
    expect(draft.body).toContain("Is there a lift?");
    expect(draft.body).not.toContain("phone number");
  });
  it("sends the lines as carriage return and line feed", () => {
    expect(mailtoHref(draft)).toContain("%0D%0A");
    expect(mailtoHref(draft)).not.toMatch(/(?<!%0D)%0A/);
  });
  it("gives the same text back when the link is decoded", () => {
    const href = mailtoHref(draft)!;
    const body = new URLSearchParams(href.slice(href.indexOf("?") + 1).replace(/\+/g, "%2B")).get("body");
    expect(body).toBe(draft.body.replace(/\n/g, "\r\n"));
  });
  it("is the same in French and passes the same reading", () => {
    const fr = draftMessage(place([q("entrance", "L’entrée est-elle sans marche?")]), "fr")!;
    const l = mailOf(mailtoHref(fr));
    expect(l.to).toEqual([]);
    expect(l.subject).toBe(fr.subject);
  });
  it("names the place and nothing about the sender", () => {
    expect(draft.body).toContain("Maple Library");
    expect(draft.body).not.toMatch(/@|\b\d{3}[-. ]\d{4}\b/);
  });
  it("is not offered when it would be too long, and is offered at exactly the limit", () => {
    const long: DraftMessage = { subject: "s", body: "x".repeat(MAX_MAILTO_LENGTH) };
    expect(mailtoHref(long)).toBeNull();
    const edge = "mailto:?subject=s&body=".length;
    const fit: DraftMessage = { subject: "s", body: "x".repeat(MAX_MAILTO_LENGTH - edge) };
    expect(mailtoHref(fit)?.length).toBe(MAX_MAILTO_LENGTH);
    expect(mailtoHref({ ...fit, body: `${fit.body}x` })).toBeNull();
  });
  it("is offered at no length that the link reader would refuse", () => {
    expect(MAX_MAILTO_LENGTH).toBeLessThanOrEqual(2000);
    const fit: DraftMessage = { subject: "s", body: "x".repeat(MAX_MAILTO_LENGTH - "mailto:?subject=s&body=".length) };
    expect(describeLink(mailtoHref(fit) ?? "").ok).toBe(true);
  });
  it("gives no draft when every question is already answered or is the contact question", () => {
    expect(draftMessage(place([q("contact", "Phone?")]), "en")).toBeNull();
    expect(draftMessage(place([q("entrance", "A?")]), "en", new Set(["p1:entrance"]))).toBeNull();
    expect(askableQuestions(place([q("entrance", "A?"), q("contact", "B?")]), new Set())).toHaveLength(1);
  });
  it("encodes a text that would break a link: an ampersand, a question mark, a hash and a percent sign", () => {
    const d: DraftMessage = { subject: "A&B?#%", body: "C&D=E" };
    const l = mailOf(mailtoHref(d));
    expect(l.subject).toBe("A&B?#%");
    expect(l.otherFields).toEqual([]);
  });
});

describe("the map link says what the register says", () => {
  const row = rowsFor(HANDOFF_REGISTER, "geo")[0]!;
  const read = (lat: number, lon: number): Extract<LinkDescription, { kind: "geo" }> => {
    const r = describeLink(geoUri({ lat, lon }));
    if (!r.ok || r.link.kind !== "geo") throw new Error("not a map link");
    return r.link;
  };
  it("passes a latitude and a longitude and nothing else", () => {
    expect(row.carries.en).toContain("latitude and longitude");
    expect(read(43.6532, -79.3832)).toEqual({ kind: "geo", lat: 43.6532, lon: -79.3832, decimals: 5, altitude: null, uncertainty: null });
  });
  it("is written to five decimal places however many the place has", () => {
    expect(read(43.123456789, -79.987654321).decimals).toBe(5);
    expect(read(43, -79).decimals).toBe(5);
    expect(geoUri({ lat: 43, lon: -79 })).toBe("geo:43.00000,-79.00000");
  });
  it("rounds and does not cut", () => {
    expect(read(43.123456, -79.999999)).toMatchObject({ lat: 43.12346, lon: -80 });
  });
  it("is within a metre or two of the place", () => {
    const l = read(43.653226, -79.383184);
    expect(Math.abs(l.lat - 43.653226)).toBeLessThanOrEqual(0.000005);
    expect(Math.abs(l.lon + 79.383184)).toBeLessThanOrEqual(0.000005);
  });
  it("keeps the edges of the range readable", () => {
    expect(read(90, 180)).toMatchObject({ lat: 90, lon: 180 });
    expect(read(-90, -180)).toMatchObject({ lat: -90, lon: -180 });
  });
});

describe("the phone link", () => {
  it("is built in a component, so the register's claim is checked against the same rule the component uses", () => {
    const row = rowsFor(HANDOFF_REGISTER, "tel")[0]!;
    expect(row.carries.en).toContain("digits");
    const build = (contact: string): string => `tel:${contact.replace(/[^0-9]/g, "")}`;
    for (const contact of ["1-800-555-0100", "(416) 555-0100", "211", "+1 416 555 0100", "416.555.0100 ext. 2"]) {
      const r = describeLink(build(contact));
      expect(r.ok, contact).toBe(true);
      if (r.ok && r.link.kind === "tel") expect(r.link.digits).toBe(contact.replace(/\D/g, ""));
    }
  });
  it("is built in the component with the rule the check above uses, read from the source", () => {
    const text = readFileSync(fileURLToPath(new URL("../../pages/OfflinePackPage.tsx", import.meta.url)), "utf8");
    expect(text).toContain("href={`tel:${item.contact.replace(/[^0-9]/g, \"\")}`}");
  });
  it("stays readable for a contact with too few digits only as a refusal, never as a wrong number", () => {
    expect(describeLink("tel:12").ok).toBe(false);
    expect(describeLink("tel:").ok).toBe(false);
  });
});

describe("the sentence a person would see for each real link", () => {
  const draft = draftMessage(place([q("entrance", "Is the entrance step-free?")]), "en")!;
  const read = (href: string | null) => {
    const r = describeLink(href ?? "");
    if (!r.ok) throw new Error(r.problem);
    return r.link;
  };
  it("says the email has no address to send it to", () => {
    expect(previewLink("en", read(mailtoHref(draft)))).toMatch(/^An email draft with no address to send it to, a subject, \d+ characters of text on \d+ lines\.$/);
    expect(previewLink("fr", read(mailtoHref(draft)))).toContain("sans adresse de destinataire");
  });
  it("does not repeat the place name or a question from the draft", () => {
    for (const l of ["en", "fr"] as const) {
      const t = previewLink(l, read(mailtoHref(draft)));
      expect(t).not.toContain("Maple");
      expect(t).not.toContain("step-free");
    }
  });
  it("says the map link is written to five decimal places, to about a metre", () => {
    expect(previewLink("en", read(geoUri({ lat: 43.6532, lon: -79.3832 })))).toBe("A place on a map, written to 5 decimal places, to within about 1.1\u00a0metres.");
  });
  it("matches what the register row says it carries", () => {
    expect(rowsFor(HANDOFF_REGISTER, "geo")[0]?.carries.en).toContain("five decimal places");
    expect(rowsFor(HANDOFF_REGISTER, "mailto")[0]?.carries.en).toContain("no address");
  });
});
