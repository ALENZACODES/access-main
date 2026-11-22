/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { NAME_KINDS_SHOWN, NAME_LANGUAGES_SHOWN, NameLanguages } from "./NameLanguages";
import { NL_CSV_NAME, NL_TEXT_NAME } from "./nameLanguageCopy";
import { place } from "./placeFixtures";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const p = (id: string, name: string | null, category = "library") => place(id, { name, category });
const set = () => [
  p("a", "Bibliothèque municipale"),
  p("b", "Public Library"),
  p("c", "Tim Hortons", "cafe"),
  p("d", "Bibliothèque / Library"),
  p("e", "Café Zoé", "cafe"),
  p("f", "北京图书馆"),
  p("g", null),
  p("h", "Parc des Lilas", "park"),
];

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof set>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<NameLanguages places={over.places ?? set()} locale={locale} onSave={over.onSave} />);
}
const toggle = (l: Locale = "en") => screen.getByRole("button", { name: l === "en" ? /^(Look at|Hide) the language of the names$/ : /^(Examiner|Masquer) la langue des noms$/ });
const open = (l: Locale = "en") => fireEvent.click(toggle(l));
const listNames = () => Array.from(document.querySelectorAll("[data-name-languages-list] > li > strong")).map((e) => e.textContent);

describe("NameLanguages closed", () => {
  it("shows nothing when no place has a name", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [p("a", null)] }).container.innerHTML).toBe("");
  });
  it("starts closed, with the body hidden and no heading element", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-name-languages-body]")!.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("h1,h2,h3,h4,h5,h6")).toBeNull();
    expect(container.querySelector("ul")).toBeNull();
  });
  it("points the button at the panel and the section at its label", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-controls")).toBe(container.querySelector("[data-name-languages-body]")!.id);
    const section = container.querySelector("section")!;
    expect(document.getElementById(section.getAttribute("aria-labelledby")!)!.textContent).toBe("Language of the names");
  });
});

describe("NameLanguages open", () => {
  it("opens and closes with the button", () => {
    const { container } = show();
    open();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-name-languages-body]")!.hasAttribute("hidden")).toBe(false);
    open();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
  it("says it is a guess", () => {
    show();
    open();
    expect(screen.getByText(/It is a guess from common words/)).toBeTruthy();
    expect(screen.getByText(/A guess from common words, not a statement/)).toBeTruthy();
  });
  it("says how many places have a name", () => {
    show();
    open();
    expect(screen.getByText("7 places have a name to read; 1 has none.")).toBeTruthy();
  });
  it("summarises the counts", () => {
    show();
    open();
    expect(screen.getByText("2 names have words that point to French, 1 to English and 1 to both.")).toBeTruthy();
  });
  it("tallies each reading that is present, with a share", () => {
    show();
    open();
    const tally = document.querySelector<HTMLElement>("[data-name-languages-tally]")!;
    const items = within(tally).getAllByRole("listitem").map((i) => i.textContent);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatch(/^Words that point to French: 2 \(\d+%\) Most often: library \(1\), park \(1\)\.$/);
    expect(items.some((t) => t!.startsWith("Written in another alphabet: 1"))).toBe(true);
  });
  it("lists the named places as the pack gives them, with the words that were found", () => {
    show();
    open();
    expect(listNames()).toEqual(["Bibliothèque municipale", "Public Library", "Tim Hortons", "Bibliothèque / Library", "Café Zoé", "北京图书馆", "Parc des Lilas"]);
    expect(screen.getByText("French: “bibliotheque”, “municipale”.")).toBeTruthy();
    expect(screen.getByText(/a pair: English: “library”/)).toBeTruthy();
  });
  it("says what it found about a name with no words", () => {
    show();
    open();
    expect(screen.getAllByText("No words that point to a language").length).toBeGreaterThanOrEqual(2);
  });
  it("mentions accented names with no word, and pairs", () => {
    show();
    open();
    expect(screen.getByText("1 name has a French accent but no word that points to a language.")).toBeTruthy();
    expect(screen.getByText(/1 name gives a French half and an English half/)).toBeTruthy();
  });
  it("leaves out the accent and pair lines when there are none", () => {
    show({ places: [p("a", "Public Library"), p("b", "Tim Hortons")] });
    open();
    expect(screen.queryByText(/has a French accent but/)).toBeNull();
    expect(screen.queryByText(/give a French half|gives a French half/)).toBeNull();
  });
});

describe("NameLanguages filters and order", () => {
  it("filters to a reading", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Words that point to French" }));
    expect(listNames()).toEqual(["Bibliothèque municipale", "Parc des Lilas"]);
    fireEvent.click(screen.getByRole("radio", { name: "Words from both languages" }));
    expect(listNames()).toEqual(["Bibliothèque / Library"]);
  });
  it("filters to pairs and to accented names", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "A French half and an English half" }));
    expect(listNames()).toEqual(["Bibliothèque / Library"]);
    fireEvent.click(screen.getByRole("radio", { name: "A French accent and no word that points to a language" }));
    expect(listNames()).toEqual(["Café Zoé"]);
  });
  it("says so when a choice matches nothing", () => {
    show({ places: [p("a", "Public Library"), p("b", "Public Park")] });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Words that point to French" }));
    expect(screen.getByText("No place matches that choice.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save as/ })).toBeNull();
  });
  it("orders by name", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    expect(listNames()[0]).toBe("Bibliothèque / Library");
    expect(listNames().at(-1)).toBe("北京图书馆");
  });
  it("orders by what the words point to", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "By what the words point to" }));
    expect(listNames().slice(0, 3)).toEqual(["Bibliothèque municipale", "Parc des Lilas", "Public Library"]);
  });
});

