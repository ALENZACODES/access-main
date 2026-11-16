/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

/**
 * Live Data status page: a source shared by several cached records never looks better than its worst
 * record, every status states its reason, and UNKNOWN rates are shown for what is cached.
 */

const DAY = 86_400_000;

function hasText(el: Element, want: string | RegExp): void {
  const text = (el.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
  if (typeof want === "string") expect(text).toContain(want);
  else expect(text).toMatch(want);
}
function noText(el: Element, unwanted: string | RegExp): void {
  const text = (el.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
  if (typeof unwanted === "string") expect(text).not.toContain(unwanted);
  else expect(text).not.toMatch(unwanted);
}
function cells(row: HTMLElement): string[] {
  return [...row.children].map((c) => (c.textContent ?? "").trim());
}
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

interface Seed {
  id: string;
  title: string;
  source?: string;
  licence?: string;
  retrieved: string | null;
  url?: string | null;
}

let seeds: Seed[] = [];

vi.mock("../storage/repository.ts", () => ({
  listCacheEntries: async () =>
    seeds.map((s) => ({
      id: s.id,
      kind: "place",
      title: s.title,
      stored_at: new Date().toISOString(),
      provenance: {
        source_name: s.source ?? "Open data",
        source_url: s.url === undefined ? "https://example.org/data" : s.url,
        licence: s.licence ?? "Open Government Licence – Ontario",
        licence_url: null,
        source_date: "2026-01-01",
        retrieved_at: s.retrieved,
        tier: 0,
        prototype_label: "SEEDED",
        freshness: "unknown",
      },
      contains_live_status: false,
      payload: {},
    })),
  summarizeStorage: async () => ({ health: "ok", profile: null, cacheCount: seeds.length, outboxCount: 0, newestStoredAt: null }),
  clearCachedRecords: async () => undefined,
}));

const { DataStatusPage } = await import("./DataStatusPage.tsx");
const i18n = initI18n();

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(() => {
  cleanup();
  seeds = [];
});

async function view(lang: "en" | "fr") {
  await i18n.changeLanguage(lang);
  const out = render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <DataStatusPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return out;
}

async function sourceTable() {
  return screen.findByRole("table", { name: /Data sources|Sources de données/ });
}

describe("a shared source never looks better than its worst record", () => {
  it("shows Unknown, with the reason, when one of its records has a placeholder date", async () => {
    seeds = [
      { id: "a", title: "Fresh stop", retrieved: daysAgo(3) },
      { id: "b", title: "Placeholder stop", retrieved: "N/A" },
    ];
    await view("en");
    const table = await sourceTable();
    const row = within(table).getAllByRole("row")[1]!;
    hasText(row, "Unknown");
    hasText(row, "Retrieval date unknown");
    noText(row, /Retrieved \d+ days? ago/);
    hasText(screen.getByTestId("source-basis"), "Records without a usable retrieved date: 1 of 2.");
  });

  it("shows the oldest date, and says so, when every record is readable", async () => {
    seeds = [
      { id: "a", title: "New", retrieved: daysAgo(3) },
      { id: "b", title: "Old", retrieved: daysAgo(200) },
    ];
    await view("en");
    const row = within(await sourceTable()).getAllByRole("row")[1]!;
    hasText(row, "May be out of date");
    hasText(screen.getByTestId("source-basis"), "The date shown is the oldest among this source’s cached records (2).");
  });

  it("has no note for a source with one dated record", async () => {
    seeds = [{ id: "a", title: "Only", retrieved: daysAgo(3) }];
    await view("en");
    await sourceTable();
    expect(screen.getByTestId("source-basis").children).toHaveLength(0);
  });

  it("says the same in French, with a non-breaking space before the colon", async () => {
    seeds = [
      { id: "a", title: "Récent", retrieved: daysAgo(3) },
      { id: "b", title: "Sans date", retrieved: null },
    ];
    await view("fr");
    await sourceTable();
    const note = screen.getByTestId("source-basis");
    hasText(note, "Open data : Date affichée comme inconnue.");
    hasText(note, "Fiches sans date de récupération utilisable : 1 sur 2.");
  });

  it("names an unnamed source as unknown instead of showing the placeholder", async () => {
    seeds = [
      { id: "a", title: "A", source: "N/A", retrieved: daysAgo(3) },
      { id: "b", title: "B", source: "N/A", retrieved: null },
    ];
    await view("en");
    await sourceTable();
    hasText(screen.getByTestId("source-basis"), "Unknown name");
    noText(screen.getByTestId("source-basis"), "N/A");
  });
});

describe("each record states why it has its status", () => {
  it("fresh, stale and unknown each carry a reason with the limit", async () => {
    seeds = [
      { id: "a", title: "Fresh stop", retrieved: daysAgo(3) },
      { id: "b", title: "Stale stop", retrieved: daysAgo(200) },
      { id: "c", title: "Undated stop", retrieved: null },
      { id: "d", title: "Future stop", retrieved: new Date(Date.now() + 40 * DAY).toISOString() },
      { id: "e", title: "Bad stop", retrieved: "2026-02-31" },
    ];
    await view("en");
    await sourceTable();
    const basis = (title: string) => within(screen.getByText(title).closest("li") as HTMLElement).getByTestId("status-basis");
    hasText(basis("Fresh stop"), /Retrieved .*, 3 days ago\. Within the 180 days limit\./);
    hasText(basis("Stale stop"), /Retrieved .*, 200 days ago\. Past the 180 days limit\./);
    hasText(basis("Undated stop"), "No retrieved date is recorded, so the status is unknown.");
    hasText(basis("Future stop"), /is after today, so the status is unknown\./);
    hasText(basis("Bad stop"), "could not be read as a real calendar date");
  });

  it("is in French", async () => {
    seeds = [{ id: "a", title: "Arrêt", retrieved: daysAgo(200) }];
    await view("fr");
    await sourceTable();
    hasText(screen.getByTestId("status-basis"), /Récupérée le .*, il y a 200 jours\. Au-delà de la limite de 180 jours\./);
  });

  it("never describes an unknown record as within or past the limit", async () => {
    seeds = [{ id: "a", title: "A", retrieved: "TBD" }, { id: "b", title: "B", retrieved: null }];
    await view("en");
    await sourceTable();
    for (const el of screen.getAllByTestId("status-basis")) expect(el.textContent).not.toMatch(/Within|Past/);
  });
});

describe("UNKNOWN rates for what is cached", () => {
  it("is not shown for an empty cache", async () => {
    await view("en");
    expect(screen.queryByText("Completeness by field")).toBeNull();
    hasText(screen.getByTestId("unknown-date-rate"), "Unknown");
  });

  it("counts unknown dates, licences, publishers and links", async () => {
    seeds = [
      { id: "a", title: "A", retrieved: daysAgo(3) },
      { id: "b", title: "B", retrieved: null, licence: "TBD", url: null },
      { id: "c", title: "C", retrieved: "N/A", source: "unknown" },
      { id: "d", title: "D", retrieved: daysAgo(10) },
    ];
    await view("en");
    await sourceTable();
    const table = screen.getByRole("table", { name: "Completeness by field" });
    const rowFor = (label: string) => {
      const found = within(table).getAllByRole("row").find((r) => cells(r)[0] === label);
      if (!found) throw new Error(`no row ${label}`);
      return found;
    };
    // Field, known, unknown, share.
    expect(cells(rowFor("Retrieved date"))).toEqual(["Retrieved date", "2", "2", "50.0%"]);
    expect(cells(rowFor("Licence"))).toEqual(["Licence", "3", "1", "25.0%"]);
    expect(cells(rowFor("Publisher"))).toEqual(["Publisher", "3", "1", "25.0%"]);
    expect(cells(rowFor("Link"))).toEqual(["Link", "3", "1", "25.0%"]);
  });

  it("keeps the page rate and the table rate equal", async () => {
    seeds = [
      { id: "a", title: "A", retrieved: daysAgo(3) },
      { id: "b", title: "B", retrieved: null },
      { id: "c", title: "C", retrieved: "garbage" },
    ];
    await view("en");
    await sourceTable();
    const pageRate = screen.getByTestId("unknown-date-rate").textContent;
    const table = screen.getByRole("table", { name: "Completeness by field" });
    hasText(within(table).getByRole("row", { name: /^Retrieved date/ }), pageRate as string);
  });

  it("is in French with the French rate format", async () => {
    seeds = [{ id: "a", title: "A", retrieved: daysAgo(3) }, { id: "b", title: "B", retrieved: null }, { id: "c", title: "C", retrieved: null }];
    await view("fr");
    await sourceTable();
    const table = screen.getByRole("table", { name: "Complétude par champ" });
    hasText(within(table).getByRole("row", { name: /^Date de récupération/ }), "66,7 %");
  });
});

describe("accessibility of the new content", () => {
  it.each(["en", "fr"] as const)("has no axe violations in %s", async (lang) => {
    seeds = [
      { id: "a", title: "A", retrieved: daysAgo(3) },
      { id: "b", title: "B", retrieved: "N/A" },
      { id: "c", title: "C", retrieved: daysAgo(300), licence: "TBD" },
    ];
    const { container } = await view(lang);
    await waitFor(() => expect(screen.getAllByTestId("status-basis").length).toBe(3));
    const results = await axe.run(container, { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
