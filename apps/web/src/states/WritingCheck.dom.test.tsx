/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { place } from "./placeFixtures";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";
import { WRITING_SHOWN, WritingCheck } from "./WritingCheck";
import { WR_CSV_NAME, WR_TEXT_NAME } from "./writingCopy";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const p = (id: string, name: string | null, address: string | null) => place(id, { name, address });
const set = () => [
  p("a", "CITY LIBRARY", "1 Main Street"),
  p("b", "Beta Cafe 416-555-0123", "2 Oak St, Toronto, ON"),
  p("c", "Gamma Hall", "3 Elm Street"),
  p("d", "Delta Hall", "4 Pine Street"),
  p("e", "Eps Hall", "5 Ash Street"),
  p("f", "Fine Place", "6 Birch Street"),
];

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof set>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<WritingCheck places={over.places ?? set()} locale={locale} onSave={over.onSave} />);
}
const toggle = (l: Locale = "en") => screen.getByRole("button", { name: l === "en" ? /^(Look at how names and addresses are written|Hide the wording check)$/ : /^(Examiner la rédaction des noms et des adresses|Masquer l’examen de la rédaction)$/ });
const open = (l: Locale = "en") => fireEvent.click(toggle(l));
const listNames = () => Array.from(document.querySelectorAll("[data-writing-list] > li > strong")).map((e) => e.textContent);

describe("WritingCheck closed", () => {
  it("shows nothing when no place has a name or an address", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [p("a", null, null)] }).container.innerHTML).toBe("");
  });
  it("shows for a place with only an address", () => {
    show({ places: [p("a", null, "1 Main Street")] });
    expect(toggle()).toBeTruthy();
  });
  it("starts closed, with the body hidden and no heading element", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-writing-body]")!.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("h1,h2,h3,h4,h5,h6")).toBeNull();
    expect(container.querySelector("ul")).toBeNull();
  });
  it("points the button at the panel and the section at its label", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-controls")).toBe(container.querySelector("[data-writing-body]")!.id);
    const section = container.querySelector("section")!;
    expect(document.getElementById(section.getAttribute("aria-labelledby")!)!.textContent).toBe("Wording of names and addresses");
  });
});

describe("WritingCheck open", () => {
  it("opens and closes with the button", () => {
    const { container } = show();
    open();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-writing-body]")!.hasAttribute("hidden")).toBe(false);
    open();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
  it("says how many places were read and how many stood out", () => {
    show();
    open();
    expect(screen.getByText("6 places have a name or an address to read.")).toBeTruthy();
    expect(screen.getByText("2 places have wording worth a look.")).toBeTruthy();
  });
  it("lists a place with the text as the pack gives it, and a sentence for each thing noticed", () => {
    show();
    open();
    expect(listNames()).toEqual(["Beta Cafe 416-555-0123", "CITY LIBRARY"]);
    expect(screen.getByText("The name is written in capital letters.")).toBeTruthy();
    expect(screen.getByText(/The name contains what looks like a phone number or web address/)).toBeTruthy();
    expect(screen.getByText("2 Oak St, Toronto, ON")).toBeTruthy();
  });
  it("shows the street type note on the minority address", () => {
    show();
    open();
    expect(screen.getByText(/This address uses “St”/)).toBeTruthy();
  });
  it("tallies by rule", () => {
    show();
    open();
    const tally = document.querySelector<HTMLElement>("[data-writing-tally]")!;
    expect(within(tally).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(within(tally).getByText("Name in capital letters: 1")).toBeTruthy();
  });
  it("says it is not a list of mistakes", () => {
    show();
    open();
    expect(screen.getByText(/Not a list of mistakes/)).toBeTruthy();
  });
  it("says nothing stood out, with no filters, when the writing is plain", () => {
    show({ places: [p("a", "Gamma Hall", "3 Elm Street"), p("b", "Delta Hall", "4 Pine Street")] });
    open();
    expect(screen.getByText("Nothing stood out in the wording.")).toBeTruthy();
    expect(screen.queryAllByRole("radio")).toEqual([]);
    expect(screen.queryByRole("button", { name: /Save as/ })).toBeNull();
  });
  it("says how many places have neither a name nor an address", () => {
    show({ places: [p("a", "CITY LIBRARY", "1 Main Street"), p("b", null, null)] });
    open();
    expect(screen.getByText("1 place has a name or an address to read; 1 has neither.")).toBeTruthy();
  });
  it("shows a place with only an address and says the name is missing", () => {
    show({ places: [p("a", null, "KING STREET WEST")] });
    open();
    expect(screen.getByText("Name not in the pack")).toBeTruthy();
  });
});

describe("WritingCheck filters and order", () => {
  it("filters to names or to addresses", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Addresses" }));
    expect(listNames()).toEqual(["Beta Cafe 416-555-0123"]);
    fireEvent.click(screen.getByRole("radio", { name: "Names" }));
    expect(listNames()).toEqual(["Beta Cafe 416-555-0123", "CITY LIBRARY"]);
  });
  it("offers a radio for each rule that was met and none for the others", () => {
    show();
    open();
    expect(screen.getByRole("radio", { name: "Name in capital letters" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Name in lower case" })).toBeNull();
  });
  it("filters to one rule", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Name in capital letters" }));
    expect(listNames()).toEqual(["CITY LIBRARY"]);
  });
  it("orders by name", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    expect(listNames()).toEqual(["Beta Cafe 416-555-0123", "CITY LIBRARY"]);
  });
  it("says so when a choice matches nothing", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Street type written two ways" }));
    fireEvent.click(screen.getByRole("radio", { name: "Names" }));
    expect(screen.queryByText("No place matches that choice.")).toBeNull();
  });
  it("keeps the choice when closed and opened again", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Addresses" }));
    open();
    open();
    expect(screen.getByRole("radio", { name: "Addresses" }).getAttribute("aria-checked") ?? (screen.getByRole("radio", { name: "Addresses" }) as HTMLInputElement).checked).toBeTruthy();
  });
});

