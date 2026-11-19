import { describe, expect, it } from "vitest";
import { annotateAuditorsEnglish, isAuditorsEnglishPassage } from "./AuditorsTextLanguage";

const instruction = "Choose the Coordinator role to move a report to its next step.";
const policy = "A date is not permanent proof. An observation supports tier 1 for 180 days, tier 2 for 180 days (90 days for washroom fields) and tier 3 for 365 days. After 80% of that time the field is marked as ageing. After it, the observation no longer supports that tier: the field drops tier, the last value stays visible and is marked stale, and a re-check is needed. Only a new observation restores a tier. Nothing is promoted because time passes.";

for (const [label, sentence] of [
  ["coordinator instruction", instruction],
  ["duration-dependent policy", policy],
  ["whitespace-normalized instruction", `  ${instruction.replaceAll(" ", "  ")}  `],
] as const) {
  it(`marks the English-only ${label}`, () => {
    expect(isAuditorsEnglishPassage(sentence)).toBe(true);
  });
}

for (const sentence of [
  "",
  "Inconnu",
  "Choisissez le rôle de coordination pour traiter un signalement.",
  "A date is not permanent proof.",
  "A date is not permanent proof. An observation supports tier 1 for 20 days.",
  "Choose the Coordinator role to move a report to its next step. Extra instructions.",
  "The record source is Unknown.",
  "Source: CC-BY-4.0, 2026-11-19, tier E.",
]) {
  it(`does not annotate unrelated text: ${JSON.stringify(sentence)}`, () => {
    expect(isAuditorsEnglishPassage(sentence)).toBe(false);
  });
}

describe("annotation does not infer accessibility", () => {
  it("never recognizes a record as an English-only instruction", () => {
    expect(isAuditorsEnglishPassage("Door width: Unknown. Source: Unknown.")).toBe(false);
    expect(isAuditorsEnglishPassage("No records are available.")).toBe(false);
  });
});

function paragraph(textContent: string, lang: string | null = null) {
  const attributes = new Map<string, string>();
  if (lang !== null) attributes.set("lang", lang);
  const node = {
    textContent,
    dataset: {} as Record<string, string>,
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => { attributes.set(name, value); },
    removeAttribute: (name: string) => { attributes.delete(name); },
    getAttribute: (name: string) => attributes.get(name) ?? null,
  };
  return node;
}

function root(...paragraphs: ReturnType<typeof paragraph>[]): HTMLElement {
  return {
    querySelectorAll: (selector: string) => selector === "p" ? paragraphs : [],
  } as unknown as HTMLElement;
}

for (const lang of ["en", "fr"] as const) {
  it(`leaves French paragraphs alone with shell ${lang}`, () => {
    const french = paragraph("Choisissez le rôle de coordination pour traiter un signalement.");
    const unknown = paragraph("Inconnu");
    expect(annotateAuditorsEnglish(root(french, unknown), lang)).toBe(0);
    expect(french.getAttribute("lang")).toBeNull();
    expect(unknown.getAttribute("lang")).toBeNull();
  });
}

describe("DOM annotation ownership", () => {
  it("marks matching paragraphs only under French, without rewriting copy", () => {
    const first = paragraph(instruction);
    const second = paragraph(policy);
    const third = paragraph("Source: Unknown");
    const host = root(first, second, third);
    expect(annotateAuditorsEnglish(host, "fr")).toBe(2);
    expect(first.getAttribute("lang")).toBe("en");
    expect(second.getAttribute("lang")).toBe("en");
    expect(third.getAttribute("lang")).toBeNull();
    expect(first.textContent).toBe(instruction);
    expect(first.dataset.p20tEnglish).toBe("1");
  });

  it("never overwrites an upstream language marker", () => {
    const source = paragraph(instruction, "fr");
    expect(annotateAuditorsEnglish(root(source), "fr")).toBe(0);
    expect(source.getAttribute("lang")).toBe("fr");
  });

  it("removes only its own annotations when returning to English", () => {
    const owned = paragraph(instruction);
    const external = paragraph("English note", "en");
    const host = root(owned, external);
    annotateAuditorsEnglish(host, "fr");
    expect(annotateAuditorsEnglish(host, "en")).toBe(0);
    expect(owned.getAttribute("lang")).toBeNull();
    expect(owned.dataset.p20tEnglish).toBeUndefined();
    expect(external.getAttribute("lang")).toBe("en");
  });

  it("recovers when an English template is replaced with French text", () => {
    const source = paragraph(instruction);
    const host = root(source);
    annotateAuditorsEnglish(host, "fr");
    source.textContent = "Texte français";
    expect(annotateAuditorsEnglish(host, "fr")).toBe(0);
    expect(source.getAttribute("lang")).toBeNull();
  });

  it("annotates newly added instructions after a state update", () => {
    const paragraphs = [paragraph("Texte français")];
    const host = root(...paragraphs);
    expect(annotateAuditorsEnglish(host, "fr")).toBe(0);
    const next = paragraph(instruction);
    paragraphs.push(next);
    expect(annotateAuditorsEnglish(root(...paragraphs), "fr")).toBe(1);
    expect(next.getAttribute("lang")).toBe("en");
  });
});
