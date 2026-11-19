import { expect, test, type Page } from "@playwright/test";
import { collectSemanticSnapshot } from "./semantic-integrity-browser";
import { languageIssues, type LangFragment } from "./semantic-integrity";

/** These browser fixtures are intentionally local; they never fetch or infer a place record. */
async function fixture(page: Page, content: string, language: "en" | "fr" = "fr"): Promise<void> {
  await page.setContent(`<!doctype html><html lang="${language}"><head><title>Exemple</title></head>
    <body><main id="main"><h1>Exemple</h1>${content}</main></body></html>`);
}

async function problems(page: Page, route = "/places") {
  const snapshot = await collectSemanticSnapshot(page, route);
  return languageIssues(snapshot.documentLanguage, "fr", snapshot.fragments, route);
}

function inherited(text: string, tag = "p", visible = true): LangFragment {
  return { text, tag, visible, language: "fr", parentLanguage: "fr", explicit: false };
}

test.describe("P20M inherited language regression fixtures", () => {
  test("French document with ordinary French paragraphs has no language findings", async ({ page }) => {
    await fixture(page, `<p>Choisissez un lieu.</p><p>Les renseignements sont sur cet appareil.</p>`);
    expect(await problems(page)).toEqual([]);
  });

  test("English instructions without lang are reported under French", async ({ page }) => {
    await fixture(page, `<p>Please choose a place.</p>`);
    expect((await problems(page)).map((item) => item.rule)).toContain("unmarked-english");
  });

  test("English search-status wording without lang is reported", async ({ page }) => {
    await fixture(page, `<p role="status">No results found</p>`);
    expect((await problems(page)).map((item) => item.rule)).toContain("unmarked-english");
  });

  test("English button instructions without lang are reported", async ({ page }) => {
    await fixture(page, `<button type="button">Save changes</button>`);
    expect((await problems(page)).map((item) => item.rule)).toContain("unmarked-english");
  });

  test("English link wording without lang is reported", async ({ page }) => {
    await fixture(page, `<a href="#main">Back to More</a>`);
    expect((await problems(page)).map((item) => item.rule)).toContain("unmarked-english");
  });

  test("explicitly marked English paragraph is preserved", async ({ page }) => {
    await fixture(page, `<p lang="en">Please choose a place.</p>`);
    expect(await problems(page)).toEqual([]);
  });

  test("explicitly marked English child does not contaminate the French parent", async ({ page }) => {
    await fixture(page, `<p>Texte français <span lang="en">No results found</span></p>`);
    expect(await problems(page)).toEqual([]);
  });

  test("unmarked English child of a French paragraph is captured", async ({ page }) => {
    await fixture(page, `<p>Texte français <span>No results found</span></p>`);
    expect((await problems(page)).map((item) => item.rule)).toContain("unmarked-english");
  });

  test("hidden English blocks do not create a false visible finding", async ({ page }) => {
    await fixture(page, `<p hidden>Please choose a place.</p><p aria-hidden="true">No results found</p>
      <p style="display:none">Save changes</p>`);
    expect(await problems(page)).toEqual([]);
  });

  test("language choices and names alone are not treated as English prose", async ({ page }) => {
    await fixture(page, `<label>Langue <select><option value="en">English</option>
      <option value="fr">Français</option></select></label><p>King Street West</p>`);
    expect(await problems(page)).toEqual([]);
  });

  test("an English heading on the housing route is reported", async ({ page }) => {
    await fixture(page, `<h1>Housing finder</h1>`);
    const result = await problems(page, "/more/housing");
    expect(result.map((item) => item.rule)).toContain("unmarked-english");
  });

  test("an English heading on the diary route is reported", async ({ page }) => {
    await fixture(page, `<h1>Coverage diary</h1>`);
    const result = await problems(page, "/more/diary");
    expect(result.map((item) => item.rule)).toContain("unmarked-english");
  });

  test("an English heading on the auditor route is reported", async ({ page }) => {
    await fixture(page, `<h1>Auditor capture</h1>`);
    const result = await problems(page, "/more/auditors");
    expect(result.map((item) => item.rule)).toContain("unmarked-english");
  });

  test("language changes can clear a finding after the DOM is re-rendered", async ({ page }) => {
    await fixture(page, `<div id="copy"><p>Please choose a place.</p></div>`);
    expect((await problems(page)).map((item) => item.rule)).toContain("unmarked-english");
    await page.locator("#copy").evaluate((element) => {
      element.textContent = "Choisissez un lieu.";
    });
    expect(await problems(page)).toEqual([]);
  });

  test("removing a language marker exposes the inherited-language issue", async ({ page }) => {
    await fixture(page, `<p id="copy" lang="en">No results found</p>`);
    expect(await problems(page)).toEqual([]);
    await page.locator("#copy").evaluate((element) => element.removeAttribute("lang"));
    expect((await problems(page)).map((item) => item.rule)).toContain("unmarked-english");
  });

  test("adding a correct language marker removes an inherited-language finding", async ({ page }) => {
    await fixture(page, `<p id="copy">No results found</p>`);
    expect((await problems(page)).map((item) => item.rule)).toContain("unmarked-english");
    await page.locator("#copy").evaluate((element) => element.setAttribute("lang", "en"));
    expect(await problems(page)).toEqual([]);
  });

  test("unknown language remains unknown rather than becoming English", () => {
    const samples = [inherited("Ottawa"), inherited("42"), inherited("Nom inconnu")];
    expect(languageIssues("fr", "fr", samples, "/places")).toEqual([]);
  });

  test("a fragment with invalid language syntax is rejected independently", () => {
    const samples: LangFragment[] = [{ ...inherited("Please choose a place"), language: "invalid tag" }];
    expect(languageIssues("fr", "fr", samples, "/places").map((item) => item.rule))
      .toEqual(["fragment-language-invalid"]);
  });
});
