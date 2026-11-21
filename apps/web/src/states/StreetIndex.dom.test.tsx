/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { bare, place, varied } from "./placeFixtures";
import { StreetIndex } from "./StreetIndex";
import { lintFrench } from "./typography";

afterEach(cleanup);
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const at = (id: string, address: string | null, over: Record<string, unknown> = {}) => place(id, { name: `Place ${id}`, address, ...over });
const list = [at("a", "279 Yonge St"), at("b", "281 Yonge Street", { wheelchair: null }), at("c", "20 Dundas Square", { wheelchair: "no" }), at("f", "PO Box 9"), bare("h")];
const open = (locale: "en" | "fr" = "en") => fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show these places by street" : "Afficher ces lieux par rue" }));
const streetButtons = () => screen.getAllByRole("button", { name: /^(Yonge Street|Dundas Square)$/ });

describe("StreetIndex", () => {
  it("renders nothing for no places", () => {
    expect(render(<StreetIndex places={[]} locale="en" />).container.innerHTML).toBe("");
  });
  it("starts closed, with no table", () => {
    render(<StreetIndex places={list} locale="en" />);
    expect(screen.getByRole("button", { name: "Show these places by street" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("points the toggle at its panel and flips its label", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    const b = screen.getByRole("button", { name: "Hide places by street" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-controls")!)).toBeTruthy();
  });
  it("shows the summary and the caveat when opened", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    expect(screen.getByText("3 of 5 places have an address that reads as one street, on 2 streets.")).toBeTruthy();
    expect(screen.getByText(/does not tell you which side of the street/)).toBeTruthy();
  });
  it("lists the streets in a captioned table with counts, most places first by default", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    const table = screen.getByRole("table", { name: /Streets with the number of listed places/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent))).toEqual([["2", "1"], ["1", "0"]]);
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Yonge Street", "Dundas Square"]);
  });
  it("changes the order", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Street name" }));
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Dundas Square", "Yonge Street"]);
  });
  it("can show only streets with two or more places", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Only streets with two or more places" }));
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Yonge Street"]);
  });
  it("says so when no street has two or more places", () => {
    render(<StreetIndex places={[at("a", "1 A St"), at("b", "1 B St")]} locale="en" />);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Only streets with two or more places" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No street has two or more listed places.")).toBeTruthy();
  });
  it("finds a street by what is typed, and says so when none matches", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.change(screen.getByLabelText("Find a street"), { target: { value: "dundas" } });
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Dundas Square"]);
    fireEvent.change(screen.getByLabelText("Find a street"), { target: { value: "zzz" } });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No street matches what you typed.")).toBeTruthy();
  });
  it("matches a short street type typed in the search", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.change(screen.getByLabelText("Find a street"), { target: { value: "yonge st" } });
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Yonge Street"]);
  });
  it("combines the search with the two-or-more filter", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.change(screen.getByLabelText("Find a street"), { target: { value: "dundas" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Only streets with two or more places" }));
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("drops the places shown when the search removes that street", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(streetButtons()[0]!);
    fireEvent.change(screen.getByLabelText("Find a street"), { target: { value: "dundas" } });
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
  it("labels the search in French", () => {
    render(<StreetIndex places={list} locale="fr" />);
    open("fr");
    fireEvent.change(screen.getByLabelText("Trouver une rue"), { target: { value: "zzz" } });
    expect(screen.getByText("Aucune rue ne correspond à ce que vous avez saisi.")).toBeTruthy();
  });
  it("shows the places on a street when its button is pressed, by house number", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(streetButtons()[0]!);
    expect(streetButtons()[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 3, name: "Yonge Street: 2 places, 1 with the wheelchair tag UNKNOWN" })).toBeTruthy();
    const detail = screen.getByRole("table", { name: "Listed places on Yonge Street, by house number" });
    expect(within(detail).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Place a", "Place b"]);
    expect(within(detail).getAllByRole("cell").map((c) => c.textContent)).toContain("279 Yonge St");
  });
  it("hides the places again when the same button is pressed", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(streetButtons()[0]!);
    fireEvent.click(streetButtons()[0]!);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(streetButtons()[0]!.getAttribute("aria-pressed")).toBe("false");
  });
  it("switches from one street to another", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(streetButtons()[0]!);
    fireEvent.click(streetButtons()[1]!);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Dundas Square: 1 place");
  });
  it("drops the places shown when the filter removes that street", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(streetButtons()[1]!);
    fireEvent.click(screen.getByRole("checkbox", { name: "Only streets with two or more places" }));
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
  it("keeps the street shown when the order changes", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(streetButtons()[0]!);
    fireEvent.click(screen.getByRole("radio", { name: "Street name" }));
    expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("Yonge Street");
  });
  it("writes UNKNOWN for a missing name or number", () => {
    render(<StreetIndex places={[at("a", "Main Street", { name: null })]} locale="en" />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Main Street" }));
    const detail = screen.getByRole("table", { name: /Listed places on Main Street/ });
    expect(within(detail).getByRole("rowheader").textContent).toBe("UNKNOWN");
    expect(within(detail).getAllByRole("cell")[0]!.textContent).toBe("UNKNOWN");
  });
  it("saves all streets as text and as CSV, and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<StreetIndex places={list} locale="en" onSave={onSave} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save all streets as text (.txt)" }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({ name: "places-by-street.txt" });
    expect(onSave.mock.calls[0]![0].content).toContain("Dundas Square:");
    expect(document.querySelector("[data-street-index-status]")?.textContent).toBe("Saved places-by-street.txt.");
    fireEvent.click(screen.getByRole("button", { name: "Save all streets as a spreadsheet (CSV)" }));
    expect(onSave.mock.calls[1]![0].name).toBe("places-by-street.csv");
    expect(onSave.mock.calls[1]![0].content.charCodeAt(0)).toBe(0xfeff);
  });
  it("saves only the street that is shown", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<StreetIndex places={list} locale="en" onSave={onSave} />);
    open();
    fireEvent.click(streetButtons()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save this street as text (.txt)" }));
    const text = onSave.mock.calls[0]![0].content;
    expect(text).toContain("Yonge Street:");
    expect(text).not.toContain("Dundas Square:");
  });
  it("says so when saving fails or throws", () => {
    for (const onSave of [() => false, () => { throw new Error("x"); }]) {
      const { unmount } = render(<StreetIndex places={list} locale="en" onSave={onSave} />);
      open();
      fireEvent.click(screen.getByRole("button", { name: /spreadsheet/ }));
      expect(document.querySelector("[data-street-index-status]")?.textContent).toBe("This browser cannot save a file here.");
      unmount();
    }
  });
  it("updates when the places change while open", () => {
    const { rerender } = render(<StreetIndex places={list} locale="en" />);
    open();
    rerender(<StreetIndex places={[at("z", "5 Elm Ave")]} locale="en" />);
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Elm Avenue"]);
  });
  it("is French with French names, typography and the token UNKNOWN", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    const { container } = render(<StreetIndex places={list} locale="fr" onSave={onSave} />);
    open("fr");
    expect(screen.getByRole("table", { name: /Rues avec le nombre de lieux/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Nom de la rue" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer toutes les rues comme texte (.txt)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("lieux-par-rue.txt");
    expect(document.querySelector("[data-street-index-status]")?.textContent).toBe("Fichier lieux-par-rue.txt enregistré.");
    expect(container.textContent).not.toMatch(/INCONN/i);
    for (const p of container.querySelectorAll("p")) expect(lintFrench(p.textContent ?? ""), p.textContent ?? "").toEqual([]);
  });
  it("has no add button when the page gives no way to add", () => {
    render(<StreetIndex places={list} locale="en" />);
    open();
    fireEvent.click(streetButtons()[0]!);
    expect(screen.queryByRole("button", { name: /to my list/ })).toBeNull();
  });
  it("adds every place on the street shown and says what happened", () => {
    const onAdd = vi.fn<(id: string) => "added" | "already" | "full" | "invalid">((id) => (id === "b" ? "already" : "added"));
    render(<StreetIndex places={list} locale="en" onAdd={onAdd} />);
    open();
    fireEvent.click(streetButtons()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Add the 2 places on this street to my list" }));
    expect(onAdd.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    expect(document.querySelector("[data-street-index-add]")?.textContent).toBe("Yonge Street: 1 place added, 1 already on the list.");
  });
  it("uses the singular for a street with one place", () => {
    render(<StreetIndex places={list} locale="en" onAdd={() => "added"} />);
    open();
    fireEvent.click(streetButtons()[1]!);
    expect(screen.getByRole("button", { name: "Add the 1 place on this street to my list" })).toBeTruthy();
  });
  it("clears the sentence when another street is chosen", () => {
    render(<StreetIndex places={list} locale="en" onAdd={() => "added"} />);
    open();
    fireEvent.click(streetButtons()[0]!);
    fireEvent.click(screen.getByRole("button", { name: /to my list/ }));
    fireEvent.click(streetButtons()[1]!);
    expect(document.querySelector("[data-street-index-add]")?.textContent).toBe("");
  });
  it("adds only the places of the street, never the others", () => {
    const seen: string[] = [];
    render(<StreetIndex places={list} locale="en" onAdd={(id) => (seen.push(id), "added")} />);
    open();
    fireEvent.click(streetButtons()[1]!);
    fireEvent.click(screen.getByRole("button", { name: /to my list/ }));
    expect(seen).toEqual(["c"]);
  });
  it("says a full list kept some out, in French", () => {
    render(<StreetIndex places={list} locale="fr" onAdd={() => "full"} />);
    open("fr");
    fireEvent.click(screen.getAllByRole("button", { name: /^(Yonge Street|Dundas Square)$/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à ma liste les 2 lieux de cette rue" }));
    expect(document.querySelector("[data-street-index-add]")?.textContent).toBe("Yonge Street\u00a0: 2 non ajoutés parce que la liste est pleine.");
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations closed, open and with a street shown, in ${locale === "en" ? "English" : "French"}`, async () => {
      const { container } = render(<StreetIndex places={varied(4, 12)} locale={locale} />);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      fireEvent.click(container.querySelector<HTMLElement>("tbody th button")!);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
});