describe("WritingCheck saving", () => {
  it("saves a text file with every finding and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    const file = onSave.mock.calls[0]![0] as SavedFile;
    expect(file.name).toBe(WR_TEXT_NAME.en);
    expect(file.content).toContain("CITY LIBRARY (a)");
    expect(screen.getByText(`Saved ${WR_TEXT_NAME.en}.`)).toBeTruthy();
  });
  it("saves a CSV file of what is listed, not of everything", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Names" }));
    fireEvent.click(screen.getByRole("radio", { name: "Name in capital letters" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    const file = onSave.mock.calls[0]![0] as SavedFile;
    expect(file.name).toBe(WR_CSV_NAME.en);
    expect(file.content).toContain("CITY LIBRARY");
    expect(file.content).not.toContain("Beta Cafe");
  });
  it("says when the browser cannot save", () => {
    show({ onSave: () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
  it("says the same when saving throws", () => {
    show({ onSave: () => { throw new Error("no"); } });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
});

describe("WritingCheck directions", () => {
  const dirs = () => [p("a", "Alpha Hall", "1 Queen Street W"), p("b", "Beta Hall", "2 King Street West"), p("c", "Gamma Hall", "3 Bay Street West"), p("d", "Delta Hall", "4 Yonge Street West")];
  it("points at the address that uses the less common direction form", () => {
    show({ places: dirs() });
    open();
    expect(listNames()).toEqual(["Alpha Hall"]);
    expect(screen.getByText(/This address ends with “W”/)).toBeTruthy();
    expect(screen.getByText("1 direction is written two ways in the list.")).toBeTruthy();
  });
  it("filters to it", () => {
    show({ places: [...dirs(), p("z", "ZED HALL", "9 Oak Avenue")] });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Direction written two ways" }));
    expect(listNames()).toEqual(["Alpha Hall"]);
  });
  it("saves it in the CSV", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ places: dirs(), onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(onSave.mock.calls[0]![0].content).toContain("direction-mix");
  });
  it("is in French", () => {
    show({ places: dirs(), locale: "fr" });
    open("fr");
    expect(screen.getByText(/Cette adresse se termine par/)).toBeTruthy();
  });
});

describe("WritingCheck apostrophes", () => {
  const aps = () => [p("a", "Joe's Hall", "1 Main Street"), p("b", "Mary\u2019s Hall", "2 Main Street"), p("c", "Ann\u2019s Hall", "3 Main Street"), p("d", "Sue\u2019s Hall", "4 Main Street")];
  it("points at the name that uses the less common apostrophe", () => {
    show({ places: aps() });
    open();
    expect(listNames()).toEqual(["Joe's Hall"]);
    expect(screen.getByText(/This name uses the straight form of the apostrophe/)).toBeTruthy();
    expect(screen.getByText("The apostrophe in names is written two ways in the list.")).toBeTruthy();
  });
  it("filters to it", () => {
    show({ places: [...aps(), p("z", "ZED HALL", "9 Oak Avenue")] });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Apostrophe written two ways" }));
    expect(listNames()).toEqual(["Joe's Hall"]);
  });
  it("is in French", () => {
    show({ places: aps(), locale: "fr" });
    open("fr");
    expect(screen.getByText(/Ce nom utilise la forme droite/)).toBeTruthy();
  });
});

describe("WritingCheck long lists", () => {
  const many = () => Array.from({ length: WRITING_SHOWN + 5 }, (_, i) => p(`x${i}`, `PLACE NUMBER ${String(i).padStart(2, "0")}`, `${i + 1} Main Street`));
  it("lists a limited number and says how many more there are", () => {
    show({ places: many() });
    open();
    expect(listNames()).toHaveLength(WRITING_SHOWN);
    expect(screen.getByText(/5 more/)).toBeTruthy();
  });
  it("still saves all of them", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ places: many(), onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect((onSave.mock.calls[0]![0] as SavedFile).content).toContain("PLACE NUMBER 24");
  });
});

describe("WritingCheck keyboard", () => {
  it("has no positive tabindex and nothing odd to tab to", () => {
    show();
    open();
    for (const e of document.querySelectorAll<HTMLElement>("[tabindex]")) expect(Number(e.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  });
  it("opens from the keyboard", () => {
    show();
    toggle().focus();
    fireEvent.click(document.activeElement!);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });
});

for (const locale of ["en", "fr"] as const) {
  describe(`WritingCheck in ${locale}`, () => {
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
      if (locale === "fr") for (const el of container.querySelectorAll<HTMLElement>("section p, button, label, li li, small")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    });
  });
}

describe("WritingCheck in French", () => {
  it("reads in French", () => {
    show({ locale: "fr" });
    open("fr");
    expect(screen.getByText("Le nom est écrit en majuscules.")).toBeTruthy();
    expect(screen.getByText("2 lieux ont une rédaction à examiner.")).toBeTruthy();
  });
  it("saves a file with a French name", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ locale: "fr", onSave });
    open("fr");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer en fichier CSV" }));
    expect((onSave.mock.calls[0]![0] as SavedFile).name).toBe(WR_CSV_NAME.fr);
    expect(screen.getByText(`Fichier ${WR_CSV_NAME.fr} enregistré.`)).toBeTruthy();
  });
});
