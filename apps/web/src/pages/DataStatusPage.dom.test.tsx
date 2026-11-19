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
  tier?: number | string | null;
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
        tier: s.tier === undefined ? 0 : s.tier,
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

describe("copy lives in the message tables", () => {
  const source = import.meta.glob<string>("./DataStatusPage.tsx", { query: "?raw", import: "default", eager: true });

  it("the page has no language-switched text of its own", () => {
    const text = Object.values(source)[0] ?? "";
    expect(text.length).toBeGreaterThan(1000);
    const switched = text.match(/locale === "fr" \?\s*["'`][^"'`]*["'`]/g) ?? [];
    // The only allowed one is the no-break space before a colon (punctuation, not wording).
    expect(switched.filter((m) => !m.includes("\\u00A0:"))).toEqual([]);
  });

  it("shows the Downloads heading and intro from the table, in both languages", async () => {
    seeds = [{ id: "a", title: "A", retrieved: daysAgo(3) }];
    await view("en");
    await sourceTable();
    expect(screen.getByRole("heading", { name: "Downloads" })).toBeTruthy();
    expect(screen.getByText("Files are made on this device from the saved records above.")).toBeTruthy();
    cleanup();
    await view("fr");
    await sourceTable();
    expect(screen.getByRole("heading", { name: "Télécharger" })).toBeTruthy();
    expect(screen.getByText("Les fichiers sont créés sur cet appareil à partir des données enregistrées ci-dessus.")).toBeTruthy();
  });
});

/** jsdom's Blob has no text(); read it the way a browser page would. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("planning sections and extra downloads on the live panel", () => {
  const user = { click: (el: HTMLElement) => el.click() };
  const saved: Blob[] = [];

  beforeAll(() => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => (saved.push(b), "blob:test"), revokeObjectURL: () => undefined }));
    HTMLAnchorElement.prototype.click = vi.fn();
  });
  afterEach(() => {
    saved.length = 0;
  });

  it("shows the review workload and the age bands for saved records", async () => {
    seeds = [
      { id: "a", title: "Fresh stop", retrieved: daysAgo(3) },
      { id: "b", title: "Old stop", retrieved: daysAgo(400) },
      { id: "c", title: "Undated stop", retrieved: null },
    ];
    await view("en");
    await screen.findByRole("heading", { name: /Review workload|Charge de révision/ });
    const planning = screen.getByRole("region", { name: /Data status panel|Panneau de l’état des données/ });
    hasText(planning, "Review workload");
    hasText(planning, "1 source is past its review date.");
    hasText(planning, "1 source is not scheduled because its retrieved date is unknown.");
    const ages = within(planning).getByRole("table", { name: "Sources by age of retrieved date" });
    const rows = within(ages).getAllByRole("row").map((r) => cells(r));
    expect(rows.find((r) => r[0] === "0 to 30 days")?.[1]).toBe("1");
    expect(rows.find((r) => r[0] === "More than 365 days")?.[1]).toBe("1");
    expect(rows.find((r) => r[0] === "Unknown date")?.[1]).toBe("1");
  });

  it("shows the summary, the next steps and the licences in use", async () => {
    seeds = [
      { id: "a", title: "Fresh stop", retrieved: daysAgo(3) },
      { id: "b", title: "Old stop", retrieved: daysAgo(400), licence: "Custom terms" },
    ];
    await view("en");
    await screen.findByRole("heading", { name: "At a glance" });
    const panel = screen.getByRole("region", { name: /Data status panel/ });
    hasText(panel, "2 sources saved on this device");
    expect(within(panel).getByRole("heading", { name: "What to do next" })).toBeTruthy();
    const licences = within(panel).getByRole("table", { name: "Sources by licence" });
    const rows = within(licences).getAllByRole("row").map((r) => cells(r));
    expect(rows.find((r) => r[0] === "Custom terms")?.[1]).toBe("Not on the reference list");
    expect(rows.find((r) => /Open Government Licence/.test(r[0] ?? ""))?.[2]).toBe("1");
  });

  it("shows them in French, with the French table names", async () => {
    seeds = [{ id: "a", title: "Arrêt", retrieved: daysAgo(3) }];
    await view("fr");
    await screen.findByRole("heading", { name: /Review workload|Charge de révision/ });
    const planning = screen.getByRole("region", { name: /Data status panel|Panneau de l’état des données/ });
    hasText(planning, "Charge de révision");
    expect(within(planning).getByRole("table", { name: "Sources selon l’âge de la date de récupération" })).toBeTruthy();
    noText(planning, "Review workload");
  });

  it("says there is nothing to plan, instead of leaving the sections out, when nothing is saved", async () => {
    seeds = [];
    await view("en");
    await screen.findByText("No source has a review date to plan around.");
    await screen.findByText("There are no sources to count.");
  });

  it("has no axe violations with the planning views, in both languages", async () => {
    seeds = [
      { id: "a", title: "A", retrieved: daysAgo(3) },
      { id: "b", title: "B", retrieved: daysAgo(500) },
    ];
    for (const lang of ["en", "fr"] as const) {
      const { container } = await view(lang);
      await screen.findByRole("heading", { name: /Review workload|Charge de révision/ });
      const results = await axe.run(container, { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } });
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), lang).toEqual([]);
      cleanup();
    }
  });

  it("saves the Markdown report from the same records", async () => {
    seeds = [{ id: "a", title: "Fresh stop", retrieved: daysAgo(3) }];
    await view("en");
    await screen.findByRole("heading", { name: /Review workload|Charge de révision/ });
    user.click(screen.getByRole("button", { name: "Download the audit report (Markdown)" }));
    expect(saved).toHaveLength(1);
    const text = await readBlob(saved[0]!);
    expect(text.startsWith("# Data status\n")).toBe(true);
    expect(text).toContain("| Sources | 1 |");
    expect(saved[0]!.type).toBe("text/markdown;charset=utf-8");
  });

  it("saves a checksum list that matches the saved files", async () => {
    seeds = [{ id: "a", title: "Fresh stop", retrieved: daysAgo(3) }];
    await view("fr");
    await screen.findByRole("heading", { name: /Review workload|Charge de révision/ });
    user.click(screen.getByRole("button", { name: "Télécharger la liste des sommes de contrôle (texte)" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const text = await readBlob(saved[0]!);
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line).toMatch(/^[0-9a-f]{64} {2}[A-Za-z0-9._-]+$/);
    expect(lines.map((l) => l.slice(66))).toEqual(["catalogue.json", "credits.txt", "data-sources.csv", "review-dates.ics", "summary.json"]);
  });

  it("says so, and saves nothing, when this browser cannot make checksums", async () => {
    seeds = [{ id: "a", title: "A", retrieved: daysAgo(3) }];
    vi.stubGlobal("crypto", {});
    try {
      await view("en");
      await screen.findByRole("heading", { name: /Review workload|Charge de révision/ });
      user.click(screen.getByRole("button", { name: "Download the checksum list (text)" }));
      await screen.findByText("Checksums cannot be made in this browser.");
      expect(saved).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => (saved.push(b), "blob:test"), revokeObjectURL: () => undefined }));
    }
  });

  it("saves an empty report, saying there are no sources, when nothing is saved", async () => {
    seeds = [];
    await view("en");
    await screen.findByText("No source has a review date to plan around.");
    user.click(screen.getByRole("button", { name: "Download the audit report (Markdown)" }));
    expect(saved).toHaveLength(1);
    hasText(document.body, "Data status");
    expect(await readBlob(saved[0]!)).toContain("There are no sources.");
  });

  it("uses one live region for list changes, not the table", async () => {
    seeds = [{ id: "a", title: "A", retrieved: daysAgo(3) }];
    await view("en");
    await screen.findByRole("heading", { name: "Review workload" });
    const panel = screen.getByRole("region", { name: "Data status panel" });
    expect(panel.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(panel.querySelector('[data-region="sources"]')?.hasAttribute("aria-live")).toBe(false);
  });

  it("counts saved records by the tier written on each, and lists the ones with a gap", async () => {
    seeds = [
      { id: "a", title: "Fresh stop", retrieved: daysAgo(3) },
      { id: "b", title: "Desk stop", retrieved: daysAgo(5), tier: "E" },
      { id: "c", title: "No tier stop", retrieved: daysAgo(7), tier: null },
    ];
    await view("en");
    await screen.findByRole("heading", { name: "Tier of each record" });
    const panel = screen.getByRole("region", { name: "Data status panel" });
    const tiers = within(panel).getByRole("table", { name: "Records by tier" });
    const rows = within(tiers).getAllByRole("row").map((r) => cells(r));
    expect(rows.find((r) => r[0] === "Tier 0")?.[2]).toBe("1");
    expect(rows.find((r) => r[0] === "Tier E")?.[2]).toBe("1");
    expect(rows.find((r) => r[0] === "Unknown")?.[2]).toBe("1");
    hasText(panel, "Records that state a tier: 2 of 3.");
    hasText(panel, "Records that carry all four: 2 of 3.");
    const gaps = within(panel).getByRole("table", { name: "Records with a missing source, licence, date or tier" });
    const gapRows = within(gaps).getAllByRole("row").map((r) => cells(r));
    expect(gapRows).toHaveLength(2);
    expect(gapRows[1]?.slice(1)).toEqual(["Recorded", "Recorded", "Recorded", "Unknown"]);
  });

  it("shows the tier sections in French", async () => {
    seeds = [{ id: "a", title: "Fresh stop", retrieved: daysAgo(3) }];
    await view("fr");
    await screen.findByRole("heading", { name: "Niveau de chaque enregistrement" });
    const panel = screen.getByRole("region", { name: "Panneau de l’état des données" });
    expect(within(panel).getByRole("table", { name: "Enregistrements selon le niveau" })).toBeTruthy();
    hasText(panel, "Chaque enregistrement comporte une source, une licence, une date de récupération et un niveau.");
    expect(within(panel).getByRole("heading", { name: "Termes employés dans ce panneau" })).toBeTruthy();
  });

  it("saves source, licence, date and tier for each record as a CSV file", async () => {
    seeds = [
      { id: "a", title: "Fresh stop", retrieved: daysAgo(3) },
      { id: "c", title: "No tier stop", retrieved: null, tier: null },
    ];
    await view("en");
    await screen.findByRole("heading", { name: "Tier of each record" });
    user.click(screen.getByRole("button", { name: "Download source, licence, date and tier for each record (CSV)" }));
    expect(saved).toHaveLength(1);
    expect(saved[0]!.type).toBe("text/csv;charset=utf-8");
    const lines = (await readBlob(saved[0]!)).replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Dataset,Record ID,Record,Source,Source page,Licence,Retrieved (YYYY-MM-DD),Status,Tier,Facts that are unknown");
    expect(lines[1]?.split(",").slice(-2)).toEqual(["0", "0"]);
    expect(lines[2]?.split(",").slice(-2)).toEqual(["Unknown", "2"]);
  });

  it("has no axe violations with the tier sections, in both languages", async () => {
    for (const lang of ["en", "fr"] as const) {
      seeds = [
        { id: "a", title: "Fresh stop", retrieved: daysAgo(3) },
        { id: "c", title: "No tier stop", retrieved: null, tier: "gold" },
      ];
      const { container } = await view(lang);
      await screen.findByRole("heading", { name: /Tier of each record|Niveau de chaque enregistrement/ });
      const results = await axe.run(container, { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } });
      expect(results.violations.map((v) => v.id)).toEqual([]);
      cleanup();
    }
  });

  it("shows the tier in the source list and offers a tier filter", async () => {
    seeds = [
      { id: "a", title: "Fresh stop", retrieved: daysAgo(3) },
      { id: "b", title: "Desk stop", source: "Desk source", retrieved: daysAgo(5), tier: "E" },
      { id: "c", title: "No tier stop", source: "Other source", retrieved: daysAgo(7), tier: null },
    ];
    await view("en");
    await screen.findByRole("heading", { name: "Tier of each record" });
    const panel = screen.getByRole("region", { name: "Data status panel" });
    const list = within(panel).getByRole("table", { name: "Sources" });
    const rows = within(list).getAllByRole("row").map((r) => cells(r));
    expect(rows[0]?.at(-1)).toMatch(/^Tier/);
    expect(rows.slice(1).map((r) => r.at(-1)).sort()).toEqual(["0", "E", "Unknown"]);
    const select = within(panel).getByLabelText("Tier") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["any", "0", "1", "2", "3", "4", "E", "unknown"]);
  });
});
