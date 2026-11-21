import { expect, test, type Page } from "@playwright/test";

import {
  auditEvidenceRoute,
  inspectEvidenceRecords,
  inspectLocalizedCopy,
  inspectOfflineClaims,
} from "./evidence-round8";

async function fixture(page: Page, content: string, lang = "en"): Promise<void> {
  await page.setContent(`<!doctype html><html lang="${lang}"><body>
    <main><h1>Evidence test</h1>${content}</main>
  </body></html>`);
}

const valid = `<section id="record" data-a11y-evidence-record
  data-source="Test fixture" data-licence="CC0-1.0"
  data-observed-date="2026-11-15" data-accessibility-state="UNKNOWN"
  data-a11y-unknown>Unknown</section>`;

test.describe("P16 round eight provenance and offline contracts", () => {
  test("complete UNKNOWN evidence passes without inference", async ({ page }) => {
    await fixture(page, valid);
    expect(await inspectEvidenceRecords(page)).toEqual([]);
  });

  test("missing source is a blocking finding", async ({ page }) => {
    await fixture(page, valid.replace('data-source="Test fixture"', ""));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-source");
  });

  test("empty source is a blocking finding", async ({ page }) => {
    await fixture(page, valid.replace('data-source="Test fixture"', 'data-source=" "'));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-source");
  });

  test("missing open licence is a blocking finding", async ({ page }) => {
    await fixture(page, valid.replace('data-licence="CC0-1.0"', ""));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-licence");
  });

  test("missing observation date fails", async ({ page }) => {
    await fixture(page, valid.replace('data-observed-date="2026-11-15"', ""));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-date");
  });

  test("malformed observation date fails", async ({ page }) => {
    await fixture(page, valid.replace("2026-11-15", "November 15"));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-date");
  });

  test("impossible calendar dates are rejected", async ({ page }) => {
    await fixture(page, valid.replace("2026-11-15", "2026-02-30"));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-date");
  });

  test("unsupported accessibility state fails", async ({ page }) => {
    await fixture(page, valid.replace('data-accessibility-state="UNKNOWN"',
      'data-accessibility-state="ASSUMED"'));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-state");
  });

  test("UNKNOWN evidence must not be promoted to reported", async ({ page }) => {
    await fixture(page, valid.replace('data-accessibility-state="UNKNOWN"',
      'data-accessibility-state="REPORTED"'));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-promoted-unknown");
  });

  test("UNKNOWN evidence must not be inferred", async ({ page }) => {
    await fixture(page, valid.replace("data-a11y-unknown", 'data-a11y-unknown data-inferred="true"'));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-inferred-unknown");
  });

  test("UNKNOWN label must not report a known status", async ({ page }) => {
    await fixture(page, valid.replace("data-a11y-unknown", 'data-a11y-unknown data-a11y-status-label="Accessible"'));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-unknown-label");
  });

  test("UNKNOWN label in French is accepted", async ({ page }) => {
    await fixture(page, valid.replace("data-a11y-unknown", 'data-a11y-unknown data-a11y-status-label="Inconnu"'));
    expect(await inspectEvidenceRecords(page)).toEqual([]);
  });

  test("assumed evidence quality is rejected", async ({ page }) => {
    await fixture(page, valid.replace("data-a11y-unknown", 'data-a11y-unknown data-a11y-quality="guessed"'));
    expect((await inspectEvidenceRecords(page)).map((item) => item.code))
      .toContain("evidence-assumed-quality");
  });

  test("unmarked content is not mistaken for an evidence record", async ({ page }) => {
    await fixture(page, `<p>Unknown</p><p>Observation date is unknown.</p>`);
    expect(await inspectEvidenceRecords(page)).toEqual([]);
  });

  test("English copy does not trigger the French typography audit", async ({ page }) => {
    await fixture(page, `<p data-a11y-localized-copy>Don't guess: what?</p>`);
    expect(await inspectLocalizedCopy(page)).toEqual([]);
  });

  test("French straight apostrophe fails", async ({ page }) => {
    await fixture(page, `<p data-a11y-localized-copy>l'App</p>`, "fr");
    expect((await inspectLocalizedCopy(page)).map((item) => item.code))
      .toContain("fr-curly-apostrophe");
  });

  test("French colon without NBSP fails", async ({ page }) => {
    await fixture(page, `<p data-a11y-localized-copy>État: inconnu</p>`, "fr");
    expect((await inspectLocalizedCopy(page)).map((item) => item.code))
      .toContain("fr-nbsp-colon");
  });

  test("French question mark without narrow space fails", async ({ page }) => {
    await fixture(page, `<p data-a11y-localized-copy>Pourquoi ?</p>`, "fr");
    expect((await inspectLocalizedCopy(page)).map((item) => item.code))
      .toContain("fr-nnbsp-punctuation");
  });

  test("French guillemets need narrow spaces", async ({ page }) => {
    await fixture(page, `<p data-a11y-localized-copy>«Bonjour»</p>`, "fr");
    expect((await inspectLocalizedCopy(page)).map((item) => item.code))
      .toContain("fr-guillemets-spacing");
  });

  test("correctly spaced French copy passes", async ({ page }) => {
    await fixture(page, `<p data-a11y-localized-copy>l’App : « Inconnu » !</p>`, "fr");
    expect(await inspectLocalizedCopy(page)).toEqual([]);
  });

  test("unmarked French text is not subjected to a metadata contract", async ({ page }) => {
    await fixture(page, `<p>Texte provisoire: inconnu?</p>`, "fr");
    expect(await inspectLocalizedCopy(page)).toEqual([]);
  });

  test("UNKNOWN offline metadata is a valid state", async ({ page }) => {
    await fixture(page, `<p data-a11y-offline-status="UNKNOWN">Unknown</p>`);
    expect(await inspectOfflineClaims(page)).toEqual([]);
  });

  test("an unsupported offline state is rejected", async ({ page }) => {
    await fixture(page, `<p data-a11y-offline-status="probably">Available</p>`);
    expect((await inspectOfflineClaims(page)).map((item) => item.code))
      .toContain("offline-status-invalid");
  });

  test("offline available claim needs a source", async ({ page }) => {
    await fixture(page, `<p data-a11y-offline-status="available">Available</p>`);
    expect((await inspectOfflineClaims(page)).map((item) => item.code))
      .toContain("offline-source-missing");
  });

  test("sourced offline available claim passes", async ({ page }) => {
    await fixture(page, `<p data-a11y-offline-status="available" data-source="Local cache">Available</p>`);
    expect(await inspectOfflineClaims(page)).toEqual([]);
  });

  test("UNKNOWN offline claim cannot be guessed", async ({ page }) => {
    await fixture(page, `<p data-a11y-offline-status="UNKNOWN" data-offline-guessed="true">Unknown</p>`);
    expect((await inspectOfflineClaims(page)).map((item) => item.code))
      .toContain("offline-unknown-assumed");
  });

  test("combined evidence audit preserves all categories", async ({ page }) => {
    await fixture(page, `<p data-a11y-evidence-record data-accessibility-state="ASSUMED"></p>
      <p data-a11y-offline-status="maybe"></p>`);
    const codes = (await auditEvidenceRoute(page)).map((item) => item.code);
    expect(codes).toContain("evidence-source");
    expect(codes).toContain("evidence-licence");
    expect(codes).toContain("evidence-date");
    expect(codes).toContain("evidence-state");
    expect(codes).toContain("offline-status-invalid");
  });
});
