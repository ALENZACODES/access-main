/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces";
import type { Locale } from "./stateCopy";

const shipped = (JSON.parse(contentText) as { places: unknown[] }).places;
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, category: string, address: string) => ({ id, name, wheelchair, category, address, lat: 43.65, lon: -79.38, provenance: prov });
const data = [
  rec("a", "Alpha Cafe", "yes", "cafe", "1 Main Street"),
  rec("b", "Beta Bar", "limited", "bar", "2 Main Street"),
  rec("c", "Gamma Cafe", "no", "cafe", "10 Dundas Street East"),
  rec("d", "Delta Pharmacy", "yes", "pharmacy", "4 Queen Street"),
];

afterEach(cleanup);
function show(places: unknown = data, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(<MemoryRouter><PackPlaces places={places} locale={locale} today="2026-11-15" /></MemoryRouter>);
}
const names = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent).sort();
const box = () => screen.getByLabelText("Search by name, address or kind") as HTMLInputElement;
const CODE = "View code (select to copy)";
const openPanel = () => fireEvent.click(screen.getByRole("button", { name: "Share or load a view" }));
const pasteBox = () => screen.getByLabelText("Paste a view code here");
const paste = (text: string) => fireEvent.change(pasteBox(), { target: { value: text } });

describe("the view code in the pack places page", () => {
  it("is mounted closed, once, after the list tools", () => {
    show();
    expect(document.querySelectorAll("[data-view-code]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Share or load a view" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("keeps every earlier tool on the page (the shipped pack holds a note, so the note topics show)", () => {
    show(shipped);
    for (const attr of ["data-list-transfer", "data-note-topics", "data-view-code"]) expect(document.querySelector(`[${attr}]`), attr).not.toBeNull();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeTruthy();
  });
  it("shows no code until a search or filter is set", () => {
    show();
    openPanel();
    expect(screen.queryByLabelText(CODE)).toBeNull();
    fireEvent.change(box(), { target: { value: "cafe" } });
    expect((screen.getByLabelText(CODE) as HTMLTextAreaElement).value).toBe("VIEW v1\nsearch: cafe\n");
  });
  it("shows the code for the current search and tag", () => {
    show();
    fireEvent.change(box(), { target: { value: "main" } });
    fireEvent.click(screen.getByRole("radio", { name: /^Yes \(/ }));
    openPanel();
    expect((screen.getByLabelText(CODE) as HTMLTextAreaElement).value).toBe("VIEW v1\nsearch: main\ntag: yes\n");
  });
  it("applies a pasted code to the search box, the tag and the list", () => {
    show();
    openPanel();
    paste("VIEW v1\nsearch: cafe\ntag: yes");
    fireEvent.click(screen.getByRole("button", { name: "Use this view" }));
    expect(box().value).toBe("cafe");
    expect(names()).toEqual(["Alpha Cafe"]);
    expect((screen.getByRole("radio", { name: /^Yes \(/ }) as HTMLInputElement).checked).toBe(true);
  });
  it("applies a kind and resets what the code does not set", () => {
    show();
    fireEvent.change(box(), { target: { value: "bar" } });
    openPanel();
    paste("VIEW v1\nkind: cafe");
    fireEvent.click(screen.getByRole("button", { name: "Use this view" }));
    expect(box().value).toBe("");
    expect(names()).toEqual(["Alpha Cafe", "Gamma Cafe"]);
  });
  it("leaves out a line it cannot use, says so, and applies the rest", () => {
    show();
    openPanel();
    paste("VIEW v1\ntag: no\ncolour: red");
    expect(screen.getByText("Left out: colour")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this view" }));
    expect(names()).toEqual(["Gamma Cafe"]);
  });
  it("round trips: a code shown for one page state restores it after clearing", () => {
    show();
    fireEvent.change(box(), { target: { value: "main" } });
    fireEvent.click(screen.getByRole("radio", { name: /^Limited \(/ }));
    const before = names();
    openPanel();
    const code = (screen.getByLabelText(CODE) as HTMLTextAreaElement).value;
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.click(screen.getAllByRole("radio", { name: /^Any/ })[0]!);
    expect(names()).not.toEqual(before);
    paste(code);
    fireEvent.click(screen.getByRole("button", { name: "Use this view" }));
    expect(names()).toEqual(before);
    expect(box().value).toBe("main");
  });
  it("works in French and applies the typed words as they are", () => {
    show(data, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Partager ou charger une vue" }));
    fireEvent.change(screen.getByLabelText("Collez un code de vue ici"), { target: { value: "VIEW v1\nsearch: alpha" } });
    expect(document.body.textContent).toContain("Réglages trouvés\u00a0: 1.");
    fireEvent.click(screen.getByRole("button", { name: "Utiliser cette vue" }));
    expect((screen.getByLabelText("Rechercher par nom, adresse ou type") as HTMLInputElement).value).toBe("alpha");
  });
  it("works on the shipped pack: the code shown for a search brings the same list back", () => {
    show(shipped);
    fireEvent.change(box(), { target: { value: "cafe" } });
    const before = names();
    openPanel();
    const code = (screen.getByLabelText(CODE) as HTMLTextAreaElement).value;
    expect(code).toBe("VIEW v1\nsearch: cafe\n");
    fireEvent.change(box(), { target: { value: "" } });
    paste(code);
    fireEvent.click(screen.getByRole("button", { name: "Use this view" }));
    expect(names()).toEqual(before);
  });
  it("clears a chosen distance band but keeps the starting point that was typed", () => {
    const near = data.map((d, i) => ({ ...d, lat: 43.65 + i * 0.001, lon: -79.38 }));
    show(near);
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-79.38" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^Show Under 250/ })[0]!);
    expect(names()).not.toHaveLength(data.length);
    openPanel();
    paste("VIEW v1\ntag: any\nsearch: a");
    fireEvent.click(screen.getByRole("button", { name: "Use this view" }));
    expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe("43.65");
    expect((screen.getByLabelText("Longitude") as HTMLInputElement).value).toBe("-79.38");
    expect(names()).toEqual(["Alpha Cafe", "Beta Bar", "Delta Pharmacy", "Gamma Cafe"]);
  });
});
