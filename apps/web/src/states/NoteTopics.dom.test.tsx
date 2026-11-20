/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteTopics } from "./NoteTopics";
import { topicSet, withNote } from "./noteTopicFixtures";
import { parseCsv } from "./csvParse";
import type { SavedFile } from "./downloadFile";
import type { Locale } from "./stateCopy";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const NBSP = "\u00a0";
const plain = (s: string): string => s.split(NBSP).join(" ");

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof topicSet>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<NoteTopics places={over.places ?? topicSet()} locale={locale} onSave={over.onSave} />);
}
const open = (locale: Locale = "en") => fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show the words in the notes" : "Afficher les mots des notes" }));
const items = () => within(screen.getByRole("list", { name: "Notes" })).getAllByRole("listitem");
const titles = () => items().map((li) => li.querySelector("strong")!.textContent);
const choose = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name }));

describe("when it shows", () => {
  it("shows nothing for no places, or when no place has a note", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [withNote("a", null), withNote("b", "")] }).container.innerHTML).toBe("");
  });
  it("is closed to begin with and says it is collapsed", () => {
    show();
    expect(screen.getByRole("button", { name: "Show the words in the notes" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Notes" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("opens and closes with the same button", () => {
    show();
    open();
    expect(screen.getByRole("button", { name: "Hide the words in the notes" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide the words in the notes" }));
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("what it says", () => {
  it("says that a note only uses a word, and counts the notes", () => {
    show();
    open();
    expect(screen.getByText(/only shows that a note uses a word/)).toBeTruthy();
    expect(screen.getByText("At least one of these words appears in 7 of 8 notes.")).toBeTruthy();
    expect(screen.getByText("None of them appears in 1 note.")).toBeTruthy();
  });
  it("shows a table of places by word and tag, with headers for every row and column", () => {
    show();
    open();
    const table = screen.getByRole("table", { name: "Places by word and wheelchair tag" });
    const heads = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Word group", "Places", "Yes", "Limited", "No", "Designated", "UNKNOWN"]);
    const steps = within(table).getByRole("row", { name: /Steps and stairs/ });
    expect(within(steps).getAllByRole("cell").map((c) => c.textContent)).toEqual(["3", "0", "1", "1", "1", "0"]);
    expect(within(table).queryByRole("rowheader", { name: "Seating and tables" })).toBeNull();
  });
  it("lists the words that are used together", () => {
    show();
    open();
    expect(screen.getByText("Steps and stairs and Doors and entrances: 2 notes")).toBeTruthy();
    expect(screen.getByText("Words used together in the same note")).toBeTruthy();
  });
  it("lists each note with the words it uses, and the note exactly as written", () => {
    show();
    open();
    expect(titles()).toEqual(["Alpha Cafe", "Beta Library", "Epsilon Shop", "Fleur d’Été", "Gamma Museum", "Hotel Hall", "Iota Grill", "Place with no name (UNKNOWN)"]);
    const beta = items()[1]!;
    expect(beta.textContent).toContain("Wheelchair tag: Limited");
    expect(beta.textContent).toContain("Words used: Steps and stairs; Ramps and slopes; Doors and entrances");
    expect(beta.querySelector("blockquote")!.textContent).toBe("Two steps at the front door; no ramp.");
    expect(within(beta).getByRole("blockquote", { name: "Note, as written in the pack, Beta Library" })).toBeTruthy();
  });
  it("marks the topic words inside the note and changes none of its text", () => {
    show();
    open();
    for (const li of items()) {
      const original = withNoteText(li.querySelector("strong")!.textContent!);
      if (original !== null) expect(li.querySelector("blockquote")!.textContent).toBe(original);
    }
    expect([...items()[0]!.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["Ramp", "entrance", "Ring", "bell", "staff", "help"]);
  });
  it("says where a word only comes right after no, not or without", () => {
    show();
    open();
    expect(items()[1]!.textContent).toContain("Only right after “no”, “not” or “without”: Ramps and slopes");
    expect(items()[0]!.textContent).not.toContain("Only right after");
  });
  it("says a note has none of the words when it has none", () => {
    show();
    open();
    expect(items()[2]!.textContent).toContain("None of the listed words.");
    expect(items()[2]!.querySelector("mark")).toBeNull();
  });
  it("shows a nameless place as UNKNOWN and a missing tag as UNKNOWN", () => {
    show();
    open();
    const last = items()[7]!;
    expect(last.textContent).toContain("Place with no name (UNKNOWN)");
    expect(last.textContent).toContain("Wheelchair tag: UNKNOWN");
  });
});

function withNoteText(name: string): string | null {
  return topicSet().find((p) => p.name === name)?.note ?? null;
}

describe("choosing words", () => {
  it("narrows to the notes that use a word and says how many", () => {
    show();
    open();
    choose("Ramps and slopes (2 places)");
    expect(titles()).toEqual(["Alpha Cafe", "Beta Library"]);
    expect(screen.getByRole("status").textContent).toBe("Showing 2 of 8 notes.");
  });
  it("offers the any / all choice only once two words are chosen", () => {
    show();
    open();
    expect(screen.queryByRole("radio", { name: "Notes that use all of the chosen words" })).toBeNull();
    choose("Doors and entrances (4 places)");
    expect(screen.queryByRole("radio", { name: "Notes that use all of the chosen words" })).toBeNull();
    choose("Staff and help (2 places)");
    expect(titles()).toEqual(["Alpha Cafe", "Beta Library", "Fleur d’Été", "Hotel Hall"]);
    fireEvent.click(screen.getByRole("radio", { name: "Notes that use all of the chosen words" }));
    expect(titles()).toEqual(["Alpha Cafe", "Fleur d’Été"]);
  });
  it("narrows by wheelchair tag", () => {
    show();
    open();
    choose("Wheelchair tag: Yes");
    expect(titles()).toEqual(["Alpha Cafe", "Hotel Hall", "Iota Grill"]);
    choose("Wheelchair tag: UNKNOWN");
    expect(titles()).toEqual(["Alpha Cafe", "Epsilon Shop", "Hotel Hall", "Iota Grill", "Place with no name (UNKNOWN)"]);
  });
  it("can skip notes that only use a word after no, not or without", () => {
    show();
    open();
    choose("Steps and stairs (3 places)");
    expect(titles()).toEqual(["Beta Library", "Fleur d’Été", "Gamma Museum"]);
    choose("Skip notes that only use the word right after “no”, “not” or “without”");
    expect(titles()).toEqual(["Beta Library", "Gamma Museum"]);
  });
  it("offers the skip choice only when some note has a word right after no", () => {
    show({ places: [withNote("a", "Ramp at the door"), withNote("b", "Parking behind")] });
    open();
    expect(screen.queryByRole("checkbox", { name: /Skip notes/ })).toBeNull();
  });
  it("says plainly when nothing matches, keeping the controls", () => {
    show();
    open();
    choose("Ramps and slopes (2 places)");
    choose("Wheelchair tag: No");
    expect(screen.getByRole("status").textContent).toBe("No note matches the words and tags chosen.");
    expect(screen.queryByRole("list", { name: "Notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save as text (.txt)" })).not.toBeNull();
  });
  it("orders by the most different words and by tag", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Most different words first" }));
    expect(titles()[0]).toBe("Hotel Hall");
    fireEvent.click(screen.getByRole("radio", { name: "By wheelchair tag" }));
    expect(titles().slice(0, 3)).toEqual(["Alpha Cafe", "Hotel Hall", "Iota Grill"]);
  });
  it("lists only words some note uses", () => {
    show();
    open();
    expect(screen.queryByRole("checkbox", { name: /Seating and tables/ })).toBeNull();
    expect(screen.getAllByRole("checkbox", { name: /places?\)$/ })).toHaveLength(10);
  });
});

describe("saving", () => {
  it("saves what is shown as text and as CSV, and the whole-pack table", () => {
    const saved: SavedFile[] = [];
    show({ onSave: (f) => (saved.push(f), true) });
    open();
    choose("Doors and entrances (4 places)");
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the notes as a spreadsheet (.csv)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the word table as a spreadsheet (.csv)" }));
    expect(saved.map((f) => f.name)).toEqual(["pack-note-words.txt", "pack-note-words.csv", "pack-note-words-table.csv"]);
    expect(saved[0]!.content).toContain("1. Alpha Cafe");
    expect(saved[0]!.content).not.toContain("Gamma Museum");
    const notes = parseCsv(saved[1]!.content);
    expect(notes.ok && notes.rows.length).toBe(5);
    const table = parseCsv(saved[2]!.content);
    expect(table.ok && table.rows.length).toBe(12);
    expect(screen.getByText("Saved pack-note-words-table.csv.")).toBeTruthy();
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
  it("makes no network request and stores nothing", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    localStorage.clear();
    show();
    open();
    choose("Doors and entrances (4 places)");
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe("in French", () => {
  it("is French throughout, and the notes themselves are left as written", () => {
    show({ locale: "fr" });
    open("fr");
    expect(screen.getByRole("table", { name: plain("Lieux par mot et par indication pour fauteuil roulant") })).toBeTruthy();
    expect(screen.getByRole("blockquote", { name: "Note, telle qu’écrite dans le pack, Alpha Cafe" }).textContent).toBe("Ramp at the side entrance. Ring the bell for staff to help.");
    expect(screen.getByRole("button", { name: "Enregistrer en texte (.txt)" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Par nom de lieu" })).toBeTruthy();
    expect(plain(document.body.textContent!)).toContain("7 notes sur 8 emploient au moins un de ces mots");
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
    it(`has no axe violations closed, open, and with a word chosen, in ${locale === "en" ? "English" : "French"}`, async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
      fireEvent.click(screen.getAllByRole("checkbox")[0]!);
      expect((await axe.run(container, axeRules)).violations, "chosen").toEqual([]);
    });
  }
  it("gives every control a name", () => {
    show();
    open();
    for (const el of [...screen.getAllByRole("button"), ...screen.getAllByRole("checkbox"), ...screen.getAllByRole("radio")]) {
      expect(((el.getAttribute("aria-label") ?? el.textContent ?? "").trim().length > 0) || (el as HTMLInputElement).labels?.length, el.outerHTML).toBeTruthy();
    }
  });
});
