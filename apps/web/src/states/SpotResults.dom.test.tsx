/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_DIFFERENCES_SHOWN, SpotResults } from "./SpotResults";
import { PackSpotCheck } from "./PackSpotCheck";
import type { SavedFile } from "./downloadFile";
import { csvCell } from "./exportData";
import { varied } from "./placeFixtures";
import { SPOT_CSV_HEADER } from "./spotSheetExport";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);

const HEAD = SPOT_CSV_HEADER.join(",");
const line = (cells: Partial<Record<(typeof SPOT_CSV_HEADER)[number], string>>): string => SPOT_CSV_HEADER.map((h) => csvCell(cells[h] ?? "")).join(",");
const csv = (...rows: string[]) => [HEAD, ...rows].join("\r\n") + "\r\n";
const base = { pack_tag: "yes", pack_source: "OpenStreetMap", pack_retrieved_on: "2026-11-10" };
const filled = csv(
  line({ ...base, n: "1", place_id: "p1", place_name: "Café Un", step: "No", match: "Same" }),
  line({ ...base, n: "2", place_id: "p2", place_name: "Bibliothèque", pack_tag: "limited", step: "Yes", ramp: "No", match: "Different", notes: "Two steps" }),
  line({ ...base, n: "3", place_id: "p3", place_name: "Musée", match: "Could not tell" }),
);
const OPEN = { en: "Read your filled-in sheet back", fr: "Relire votre feuille remplie" } as const;
const PASTE = { en: "Paste your filled-in CSV", fr: "Collez votre fichier CSV rempli" } as const;

function show(over: { locale?: "en" | "fr"; copy?: (t: string) => Promise<boolean>; onSave?: (f: SavedFile) => boolean; open?: boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const view = render(<SpotResults locale={locale} today="2026-11-23" copy={over.copy ?? (async () => true)} onSave={over.onSave ?? (() => true)} />);
  if (over.open !== false) fireEvent.click(screen.getByRole("button", { name: OPEN[locale] }));
  return { ...view, locale };
}
const paste = (text: string, locale: "en" | "fr" = "en") => fireEvent.change(screen.getByLabelText(PASTE[locale]), { target: { value: text } });

describe("opening", () => {
  it("is closed by default with no heading, and opens and closes", () => {
    show({ open: false });
    expect(screen.getByRole("button", { name: OPEN.en }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: OPEN.en }));
    expect(screen.getByLabelText(PASTE.en)).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide reading your answers" }));
    expect(screen.queryByLabelText(PASTE.en)).toBeNull();
  });
  it("says nothing until something is pasted", () => {
    show();
    expect(document.querySelector("[data-results-summary]")).toBeNull();
    expect(document.querySelector("[data-results-problem]")).toBeNull();
  });
});

