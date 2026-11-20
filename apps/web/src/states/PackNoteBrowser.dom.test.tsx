/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackNoteBrowser, NOTE_WINDOW } from "./PackNoteBrowser";
import { LONG_NOTE, noteSet, noted } from "./packNoteFixtures";
import { parseCsv } from "./csvParse";
import type { SavedFile } from "./downloadFile";
import type { Locale } from "./stateCopy";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const NBSP = " ";
const plain = (s: string): string => s.split(NBSP).join(" ");

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof noteSet>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<PackNoteBrowser places={over.places ?? noteSet()} locale={locale} onSave={over.onSave} />);
}
const open = (locale: Locale = "en") => fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show the notes" : "Afficher les notes" }));
const items = () => within(screen.getByRole("list", { name: "Notes" })).getAllByRole("listitem");
const titles = () => items().map((li) => li.querySelector("strong")!.textContent);
const search = (value: string) => fireEvent.change(screen.getByLabelText("Search the notes"), { target: { value } });

describe("when it shows", () => {
  it("shows nothing for no places, or when no place has a note", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [noted("a", null), noted("b", "")] }).container.innerHTML).toBe("");
  });
  it("is closed to begin with and says it is collapsed", () => {
    show();
    expect(screen.getByRole("button", { name: "Show the notes" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Notes" })).toBeNull();
  });
  it("opens and closes with the same button", () => {
    show();
    open();
    expect(screen.getByRole("button", { name: "Hide the notes" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide the notes" }));
    expect(screen.queryByLabelText("Search the notes")).toBeNull();
  });
});

describe("reading the notes", () => {
  it("says what the pack holds and that a note is the pack's wording", () => {
    show();
    open();
    expect(screen.getByText(/exactly as written/)).toBeTruthy();
    expect(screen.getByText("6 of 8 places have a note.")).toBeTruthy();
    expect(screen.getByText(/2 places have no note\. That does not mean there is nothing to know about them\./)).toBeTruthy();
    expect(screen.getByText(plain(`2${NBSP}Yes, 1${NBSP}Limited, 1${NBSP}No, 1${NBSP}Designated, 1${NBSP}UNKNOWN`))).toBeTruthy();
  });
  it("lists the places that have a note, by name, each with its tag and its note as written", () => {
    show();
    open();
    expect(titles()).toEqual(["Alpha Cafe", "Beta Library", "Epsilon Bar", "Fleur d’Été", "Gamma Museum", "Hotel Hall"]);
    const alpha = items()[0]!;
    expect(alpha.textContent).toContain("Wheelchair tag: Limited");
    expect(within(alpha).getByRole("blockquote", { name: "Note, as written in the pack, Alpha Cafe" }).textContent).toBe("Step at the door");
  });
  it("keeps the exact text of a note, accents and punctuation included", () => {
    show();
    open();
    const fleur = items()[3]!;
    expect(fleur.querySelector("blockquote")!.textContent).toBe("Entrée par le côté — sonnez pour la rampe");
  });
  it("says how long each note is", () => {
    show();
    open();
    expect(within(items()[0]!).getByText(/16 characters \(short\)/)).toBeTruthy();
    expect(within(items()[1]!).getByText(/73 characters \(medium\)/)).toBeTruthy();
  });
  it("says when the same note is on several places, and lists them apart", () => {
    show();
    open();
    expect(within(items()[0]!).getByText(/The same note is on 2 places\./)).toBeTruthy();
    expect(screen.getByText("1 note appears on more than one place")).toBeTruthy();
    expect(screen.getByRole("region", { name: "1 note appears on more than one place" }).textContent).toContain("Alpha Cafe, Epsilon Bar");
  });
  it("shows a nameless place as UNKNOWN", () => {
    show({ places: [noted("a", "x", { name: null }), noted("b", "y")] });
    open();
    expect(titles()).toContain("Place with no name (UNKNOWN)");
  });
});

describe("searching", () => {
  it("marks the words found, in the note as written", () => {
    show();
    open();
    search("door");
    const marks = [...document.querySelectorAll("blockquote mark")].map((m) => m.textContent);
    expect(marks.length).toBeGreaterThanOrEqual(4);
    for (const m of marks) expect(m).toBe("door");
    for (const li of items()) expect(li.querySelector("blockquote mark")).not.toBeNull();
    expect(titles()).toEqual(["Alpha Cafe", "Beta Library", "Epsilon Bar", "Gamma Museum"]);
  });
  it("marks a word the way the note spells it when the search has no accent or capital", () => {
    show();
    open();
    search("entree");
    expect(document.querySelector("blockquote mark")!.textContent).toBe("Entrée");
  });
  it("reads a phrase in quotes and a word with a minus sign", () => {
    show();
    open();
    search('"at the door"');
    expect(titles()).toEqual(["Alpha Cafe", "Epsilon Bar"]);
    search("door -step");
    expect(titles()).toEqual(["Beta Library", "Gamma Museum"]);
  });
  it("says how many match and says plainly when none do, keeping the whole count", () => {
    show();
    open();
    search("door");
    expect(screen.getByRole("status").textContent).toBe("4 of 6 notes match your search and filters.");
    search("zzzz");
    expect(screen.getByRole("status").textContent).toBe("No note matches your search and filters.");
    expect(screen.queryByRole("list", { name: "Notes" })).toBeNull();
  });
  it("narrows by tag and by length", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Wheelchair tag: Yes" }));
    expect(titles()).toEqual(["Beta Library", "Gamma Museum"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Long (over 200 characters)" }));
    expect(titles()).toEqual(["Gamma Museum"]);
  });
  it("narrows to repeated notes", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Only notes that appear on more than one place" }));
    expect(titles()).toEqual(["Alpha Cafe", "Epsilon Bar"]);
  });
  it("offers the repeated-notes filter only when a note is repeated", () => {
    show({ places: [noted("a", "one"), noted("b", "two")] });
    open();
    expect(screen.queryByRole("checkbox", { name: "Only notes that appear on more than one place" })).toBeNull();
    expect(screen.queryByText(/appear on more than one place/)).toBeNull();
  });
  it("orders by longest, shortest and tag", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Longest note first" }));
    expect(titles()[0]).toBe("Gamma Museum");
    fireEvent.click(screen.getByRole("radio", { name: "Shortest note first" }));
    expect(titles().slice(0, 2)).toEqual(["Alpha Cafe", "Epsilon Bar"]);
    fireEvent.click(screen.getByRole("radio", { name: "By wheelchair tag" }));
    expect(titles()).toEqual(["Beta Library", "Gamma Museum", "Alpha Cafe", "Epsilon Bar", "Fleur d’Été", "Hotel Hall"]);
  });
});

describe("a long note", () => {
  it("is cut to a window with the rest on request, and the whole note comes back", () => {
    show();
    open();
    const gamma = () => items().find((li) => li.textContent!.includes("Gamma Museum"))!;
    const text = () => gamma().querySelector("blockquote")!.textContent!.replace(/ …$/, "");
    expect(LONG_NOTE.length).toBeGreaterThan(NOTE_WINDOW);
    expect(gamma().querySelector("blockquote")!.textContent).toMatch(/ …$/);
    expect(text().length).toBeLessThanOrEqual(NOTE_WINDOW + 2);
    const button = within(gamma()).getByRole("button", { name: "Show the whole note, Gamma Museum" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(gamma().querySelector("blockquote")!.textContent).toBe(LONG_NOTE);
    const less = within(gamma()).getByRole("button", { name: "Show less, Gamma Museum" });
    expect(less.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(less);
    expect(gamma().querySelector("blockquote")!.textContent).toMatch(/ …$/);
  });
  it("shows the part of a long note where the search matched", () => {
    show();
    open();
    search("washroom");
    const gamma = items().find((li) => li.textContent!.includes("Gamma Museum"))!;
    expect(gamma.querySelector("blockquote mark")!.textContent).toBe("Washroom");
    expect(gamma.querySelector("blockquote")!.textContent).toMatch(/^… /);
  });
  it("cuts a note of 241 characters but not one of exactly 240", () => {
    const exact = "a".repeat(NOTE_WINDOW - 4) + " end.";
    const over = "b".repeat(NOTE_WINDOW - 4) + " end!!";
    show({ places: [noted("a", exact.slice(0, NOTE_WINDOW)), noted("b", over.slice(0, NOTE_WINDOW + 1))] });
    open();
    const [first, second] = items();
    expect(within(first!).queryByRole("button")).toBeNull();
    expect(within(second!).getByRole("button", { name: /Show the whole note/ })).toBeTruthy();
  });
  it("has no show-more button on a short note", () => {
    show();
    open();
    expect(within(items()[0]!).queryByRole("button")).toBeNull();
  });
});

describe("saving", () => {
  it("saves what is shown as text and as CSV", () => {
    const saved: SavedFile[] = [];
    show({ onSave: (f) => (saved.push(f), true) });
    open();
    search("door");
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a spreadsheet (.csv)" }));
    expect(saved.map((f) => f.name)).toEqual(["pack-notes.txt", "pack-notes.csv"]);
    expect(saved[0]!.content).toContain("1. Alpha Cafe");
    expect(saved[0]!.content).not.toContain("Hotel Hall");
    const csv = parseCsv(saved[1]!.content);
    expect(csv.ok && csv.rows.length).toBe(5);
    expect(screen.getByText("Saved pack-notes.csv.")).toBeTruthy();
  });
  it("saves the whole long note even while it is cut on screen", () => {
    const saved: SavedFile[] = [];
    show({ onSave: (f) => (saved.push(f), true) });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    expect(saved[0]!.content).toContain(LONG_NOTE);
  });
  it("says so when the browser cannot save, including when saving throws", () => {
    show({ onSave: () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({ onSave: vi.fn(() => { throw new Error("blocked"); }) });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
  it("offers no save buttons when nothing matches", () => {
    show();
    open();
    search("zzzz");
    expect(screen.queryByRole("button", { name: /Save as/ })).toBeNull();
  });
  it("makes no network request and stores nothing", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    localStorage.clear();
    show();
    open();
    search("door");
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe("in French", () => {
  it("is French throughout, and the note itself is left as written", () => {
    show({ locale: "fr" });
    open("fr");
    expect(screen.getByText(plain("6 lieux sur 8 ont une note."))).toBeTruthy();
    expect(screen.getByRole("blockquote", { name: "Note, telle qu’écrite dans le pack, Alpha Cafe" }).textContent).toBe("Step at the door");
    expect(screen.getByRole("button", { name: "Enregistrer en texte (.txt)" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Note la plus longue d’abord" })).toBeTruthy();
  });
  it("never writes INCONNU", () => {
    const { container } = show({ locale: "fr" });
    open("fr");
    expect(container.textContent).not.toMatch(/inconnu/i);
    expect(container.textContent).toContain("UNKNOWN");
  });
});

describe("accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations closed, open, and with a search, in ${locale === "en" ? "English" : "French"}`, async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
      fireEvent.change(screen.getByLabelText(locale === "en" ? "Search the notes" : "Chercher dans les notes"), { target: { value: "door" } });
      expect((await axe.run(container, axeRules)).violations, "search").toEqual([]);
    });
  }
  it("gives every control a name", () => {
    show();
    open();
    for (const el of [...screen.getAllByRole("button"), ...screen.getAllByRole("checkbox"), ...screen.getAllByRole("radio"), ...screen.getAllByRole("textbox")]) {
      expect(((el.getAttribute("aria-label") ?? el.textContent ?? "").trim().length > 0) || (el as HTMLInputElement).labels?.length, el.outerHTML).toBeTruthy();
    }
  });
});
