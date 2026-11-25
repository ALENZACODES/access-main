/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { NoteReading, READING_ROWS_SHOWN } from "./NoteReading";
import { withNote } from "./noteTopicFixtures";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const PLAIN = "Ramp at the side door. Ring the bell. Staff will help you in.";
const HEAVY = "Accessibility accommodations necessitate preliminary communication regarding architectural modifications, notwithstanding unpredictable circumstances affecting administrative availability throughout institutional operations.";
const set = () => [
  withNote("p", PLAIN, { name: "Plain Place" }),
  withNote("h", HEAVY, { name: "Heavy House" }),
  withNote("s", "Open daily", { name: "Short One" }),
  withNote("n", null, { name: "No Note" }),
  withNote("f", "Entrée par le côté. Sonnez la sonnette. Le personnel vous aide.", { name: "Fleur" }),
];

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof set>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<NoteReading places={over.places ?? set()} locale={locale} onSave={over.onSave} />);
}
const toggle = (l: Locale = "en") => screen.getByRole("button", { name: l === "en" ? /^(Show|Hide) the reading ease of the notes$/ : /^(Afficher|Masquer) la facilité de lecture des notes$/ });
const open = (l: Locale = "en") => fireEvent.click(toggle(l));
const rowNames = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);

describe("NoteReading closed", () => {
  it("shows nothing for no places or when no place has a note", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [withNote("a", null)] }).container.innerHTML).toBe("");
  });
  it("starts closed, with the body hidden and no heading element", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe(container.querySelector("[data-note-reading-body]")!.id);
    expect((container.querySelector("[data-note-reading-body]") as HTMLElement).hidden).toBe(true);
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("NoteReading open", () => {
  it("lists the scored notes, hardest first, and not the short one or the missing one", () => {
    show();
    open();
    const names = rowNames();
    expect(names).toHaveLength(3);
    expect(names[0]).toBe("Heavy House");
    expect(names).not.toContain("Short One");
    expect(names).not.toContain("No Note");
  });
  it("says how many notes were scored, too short and absent", () => {
    show();
    open();
    expect(screen.getByText("3 of 4 notes could be scored.")).toBeTruthy();
    expect(screen.getByText("1 note is too short to score.")).toBeTruthy();
    expect(screen.getByText("1 place has no note.")).toBeTruthy();
    expect(screen.getByText(/Average score: \d+ out of 100/)).toBeTruthy();
  });
  it("says a note in the other language was read with its own formula", () => {
    show();
    open();
    expect(screen.getByText(/1 note looks to be in the other language/)).toBeTruthy();
  });
  it("shows each note exactly as written", () => {
    const { container } = show();
    open();
    const written = [...container.querySelectorAll("[data-note-as-written]")].map((e) => e.textContent);
    expect(written).toContain(PLAIN);
    expect(written).toContain(HEAVY);
  });
  it("lists the long words and long sentences of a note", () => {
    const long = `${Array.from({ length: 24 }, () => "go").join(" ")}. Ring the bell.`;
    show({ places: [...set(), withNote("l", long, { name: "Long One" })] });
    open();
    expect(screen.getByText(/Long words: .*accessibility/i)).toBeTruthy();
    expect(screen.getByText("1 long sentence (over 20 words).")).toBeTruthy();
  });
  it("has a table with a caption, column headers and a row header for each place", () => {
    show();
    open();
    const table = screen.getByRole("table", { name: "Notes by how easily they read" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Place", "Score", "Reads as", "Words", "Words per sentence"]);
  });
  it("orders by what is chosen", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    expect(rowNames()).toEqual(["Fleur", "Heavy House", "Plain Place"]);
    fireEvent.click(screen.getByRole("radio", { name: "Easiest first" }));
    expect(rowNames()[0]).not.toBe("Heavy House");
  });
  it("filters by band and says when none matches", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Fair" }));
    expect(screen.getByText("No note reads that way.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Every scored note" }));
    expect(screen.getByRole("table")).toBeTruthy();
  });
  it("says there is nothing to read when every note is too short", () => {
    show({ places: [withNote("a", "Open daily"), withNote("b", "Side door")] });
    open();
    expect(screen.getByText("None of these places has a note to read.")).toBeTruthy();
  });
  it("lists at most the row limit and says how many it shows", () => {
    const many = Array.from({ length: READING_ROWS_SHOWN + 5 }, (_, i) => withNote(`m${i}`, PLAIN, { name: `Place ${String(i).padStart(2, "0")}` }));
    show({ places: many as ReturnType<typeof set> });
    open();
    expect(rowNames()).toHaveLength(READING_ROWS_SHOWN);
    expect(screen.getByText(`Showing ${READING_ROWS_SHOWN} of ${READING_ROWS_SHOWN + 5}.`)).toBeTruthy();
  });
  it("keeps the choices when closed and opened again", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    open();
    open();
    expect((screen.getByRole("radio", { name: "By name" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("NoteReading hints", () => {
  it("lists what makes a note harder to read, beyond the long words and sentences", () => {
    const { container } = show({ places: [withNote("c", "Use the SIDE door; ring; wait; go on for help from staff", { name: "Caps Place" })] });
    open();
    const items = [...container.querySelectorAll("[data-note-hints] li")].map((li) => li.textContent);
    expect(items.some((x) => x!.includes("SIDE"))).toBe(true);
    expect(items.some((x) => x!.includes("does not end"))).toBe(true);
  });
  it("lists none for a plain note", () => {
    const { container } = show({ places: [withNote("p", PLAIN, { name: "Plain Place" })] });
    open();
    expect(container.querySelector("[data-note-hints]")).toBeNull();
  });
});

describe("NoteReading saving", () => {
  it("saves the text and the CSV of the listed notes", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(onSave.mock.calls.map((c) => c[0].name)).toEqual(["note-reading-ease.txt", "note-reading-ease.csv"]);
    expect(onSave.mock.calls[0]![0].content).toContain(PLAIN);
    expect(screen.getByText("Saved note-reading-ease.csv.")).toBeTruthy();
  });
  it("saves only what the filter lists", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Very hard" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    const rows = onSave.mock.calls[0]![0].content.trim().split("\r\n");
    expect(rows.length).toBeLessThanOrEqual(2);
  });
  it("says the browser cannot save when saving fails or throws", () => {
    show({ onSave: () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({
      onSave: () => {
        throw new Error("no");
      },
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
});

describe("NoteReading by keyboard", () => {
  it("opens with Enter and Space and keeps focus on the toggle", () => {
    show();
    const b = toggle();
    b.focus();
    for (const key of ["Enter", " "]) {
      fireEvent.keyDown(b, { key });
      fireEvent.keyUp(b, { key });
    }
    expect(document.activeElement).toBe(b);
  });
  it("has no tab stop on anything that is not a control", () => {
    show();
    open();
    for (const e of document.querySelectorAll<HTMLElement>("[tabindex]")) expect(["INPUT", "BUTTON", "LABEL", "DIV", "SPAN"]).toContain(e.tagName);
  });
});

for (const locale of ["en", "fr"] as const) {
  describe(`NoteReading in ${locale}`, () => {
    it("has no axe violations closed, open and with a filter chosen", async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
      fireEvent.click(screen.getAllByRole("radio")[1]!);
      expect((await axe.run(container, axeRules)).violations, "filtered").toEqual([]);
    });
    it("uses the page's language on its own words", () => {
      const { container } = show({ locale });
      open(locale);
      expect(container.querySelector("section")!.getAttribute("lang")).toBe(locale);
      if (locale === "fr") for (const el of container.querySelectorAll<HTMLElement>("section > p, button, label, caption, th, [data-note-reading-body] > p, small")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    });
  });
}
