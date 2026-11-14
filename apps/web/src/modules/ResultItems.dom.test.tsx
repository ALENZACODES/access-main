/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";
import type { DirectoryRecord, Provenance } from "@access/shared";
import records from "../../../../packages/shared/src/fixtures/access-tools-directory.json" with { type: "json" };
import { initI18n } from "../i18n/index.ts";
import { ResultItems, toItemView } from "./ResultItems.tsx";

const PROVENANCE: Provenance = {
  source_name: "Synthetic test source",
  source_url: null,
  licence: "UNKNOWN",
  licence_url: null,
  source_date: "2026-11-01",
  retrieved_at: "2026-11-13T12:00:00.000Z",
  tier: 0,
  prototype_label: "SEEDED-OPEN-DATA",
  freshness: "unknown",
};

const i18n = initI18n();

async function view(lang: "en" | "fr", node: React.ReactElement) {
  await i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

async function noViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(cleanup);

describe("ResultItems", () => {
  it("shows source, licence, date, and tier, and says Unknown for an UNKNOWN licence", async () => {
    const screen = await view("en", <ResultItems id="places" items={[{ id: "p1", name: "Synthetic place", provenance: PROVENANCE }]} />);
    expect(screen.getByText("Synthetic place")).toBeTruthy();
    expect(screen.getByText("Synthetic test source")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.getByText("2026-11-01")).toBeTruthy();
    expect(screen.getByText("Tier 0")).toBeTruthy();
    await noViolations(screen.container);
  });

  it("uses French labels and marks an English article with lang", async () => {
    const screen = await view("fr", <ResultItems id="help" items={[{ id: "h1", title: "Offline packs", locale: "en", provenance: PROVENANCE }]} />);
    expect(screen.getByText("Niveau 0")).toBeTruthy();
    expect(screen.getByText("Inconnu")).toBeTruthy();
    expect(screen.getByText("Offline packs").getAttribute("lang")).toBe("en");
    expect(screen.getByText("Cet élément est en anglais.")).toBeTruthy();
    await noViolations(screen.container);
  });

  it("reads a directory record in the screen language with tier E", async () => {
    const record = (records as DirectoryRecord[])[0]!;
    const screen = await view("fr", <ResultItems id="navigator" items={[record]} />);
    expect(screen.getByText(record.name.fr)).toBeTruthy();
    expect(screen.getByText(record.retrievedOn)).toBeTruthy();
    expect(screen.getByText("Niveau E")).toBeTruthy();
    await noViolations(screen.container);
  });

  it("lists a game title with no source line, because a game is not a data record", () => {
    const game = { id: "g1", title: "Grid Recall", clinicalClaim: false, seizureRiskFlash: false, keyboardOperable: true };
    expect(toItemView("games", game, "en", 0)).toMatchObject({ label: "Grid Recall", tier: null, source: null });
  });

  it("renders nothing for an empty list", async () => {
    const screen = await view("en", <ResultItems id="places" items={[]} />);
    expect(screen.container.innerHTML).toBe("");
  });
});