describe("reading a pasted sheet", () => {
  it("says how many places were read and sums up the answers", () => {
    show();
    paste(filled);
    expect(screen.getByText("Read 3 places.")).toBeTruthy();
    expect(screen.getByText("Of 3 places on the sheet: 1 matched the tag, 1 differed from the tag, 1 could not be judged.")).toBeTruthy();
  });
  it("tallies by tag", () => {
    show();
    paste(filled);
    expect(screen.getByText("yes: 2 places, 1 matched, 0 differed")).toBeTruthy();
    expect(screen.getByText("limited: 1 place, 0 matched, 1 differed")).toBeTruthy();
  });
  it("lists the differences with the answers and notes typed", () => {
    show();
    paste(filled);
    expect(screen.getByText("Differences you saw (1)")).toBeTruthy();
    const item = screen.getByText("Bibliothèque").closest("li") as HTMLElement;
    expect(within(item).getByText("Is there a step at the main entrance? Yes")).toBeTruthy();
    expect(within(item).getByText("Is there a ramp or a lift where there is a step? No")).toBeTruthy();
    expect(within(item).getByText("Your notes: Two steps")).toBeTruthy();
  });
  it("says no difference was recorded when none was", () => {
    show();
    paste(csv(line({ ...base, n: "1", place_id: "p1", place_name: "A", match: "Same" })));
    expect(screen.getByText("You did not record any difference.")).toBeTruthy();
  });
  it("says nothing was answered for an empty sheet, with no buttons", () => {
    show();
    paste(csv(line({ ...base, n: "1", place_id: "p1", place_name: "A" })));
    expect(screen.getByText("No answers were typed in yet, so there is nothing to summarise.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /note of the differences/i })).toBeNull();
  });
  it("always says the counts are not a rate", () => {
    show();
    paste(filled);
    expect(screen.getByText(/They are not a rate/)).toBeTruthy();
  });
  it("lists rows with a cell it could not read, and says what is accepted", () => {
    show();
    paste(csv(line({ ...base, n: "1", place_id: "p1", place_name: "Odd", step: "maybe", match: "Same", date_looked: "yesterday" })));
    const box = document.querySelector("[data-results-problems]") as HTMLElement;
    expect(within(box).getByText(/1 place had a cell that could not be read/)).toBeTruthy();
    expect(within(box).getByText(/Odd \(p1\): answer in “step” not understood, date not understood/)).toBeTruthy();
  });
  it("counts rows left out for having no place id", () => {
    show();
    paste(csv(line({ ...base, n: "1", place_id: "p1", match: "Same" }), line({ n: "2", match: "Same" })));
    expect(screen.getByText("Read 1 place. 1 row with no place id was left out.")).toBeTruthy();
  });
  it("caps the differences listed in full, and the note holds them all", async () => {
    const copy = vi.fn(async () => true);
    show({ copy });
    paste(csv(...Array.from({ length: MAX_DIFFERENCES_SHOWN + 5 }, (_, i) => line({ ...base, n: String(i + 1), place_id: `d${i}`, place_name: `Diff ${i}`, match: "Different" }))));
    const items = document.querySelectorAll("[data-results-summary] > ul:last-of-type > li");
    expect(items.length).toBe(MAX_DIFFERENCES_SHOWN);
    fireEvent.click(screen.getByRole("button", { name: "Copy a note of the differences" }));
    await waitFor(() => expect(copy).toHaveBeenCalled());
    expect((copy.mock.calls[0] as unknown as [string])[0]).toContain(`Diff ${MAX_DIFFERENCES_SHOWN + 4}`);
  });
  it("refuses text that is not the sheet, with a reason, and no summary", () => {
    show();
    paste("hello");
    expect(screen.getByText(/The first line is not the one from a spot-check sheet/)).toBeTruthy();
    expect(document.querySelector("[data-results-summary]")).toBeNull();
    paste(`"${HEAD}`);
    expect(screen.getByText(/does not read as a CSV file/)).toBeTruthy();
    paste(`${HEAD}\r\n`);
    expect(screen.getByText("The CSV has no places in it.")).toBeTruthy();
  });
  it("clears when the box is emptied", () => {
    show();
    paste(filled);
    paste("");
    expect(document.querySelector("[data-results-summary]")).toBeNull();
  });
});

describe("the note", () => {
  it("copies the note and says so", async () => {
    const copy = vi.fn(async () => true);
    show({ copy });
    paste(filled);
    fireEvent.click(screen.getByRole("button", { name: "Copy a note of the differences" }));
    await waitFor(() => expect(screen.getByText("Note copied.")).toBeTruthy());
    const text = (copy.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain("Spot-check differences");
    expect(text).toContain("Bibliothèque");
    expect(text).not.toContain("Musée");
  });
  it("says when the browser could not copy", async () => {
    show({ copy: async () => false });
    paste(filled);
    fireEvent.click(screen.getByRole("button", { name: "Copy a note of the differences" }));
    await waitFor(() => expect(screen.getByText(/could not copy\. Save the note as a file instead/)).toBeTruthy());
  });
  it("saves the note with its name and type", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    paste(filled);
    fireEvent.click(screen.getByRole("button", { name: "Save the note of the differences (text)" }));
    const f = onSave.mock.calls[0]![0];
    expect(f.name).toBe("spot-check-differences.txt");
    expect(f.mime).toBe("text/plain;charset=utf-8");
    expect(f.content).toContain("Made on 2026-11-23");
    expect(screen.getByText("Saved spot-check-differences.txt.")).toBeTruthy();
  });
  it("says so when saving fails or throws", () => {
    const { unmount } = show({ onSave: () => false });
    paste(filled);
    fireEvent.click(screen.getByRole("button", { name: "Save the note of the differences (text)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    unmount();
    show({ onSave: () => { throw new Error("blocked"); } });
    paste(filled);
    fireEvent.click(screen.getByRole("button", { name: "Save the note of the differences (text)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
  it("keeps what was pasted out of storage", () => {
    const before = JSON.stringify({ ...localStorage, ...sessionStorage });
    show();
    paste(filled);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).toBe(before);
  });
});

describe("inside the spot-check panel", () => {
  it("reads back the CSV the panel itself saved, once answers are typed in", () => {
    let saved: SavedFile | null = null;
    document.documentElement.lang = "en";
    render(<PackSpotCheck places={varied(33, 30)} locale="en" today="2026-11-21" onSave={(f) => ((saved = f.name.endsWith(".csv") ? f : saved), true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Make a spot-check sheet to fill in while you look" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet (CSV)" }));
    const lines = saved!.content.replace(/^\uFEFF/, "").split("\r\n");
    const answered = [lines[0], ...lines.slice(1, -1).map((l, i) => (i === 0 ? l.replace(/,,,,,,,$/, ",Yes,No,Yes,Yes,Different,2026-11-22,Saw it") : l)), ""].join("\r\n");
    fireEvent.click(screen.getByRole("button", { name: "Read your filled-in sheet back" }));
    fireEvent.change(screen.getByLabelText("Paste your filled-in CSV"), { target: { value: answered } });
    expect(screen.getByText("Read 5 places.")).toBeTruthy();
    expect(screen.getByText("Differences you saw (1)")).toBeTruthy();
  });
});

describe("in French and for accessibility", () => {
  it("uses French words and punctuation", () => {
    show({ locale: "fr" });
    paste(filled, "fr");
    expect(screen.getByText("3 lieux lus.")).toBeTruthy();
    for (const el of document.querySelectorAll("p, button, label")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations with a summary (${locale})`, async () => {
      const { container } = show({ locale });
      paste(filled, locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
    it(`has no axe violations with a refusal (${locale})`, async () => {
      const { container } = show({ locale });
      paste("hello", locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
  it("labels the box and adds no heading", () => {
    show();
    paste(filled);
    for (const box of screen.getAllByRole("textbox")) expect(document.querySelector(`label[for="${box.id}"]`)).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
