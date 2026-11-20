/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackSearchWords, PackWordList, WORDS_SHOWN } from "./PackWords";
import { place } from "./placeFixtures";
import { searchPlaces } from "./packSearchFixtures";
import type { Locale } from "./stateCopy";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const exact = (text: string) => (_: string, el: Element | null) => el?.tagName === "P" && el.textContent === text;
const places = [...searchPlaces(), place("s1", { name: "Starbucks", category: "cafe", address: "1 Yonge Street" }), place("t1", { name: "Post Office Annex", category: "post_office", address: null })];
afterEach(cleanup);

describe("PackSearchWords", () => {
  const show = (text: string, locale: Locale = "en", onUse: (t: string) => void = () => undefined) => {
    document.documentElement.lang = locale;
    return render(<PackSearchWords places={places} text={text} locale={locale} onUse={onUse} />);
  };
  it("shows nothing when every word is found", () => {
    for (const q of ["", "cafe", "kind:cafe -zzzz", "tag:yes"]) {
      expect(show(q).container.innerHTML, q).toBe("");
      cleanup();
    }
  });
  it("names the word no place has and offers the words the pack has near it", () => {
    show("starbuks");
    expect(screen.getByText("Words that no place has")).toBeTruthy();
    expect(screen.getByText("No place has the word “starbuks” in its name, address or kind.")).toBeTruthy();
    expect(screen.getByText("Close in spelling: “starbucks” (1 place)")).toBeTruthy();
  });
  it("puts the changed search in the box when a word is pressed, with the rest as typed", () => {
    const onUse = vi.fn();
    show("tag:yes  starbuks", "en", onUse);
    fireEvent.click(screen.getByRole("button", { name: "Search for “starbucks”" }));
    expect(onUse).toHaveBeenCalledWith("tag:yes  starbucks");
  });
  it("says so when nothing in the pack is close", () => {
    show("xylophone");
    expect(screen.getByText("No word in the pack is close in spelling to it.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("offers a French kind, in French, with the typographic quotes", () => {
    show("pharmacie", "fr");
    expect(screen.getByText(exact("Aucun lieu n’a le mot «\u202fpharmacie\u202f» dans son nom, son adresse ou son genre."))).toBeTruthy();
    expect(screen.getByText(exact("Le pack nomme ce genre «\u202fpharmacy\u202f» (1 lieu)"))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chercher «\u202fpharmacy\u202f»" })).toBeTruthy();
  });
  it("shows what was typed exactly as typed in the sentence, French rules or not", () => {
    show("l'etoile", "fr");
    // The apostrophe stays as typed; the French typography never reaches it.
    expect(document.body.textContent).toContain("«\u202fl'etoile\u202f»");
    expect(document.body.textContent).not.toContain("l’etoile");
    expect(screen.getByRole("button", { name: "Chercher «\u202fetoile\u202f»" })).toBeTruthy();
  });
  it("lists up to three words, each with its own buttons", () => {
    show("starbuks qqqq wwww eeee");
    expect(screen.getAllByRole("listitem").filter((li) => li.textContent?.startsWith("No place has"))).toHaveLength(3);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
  it("is a polite live region carrying the page language, with no accessibility violations", async () => {
    const { container } = show("starbuks", "fr");
    const region = container.querySelector("[data-pack-search-words]")!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("lang")).toBe("fr");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});

describe("PackWordList", () => {
  const show = (locale: Locale = "en", onTry: (w: string) => void = () => undefined, onSave?: (f: { name: string; mime: string; content: string }) => boolean) => {
    document.documentElement.lang = locale;
    return render(<PackWordList places={places} locale={locale} onTry={onTry} onSave={onSave} />);
  };
  const toggle = (locale: Locale = "en") => screen.getByRole("button", { name: locale === "en" ? /^(Show|Hide) the words$/ : /^(Afficher|Masquer) les mots$/ });
  it("shows only its heading and a closed toggle at first", () => {
    show();
    expect(screen.getByText("Words in this pack")).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-pack-words-body]")).toBeNull();
  });
  it("shows nothing for no places", () => {
    expect(render(<PackWordList places={[]} locale="en" onTry={() => undefined} />).container.innerHTML).toBe("");
  });
  it("lists the words with their counts when opened, the most places first", () => {
    show();
    fireEvent.click(toggle());
    const first = within(screen.getByRole("list", { name: "Name, address or kind" })).getAllByRole("listitem")[0]!;
    expect(first.textContent).toBe("street (7)");
    expect(document.querySelector("[data-pack-words-count]")!.textContent).toMatch(/words/);
  });
  it("puts the word in the search box when pressed", () => {
    const onTry = vi.fn();
    show("en", onTry);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Search for “street”" }));
    expect(onTry).toHaveBeenCalledWith("street");
  });
  it("changes the part of the places looked at", () => {
    show();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByLabelText("Notes"));
    const list = screen.getByRole("list", { name: "Notes" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toContain("ramp (1)");
    expect(within(list).queryByText("street (7)")).toBeNull();
  });
  it("shows the first thirty words and then all of them on request", () => {
    const many = Array.from({ length: 50 }, (_, i) => place(`m${i}`, { name: `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))} thing`, address: null, category: null }));
    document.documentElement.lang = "en";
    render(<PackWordList places={many} locale="en" onTry={() => undefined} />);
    fireEvent.click(toggle());
    expect(within(screen.getByRole("list", { name: "Name, address or kind" })).getAllByRole("listitem")).toHaveLength(WORDS_SHOWN);
    expect(screen.getByText(/^30 of 51 words shown/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all 51 words" }));
    expect(within(screen.getByRole("list", { name: "Name, address or kind" })).getAllByRole("listitem")).toHaveLength(51);
    expect(screen.getByText("51 words, all shown.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show fewer words" }));
    expect(within(screen.getByRole("list", { name: "Name, address or kind" })).getAllByRole("listitem")).toHaveLength(WORDS_SHOWN);
  });
  it("goes back to thirty words when the part of the places changes", () => {
    const many = Array.from({ length: 40 }, (_, i) => place(`m${i}`, { name: `abc${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, address: null, category: null }));
    render(<PackWordList places={many} locale="en" onTry={() => undefined} />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Show all 40 words" }));
    fireEvent.click(screen.getByLabelText("Names"));
    expect(within(screen.getByRole("list", { name: "Names" })).getAllByRole("listitem")).toHaveLength(WORDS_SHOWN);
  });
  it("saves the words as text and as a table, and says so", () => {
    const onSave = vi.fn(() => true);
    show("en", () => undefined, onSave);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Save the words as text" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the words as a table (CSV)" }));
    expect(onSave).toHaveBeenCalledTimes(2);
    const [txt, csv] = onSave.mock.calls.map((c) => (c as unknown as [{ name: string; mime: string; content: string }])[0]);
    expect(txt!.name).toBe("pack-words.txt");
    expect(csv!.name).toBe("pack-words.csv");
    expect(csv!.content.startsWith("\uFEFFword,field,places")).toBe(true);
    expect(document.querySelector("[data-pack-words-status]")!.textContent).toBe("Saved pack-words.csv.");
  });
  it("says so when the browser cannot save, and when saving throws", () => {
    show("en", () => undefined, () => false);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Save the words as text" }));
    expect(document.querySelector("[data-pack-words-status]")!.textContent).toBe("This browser cannot save a file here.");
    cleanup();
    show("en", () => undefined, () => {
      throw new Error("no");
    });
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Save the words as text" }));
    expect(document.querySelector("[data-pack-words-status]")!.textContent).toBe("This browser cannot save a file here.");
  });
  it("works in French", () => {
    show("fr");
    fireEvent.click(toggle("fr"));
    expect(screen.getByText("Mots du pack")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer les mots en texte" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chercher «\u202fstreet\u202f»" })).toBeTruthy();
  });
  it("has no accessibility violations open, in either language", async () => {
    for (const l of ["en", "fr"] as const) {
      const { container } = show(l);
      fireEvent.click(toggle(l));
      expect((await axe.run(container, axeRules)).violations, l).toEqual([]);
      cleanup();
    }
  });
});
