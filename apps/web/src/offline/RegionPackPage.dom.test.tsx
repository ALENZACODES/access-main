/** @vitest-environment jsdom */
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PackManifest, PackSource, RegionIntegrityPart, RegionStatus } from "../../../../packages/data-client/src/index.ts";
import { initI18n } from "../i18n/index.ts";
import { packIntegrityCopy } from "../recovery/packIntegrity.ts";
import { offlineCatalog } from "./catalog.ts";
import { OfflineRegionPage } from "./RegionPackPage.tsx";

const i18n = initI18n();
const sourceMeta = { name: "OpenStreetMap", licence: "ODbL-1.0" as const, date: "2026-11-01" };
const goodBytes = new TextEncoder().encode("abc");
const goodSha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const manifest: PackManifest = {
  version: 1,
  builtAt: "2026-11-01T00:00:00Z",
  sourceCommit: "test",
  sources: [{ sourceId: "osm-test", name: "OpenStreetMap", licence: "ODbL-1.0", retrieved: "2026-11-01", inWebPack: true }],
  regions: [{ id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-80, 43.5, -79.5, 44], cells: ["n43.5_w079.5"] }],
  tranches: {},
  search: {},
  tiles: {},
  counts: { records: 1, byTranche: {}, bySource: {} },
};

const status: RegionStatus = {
  id: "toronto",
  label: { en: "Toronto", fr: "Toronto" },
  cells: ["n43.5_w079.5"],
  bytes: 3,
  downloaded: true,
  verified: true,
  missingCells: [],
  builtAt: manifest.builtAt,
  count: 1,
};

function part(overrides: Partial<RegionIntegrityPart> = {}): RegionIntegrityPart {
  return {
    path: "venues/osm-test/cell.ndjson.gz",
    data: goodBytes,
    expectedBytes: 3,
    expectedSha256: goodSha,
    expectedCount: 1,
    actualCount: 1,
    structurallyValid: true,
    source: sourceMeta,
    ...overrides,
  };
}

function mockSource(options: { parts: RegionIntegrityPart[]; fetchBytes?: Uint8Array; regions?: () => Promise<RegionStatus[]> }): PackSource {
  return {
    manifest: async () => manifest,
    cellsFor: async () => ["n43.5_w079.5"],
    records: async function* () {},
    search: async () => [],
    get: async () => null,
    sourcesFor: () => [],
    regions: options.regions ?? (async () => [status]),
    downloadRegion: async () => status,
    deleteRegion: async () => undefined,
    storedRegionIntegrity: async () => ({ regionId: "toronto", cellCount: 1, parts: options.parts }),
    fetchRegionPartBytes: async () => options.fetchBytes ?? goodBytes,
    commitCheckedRegion: vi.fn(async () => status),
  };
}

async function view(lang: "en" | "fr", source: PackSource) {
  await i18n.changeLanguage(lang);
  return render(
    <I18nextProvider i18n={i18n}>
      <OfflineRegionPage packSource={source} />
    </I18nextProvider>,
  );
}

async function axeViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations;
}

// The re-check reads and hashes every stored part. On a busy machine that can take longer than the default 1 s,
// so every async query waits up to 5 s, and the re-check tests (which also run axe) may take up to 30 s, instead of failing on a slow run.
beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 });
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(cleanup);

