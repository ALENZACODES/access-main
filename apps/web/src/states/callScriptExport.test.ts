import { describe, expect, it } from "vitest";
import { DEFAULT_SCRIPT_OPTIONS, buildCallScript } from "./callScript";
import { scriptHtmlFile, scriptTextFile, scriptToHtml, scriptToText } from "./callScriptExport";
import { bare, place } from "./placeFixtures";

const TODAY = "2026-11-21";
const full = buildCallScript(place("e1", { name: "Café Étoile", address: "2650 Quesnel Road" }), "en", TODAY);

describe("scriptToText", () => {
  const text = scriptToText(full, "en");
  it("starts with the title and ends with the footer", () => {
    expect(text.startsWith("Call script: Café Étoile\n")).toBe(true);
    expect(text.trimEnd().endsWith("Not checked with the place.")).toBe(true);
  });
  it("has each section heading in capitals", () => {
    for (const h of ["OPENING", "THE PLACE", "THE ADDRESS", "QUESTIONS", "CLOSING"]) expect(text).toContain(`\n${h}\n`);
  });
  it("numbers the questions from one", () => {
    expect(text).toMatch(/\n1\. /);
    const count = full.sections.find((s) => s.id === "questions")!.lines.length;
    expect(text).toContain(`\n${count}. `);
    expect(text).not.toContain(`\n${count + 1}. `);
  });
  it("gives each question a reason and ruled lines", () => {
    expect(text).toContain("Why ask:");
    expect(text).toContain("Answer: ________________________________________");
  });
  it("has the closing fields", () => {
    for (const f of ["Spoke to:", "Date of the call:", "Time:", "Call back on:"]) expect(text).toContain(f);
  });
  it("uses only newline line breaks", () => {
    expect(text).not.toContain("\r");
  });
  it("has no more than one blank line in a row", () => {
    expect(text).not.toMatch(/\n\n\n/);
  });
  it("drops control characters from the pack's text", () => {
    const s = buildCallScript(place("e2", { name: "A\u0007B" }), "en", TODAY);
    expect(scriptToText(s, "en")).not.toContain("\u0007");
  });
  it("says there are no questions by leaving the section empty when they are off", () => {
    const s = buildCallScript(place("e3"), "en", TODAY, { ...DEFAULT_SCRIPT_OPTIONS, includeQuestions: false });
    expect(scriptToText(s, "en")).not.toContain("QUESTIONS");
  });
  it("works in French", () => {
    const fr = scriptToText(buildCallScript(place("e4", { name: "Café" }), "fr", TODAY), "fr");
    expect(fr).toContain("OUVERTURE");
    expect(fr).toContain("Pourquoi demander\u00a0:");
  });
  it("handles a place the pack knows nothing about", () => {
    expect(scriptToText(buildCallScript(bare("e5"), "en", TODAY), "en")).toContain("no name");
  });
});

describe("scriptToHtml", () => {
  const html = scriptToHtml(full, "en");
  it("is a complete page in the right language", () => {
    expect(html.startsWith("<!DOCTYPE html>\n<html lang=\"en\">")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(scriptToHtml(buildCallScript(place("e6"), "fr", TODAY), "fr")).toContain('<html lang="fr">');
  });
  it("has no script, link, image or external reference", () => {
    expect(html).not.toMatch(/<script|<link|<img|<iframe|src=|href=|http:\/\/|https:\/\//i);
  });
  it("has one heading one and one heading two per section", () => {
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html.match(/<h2>/g)).toHaveLength(5);
  });
  it("lists the questions in an ordered list", () => {
    const count = full.sections.find((s) => s.id === "questions")!.lines.length;
    expect(html.match(/<li>/g)).toHaveLength(count);
    expect(html).toContain("<ol>");
  });
  it("escapes markup in the pack's text", () => {
    const s = buildCallScript(place("e7", { name: "<b>Bold & \"Co\"</b>" }), "en", TODAY);
    const h = scriptToHtml(s, "en");
    expect(h).not.toContain("<b>Bold");
    expect(h).toContain("&lt;b&gt;Bold &amp;");
  });
  it("has print rules so a question does not split over pages", () => {
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("@page");
  });
  it("leaves ruled lines to write on", () => {
    expect(html).toContain('<div class="rule"></div>');
  });
  it("says there are no questions when the section is empty", () => {
    const s = { ...full, sections: full.sections.map((x) => (x.id === "questions" ? { ...x, lines: [] } : x)) };
    expect(scriptToHtml(s, "en")).toContain("No questions were included.");
  });
});

describe("saved files", () => {
  it("names the text file by language", () => {
    expect(scriptTextFile(full, "en").name).toBe("call-script.txt");
    expect(scriptTextFile(full, "fr").name).toBe("script-appel.txt");
    expect(scriptTextFile(full, "en").mime).toContain("text/plain");
  });
  it("names the page by language", () => {
    expect(scriptHtmlFile(full, "en").name).toBe("call-script.html");
    expect(scriptHtmlFile(full, "fr").name).toBe("script-appel.html");
    expect(scriptHtmlFile(full, "en").mime).toContain("text/html");
  });
  it("carries the same content as the converters", () => {
    expect(scriptTextFile(full, "en").content).toBe(scriptToText(full, "en"));
    expect(scriptHtmlFile(full, "en").content).toBe(scriptToHtml(full, "en"));
  });
});
