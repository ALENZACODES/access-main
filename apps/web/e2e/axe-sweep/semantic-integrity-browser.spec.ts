import { expect, test } from "@playwright/test";
import { collectSemanticSnapshot } from "./semantic-integrity-browser";
import { snapshotIssues } from "./semantic-integrity";

/** Browser fixtures exercise the real DOM implementation, not mock measurements. */
test.describe("semantic browser capture", () => {
  test("finds broken ARIA destinations and duplicate IDs", async ({ page }) => {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Example</title></head>
      <body><a href="#main">Skip to main</a><main id="main"><h1>Example</h1>
      <label for="search">Search</label><input id="search" aria-describedby="missing">
      <div id="duplicate">First</div><div id="duplicate" hidden>Second</div></main></body></html>`);
    const snapshot = await collectSemanticSnapshot(page, "/");
    expect(snapshot.ids.filter((element) => element.id === "duplicate")).toHaveLength(2);
    expect(snapshotIssues(snapshot, "en", 320).map((entry) => entry.rule)).toEqual(
      expect.arrayContaining(["duplicate-id", "aria-missing-reference"]),
    );
  });

  test("keeps native labels and valid hash links intact", async ({ page }) => {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Example</title></head>
      <body><a href="#main">Skip</a><main id="main"><h1>Example</h1>
      <label for="query">Query</label><input id="query" aria-describedby="hint">
      <p id="hint">Enter a word</p><button type="button">Search</button></main></body></html>`);
    const snapshot = await collectSemanticSnapshot(page, "/");
    expect(snapshot.hashes).toContainEqual({ href: "#main", visible: true, targetCount: 1 });
    expect(snapshot.focusables.some((node) => node.name === "Query")).toBe(true);
    expect(snapshotIssues(snapshot, "en", 320)).toEqual([]);
  });

  test("preserves the French document language", async ({ page }) => {
    await page.setContent(`<!doctype html><html lang="fr"><head><title>Exemple</title></head>
      <body><main><h1>Exemple</h1><button type="button">Continuer</button>
      <span lang="en">English</span></main></body></html>`);
    const snapshot = await collectSemanticSnapshot(page, "/");
    expect(snapshot.documentLanguage).toBe("fr");
    expect(snapshot.fragments).toContainEqual({
      language: "en", parentLanguage: "fr", text: "English", visible: true,
    });
    expect(snapshotIssues(snapshot, "fr", 320)).toEqual([]);
    expect(snapshotIssues(snapshot, "en", 320).map((entry) => entry.rule)).toContain("document-language");
  });

  test("a missing skip-link target cannot masquerade as an accessible skip link", async ({ page }) => {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Example</title></head>
      <body><a href="#absent">Skip</a><main><h1>Example</h1></main></body></html>`);
    const snapshot = await collectSemanticSnapshot(page, "/");
    expect(snapshotIssues(snapshot, "en", 320).map((entry) => entry.rule)).toContain("hash-destination");
  });

  test("rendered controls with invisible text are reported", async ({ page }) => {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Example</title></head>
      <body><main><h1>Example</h1><input type="text" id="unnamed">
      <button aria-label="Named button" type="button">★</button></main></body></html>`);
    const snapshot = await collectSemanticSnapshot(page, "/");
    expect(snapshot.focusables.some((node) => node.selector === "unnamed" && !node.name)).toBe(true);
    expect(snapshotIssues(snapshot, "en", 320).map((entry) => entry.rule)).toContain("focus-unnamed");
  });
});