describe("offline region integrity re-check", { timeout: 30000 }, () => {
  it("announces a completed check only after the stored digest and count match", async () => {
    await view("en", mockSource({ parts: [part()] }));
    await screen.findByRole("heading", { name: "Offline regions" });
    fireEvent.click(await screen.findByRole("button", { name: offlineCatalog.en.recheck }));
    expect(await screen.findByText(offlineCatalog.en.downloaded)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: packIntegrityCopy("en", "corrupt").title })).toBeNull();
  });

  it.each(["en", "fr"] as const)("shows CorruptPackNotice with a re-download action for a corrupt pack (%s)", async (locale) => {
    const { container } = await view(locale, mockSource({ parts: [part({ data: new TextEncoder().encode("abd") })] }));
    await screen.findByRole("heading", { name: offlineCatalog[locale].title });
    fireEvent.click(await screen.findByRole("button", { name: offlineCatalog[locale].recheck }));
    const copy = packIntegrityCopy(locale, "corrupt");
    const notice = await screen.findByRole("alert");
    expect(notice.getAttribute("lang")).toBe(locale);
    expect(screen.getByRole("heading", { name: copy.title })).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.action })).toBeTruthy();
    expect(notice.textContent).not.toMatch(/verif|vérif/i);
    for (const button of notice.querySelectorAll("button")) {
      expect(button.style.minWidth).toBe("44px");
      expect(button.style.minHeight).toBe("44px");
    }
    expect(await axeViolations(container)).toEqual([]);
  });

  it("keeps the check from running twice and shows the damaged notice only when the check ends", async () => {
    let finish: (value: Awaited<ReturnType<PackSource["storedRegionIntegrity"]>>) => void = () => undefined;
    const pending = new Promise<Awaited<ReturnType<PackSource["storedRegionIntegrity"]>>>((resolve) => { finish = resolve; });
    const source = mockSource({ parts: [] });
    const integrity = vi.fn(() => pending);
    source.storedRegionIntegrity = integrity;
    await view("en", source);
    const button = await screen.findByRole("button", { name: offlineCatalog.en.recheck });
    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true));
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(integrity).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    finish({ regionId: "toronto", cellCount: 1, parts: [part({ data: new TextEncoder().encode("abd") })] });
    expect(await screen.findByRole("button", { name: packIntegrityCopy("en", "corrupt").action })).toBeTruthy();
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("treats a check that could not run as UNKNOWN, never as a pass", async () => {
    const source = mockSource({ parts: [] });
    source.storedRegionIntegrity = vi.fn(async () => { throw new Error("storage unavailable"); });
    await view("en", source);
    fireEvent.click(await screen.findByRole("button", { name: offlineCatalog.en.recheck }));
    const copy = packIntegrityCopy("en", "unknown");
    expect(await screen.findByRole("heading", { name: copy.title })).toBeTruthy();
    expect(screen.queryByText(offlineCatalog.en.downloaded)).toBeNull();
    await waitFor(() => expect((screen.getByRole("button", { name: offlineCatalog.en.recheck }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("can check again after a check that could not run", async () => {
    const source = mockSource({ parts: [part()] });
    const good = source.storedRegionIntegrity;
    source.storedRegionIntegrity = vi.fn().mockRejectedValueOnce(new Error("denied")).mockImplementation(good);
    await view("en", source);
    fireEvent.click(await screen.findByRole("button", { name: offlineCatalog.en.recheck }));
    await screen.findByRole("heading", { name: packIntegrityCopy("en", "unknown").title });
    await waitFor(() => expect((screen.getByRole("button", { name: offlineCatalog.en.recheck }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: offlineCatalog.en.recheck }));
    // The row also says "Downloaded, integrity checked", so look for the announcement itself.
    await waitFor(() => expect(screen.getAllByRole("status").some((node) => node.textContent === offlineCatalog.en.downloaded)).toBe(true));
  });

  it("re-downloads through redownloadPack and only then clears the damaged notice", async () => {
    const source = mockSource({
      parts: [part({ data: new TextEncoder().encode("abd") })],
      fetchBytes: goodBytes,
    });
    await view("en", source);
    await screen.findByRole("heading", { name: "Offline regions" });
    fireEvent.click(await screen.findByRole("button", { name: offlineCatalog.en.recheck }));
    const action = packIntegrityCopy("en", "corrupt").action;
    fireEvent.click(await screen.findByRole("button", { name: action }));
    await waitFor(() => expect(source.commitCheckedRegion).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(offlineCatalog.en.complete)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: packIntegrityCopy("en", "corrupt").title })).toBeNull();
  });
});

describe("offline region fail-safe states (docs/failsafe.md)", () => {
  const failsafe: RegionStatus = {
    ...status,
    cells: ["n43.5_w079.5", "n44.0_w079.5", "n44.5_w079.5"],
    unavailable: [
      { path: "venues/osm-test/n44.0_w079.5.ndjson.gz", sourceId: "osm-test", tranche: "venue", cell: "n44.0_w079.5", reason: "source-held" },
      { path: "paths/osm-test/n44.0_w079.5.ndjson.gz", sourceId: "osm-test", tranche: "path", cell: "n44.0_w079.5", reason: "too-large" },
    ],
    staleCells: ["n44.5_w079.5"],
    droppedRecords: 3,
  };

  it.each(["en", "fr"] as const)("names unavailable cells with the builder's reason, stale cells and the dropped count (%s)", async (locale) => {
    const c = offlineCatalog[locale];
    await view(locale, mockSource({ parts: [part()], regions: async () => [failsafe] }));
    await screen.findByRole("heading", { name: c.title });
    const notes = await screen.findByTestId("failsafe-toronto");
    await waitFor(() => expect(notes.querySelector('[data-failsafe="dropped"]')).not.toBeNull());
    expect(notes.getAttribute("role")).toBe("status");
    expect(notes.textContent).toContain(c.failsafeUnavailableIntro);
    const unavailable = notes.querySelectorAll('[data-failsafe="unavailable"]');
    // Two withheld parts in one cell read as one unavailable cell with both reasons.
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]?.textContent).toBe(`n44.0_w079.5 — ${c.failsafeUnavailable}. ${c.failsafeReason}source-held; too-large`);
    expect(notes.textContent).toContain(c.failsafeStale);
    expect([...notes.querySelectorAll('[data-failsafe="stale"]')].map((item) => item.textContent)).toEqual(["n44.5_w079.5"]);
    expect(notes.querySelector('[data-failsafe="dropped"]')?.textContent).toBe(c.failsafeDroppedMany.replace("{count}", "3"));
    // Scope axe to the live fail-safe region: full-page audits are covered above.
    // This keeps the bilingual evidence assertions and accessibility audit in one render.
    expect(await axeViolations(notes)).toEqual([]);
  });

  it.each(["en", "fr"] as const)("uses the singular for one dropped record and shows nothing else (%s)", async (locale) => {
    const c = offlineCatalog[locale];
    await view(locale, mockSource({ parts: [part()], regions: async () => [{ ...status, staleCells: [], unavailable: [], droppedRecords: 1 }] }));
    const notes = await screen.findByTestId("failsafe-toronto");
    await waitFor(() => expect(notes.textContent).toBe(c.failsafeDroppedOne));
    expect(notes.querySelector('[data-failsafe="unavailable"]')).toBeNull();
    expect(notes.querySelector('[data-failsafe="stale"]')).toBeNull();
  });

  it("keeps the status region empty when the data client reports no fail-safe state", async () => {
    await view("en", mockSource({ parts: [part()] }));
    const notes = await screen.findByTestId("failsafe-toronto");
    expect(notes.getAttribute("role")).toBe("status");
    expect(notes.textContent).toBe("");
  });

  it("announces a new fail-safe state in the same status region after a check", async () => {
    let current: RegionStatus = { ...status, droppedRecords: 0 };
    await view("en", mockSource({ parts: [part()], regions: async () => [current] }));
    const notes = await screen.findByTestId("failsafe-toronto");
    expect(notes.textContent).toBe("");
    current = { ...status, droppedRecords: 2 };
    fireEvent.click(await screen.findByRole("button", { name: offlineCatalog.en.recheck }));
    await waitFor(() => expect(screen.getByTestId("failsafe-toronto").textContent).toBe(offlineCatalog.en.failsafeDroppedMany.replace("{count}", "2")));
    expect(screen.getByTestId("failsafe-toronto")).toBe(notes);
  });
});