describe("NameLanguages name and address", () => {
  const mixed = () => [p("a", "Bibliothèque municipale"), p("b", "Public Library"), p("c", "Tim Hortons", "cafe")];
  it("says how many places have a name and an address that point to different languages", () => {
    show({ places: mixed() });
    open();
    expect(screen.getByText("1 place has a name and an address that point to different languages.")).toBeTruthy();
  });
  it("filters to them", () => {
    show({ places: mixed() });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Name and address point to different languages" }));
    expect(listNames()).toEqual(["Bibliothèque municipale"]);
  });
  it("leaves the line out when none differ", () => {
    show({ places: [p("b", "Public Library")] });
    open();
    expect(screen.queryByText(/point to different languages\.$/)).toBeNull();
  });
  it("saves the comparison in the CSV", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ places: mixed(), onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(onSave.mock.calls[0]![0].content).toContain("english,differs");
  });
});

describe("NameLanguages address line", () => {
  it("shows each address with what its street words point to", () => {
    show({ places: [p("a", "Public Library"), place("b", { name: "Bibliothèque", address: "3 Rue Principale", category: "library" })] });
    open();
    const lines = Array.from(document.querySelectorAll("[data-name-languages-address]")).map((e) => e.textContent);
    expect(lines).toEqual(["1 Main Street \u2014 Street words that point to English", "3 Rue Principale \u2014 Street words that point to French"]);
  });
  it("says when a place has no address", () => {
    show({ places: [place("a", { name: "Public Library", address: null })] });
    open();
    expect(screen.getByText("No address in the pack")).toBeTruthy();
  });
});

describe("NameLanguages kinds table", () => {
  const table = () => document.querySelector<HTMLElement>("[data-name-languages-kinds]")!;
  it("has a caption, column headers and a header cell for each kind", () => {
    show();
    open();
    expect(within(table()).getByText("Kinds of place and what their names point to")).toBeTruthy();
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Kind", "Named places", "French", "English", "Both", "Neither", "Other alphabet", "Name and address differ"]);
    expect(within(table()).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["library", "cafe", "park"]);
  });
  it("counts each kind", () => {
    show();
    open();
    const row = within(table()).getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["4", "1", "1", "1", "0", "1", "1"]);
  });
  it("shows a limited number of kinds and says how many more are in the file", () => {
    const places = Array.from({ length: NAME_KINDS_SHOWN + 3 }, (_, i) => p(`k${i}`, `Public Library ${i}`, `kind${String(i).padStart(2, "0")}`));
    show({ places });
    open();
    expect(within(table()).getAllByRole("rowheader")).toHaveLength(NAME_KINDS_SHOWN);
    expect(screen.getByText("3 more kinds are in the saved file.")).toBeTruthy();
  });
  it("saves every kind in its own CSV file", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    const places = Array.from({ length: NAME_KINDS_SHOWN + 3 }, (_, i) => p(`k${i}`, `Public Library ${i}`, `kind${String(i).padStart(2, "0")}`));
    show({ places, onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save the kinds as a CSV file" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("language-of-names-by-kind.csv");
    expect(file.content).toContain("kind10");
    expect(screen.getByText("Saved language-of-names-by-kind.csv.")).toBeTruthy();
  });
  it("is in French", () => {
    show({ locale: "fr" });
    open("fr");
    expect(within(table()).getByText("Genres de lieu et ce qu’évoquent leurs noms")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer les genres en fichier CSV" })).toBeTruthy();
  });
});

describe("NameLanguages saving", () => {
  it("saves a text file and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe(NL_TEXT_NAME.en);
    expect(file.content).toContain("Bibliothèque municipale (a)");
    expect(screen.getByText(`Saved ${NL_TEXT_NAME.en}.`)).toBeTruthy();
  });
  it("saves what is listed in the CSV", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Words that point to English" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe(NL_CSV_NAME.en);
    expect(file.content).toContain("Public Library");
    expect(file.content).not.toContain("Tim Hortons");
  });
  it("says when the browser cannot save, and when saving throws", () => {
    show({ onSave: () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({ onSave: () => { throw new Error("no"); } });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
});

describe("NameLanguages long lists", () => {
  const many = () => Array.from({ length: NAME_LANGUAGES_SHOWN + 5 }, (_, i) => p(`x${i}`, `Rue Numéro ${String(i).padStart(2, "0")}`));
  it("lists a limited number and says how many more there are", () => {
    show({ places: many() });
    open();
    expect(listNames()).toHaveLength(NAME_LANGUAGES_SHOWN);
    expect(screen.getByText("5 more places are in the saved files.")).toBeTruthy();
  });
  it("still saves all of them", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ places: many(), onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(onSave.mock.calls[0]![0].content).toContain("Rue Numéro 24");
  });
});

for (const locale of ["en", "fr"] as const) {
  describe(`NameLanguages in ${locale}`, () => {
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
      if (locale === "fr") for (const el of container.querySelectorAll<HTMLElement>("section p, button, label, small, [data-name-languages-tally] li")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    });
    it("has no positive tabindex", () => {
      show({ locale });
      open(locale);
      for (const e of document.querySelectorAll<HTMLElement>("[tabindex]")) expect(Number(e.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
    });
  });
}

describe("NameLanguages in French", () => {
  it("reads in French", () => {
    show({ locale: "fr" });
    open("fr");
    expect(screen.getByText(/Chaque nom est examiné/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Mots qui évoquent le français" })).toBeTruthy();
  });
  it("saves a file with a French name", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ locale: "fr", onSave });
    open("fr");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer en fichier CSV" }));
    expect(onSave.mock.calls[0]![0].name).toBe(NL_CSV_NAME.fr);
    expect(screen.getByText(`Fichier ${NL_CSV_NAME.fr} enregistré.`)).toBeTruthy();
  });
});
