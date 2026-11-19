/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { Shortlist } from "./Shortlist";
import { lintFrench } from "./typography";
import type { ShortlistEntry } from "./shortlist";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const raw = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Place ${id}`, wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM, ...over });
const places: PackPlaceRecord[] = [...parsePackPlaces([raw("a"), raw("b", { wheelchair: "no", name: "Beta Court" }), raw("c", { name: "" })]).places];
const entry = (id: string): ShortlistEntry => ({ id, addedOn: TODAY });
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

afterEach(cleanup);

interface Over {
  list?: ShortlistEntry[];
  locale?: "en" | "fr";
  kept?: boolean;
  from?: { lat: number; lon: number } | null;
  onRemove?: (id: string) => void;
  onClear?: () => void;
  copy?: (text: string) => Promise<boolean>;
}
function show(over: Over = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const props = { list: over.list ?? [entry("a"), entry("b")], places, locale, today: TODAY, kept: over.kept ?? true, from: over.from ?? null, onRemove: over.onRemove ?? vi.fn(), onClear: over.onClear ?? vi.fn(), copy: over.copy };
  const view = render(<Shortlist {...props} />);
  return { ...view, props };
}

describe("Shortlist table", () => {
  it("renders nothing for an empty list", () => {
    const { container } = show({ list: [] });
    expect(container.innerHTML).toBe("");
  });
  it("has one h2 with the count of the limit", () => {
    show();
    expect(screen.getByRole("heading", { level: 2, name: "Your list (2 of 12)" })).toBeTruthy();
  });
  it("is a table with a caption, column headers and a row header per place", () => {
    show();
    const table = screen.getByRole("table", { name: /Shortlisted places side by side \(2\)/ });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Place", "Wheelchair tag", "Kind", "Address", "Tier", "Retrieved", "Source", "Licence", "Remove"]);
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Place a", "Beta Court"]);
  });
  it("shows each place's cells under the right header", () => {
    show();
    const row = screen.getByRole("row", { name: /Beta Court/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["No", "cafe", "1 Main Street", "Tier 0", "Retrieved 9 days ago", "OpenStreetMap, Geofabrik Ontario extract", "ODbL-1.0", "Remove"]);
  });
  it("shows UNKNOWN for a place with no name", () => {
    show({ list: [entry("c")] });
    expect(screen.getAllByRole("rowheader")[0]!.textContent).toBe("UNKNOWN");
  });
  it("adds a distance column when a starting point is given", () => {
    show({ from: { lat: 43.65, lon: -79.38 } });
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toContain("Distance");
  });
  it("says so when a listed place is no longer in the pack, and still shows the others", () => {
    show({ list: [entry("a"), entry("gone")] });
    expect(screen.getByText("1 listed place is not in the pack on this device, so nothing about it is known.")).toBeTruthy();
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
  });
  it("shows no table when every listed place is missing", () => {
    show({ list: [entry("x"), entry("y")] });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/2 listed places are not in the pack/)).toBeTruthy();
  });
  it("warns that the list will not be kept when storage failed", () => {
    show({ kept: false });
    expect(screen.getByText("This list could not be saved on this device. It will be gone when you close the page.")).toBeTruthy();
  });
  it("does not warn when the list is kept", () => {
    show();
    expect(screen.queryByText(/could not be saved/)).toBeNull();
  });
  it("makes the scrolling table reachable by keyboard and names it", () => {
    show();
    const region = screen.getByRole("region", { name: "Comparison table" });
    expect(region.getAttribute("tabindex")).toBe("0");
  });
});

describe("Shortlist actions", () => {
  it("removes a place with a button that names the place", () => {
    const { props } = show();
    fireEvent.click(screen.getByRole("button", { name: "Remove Beta Court from the list" }));
    expect(props.onRemove).toHaveBeenCalledWith("b");
    expect(screen.getByText("Removed from the list.")).toBeTruthy();
  });
  it("moves focus to the section after a removal", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("button", { name: "Remove Place a from the list" }));
    expect(document.activeElement).toBe(container.querySelector("section"));
  });
  it("empties the list and says so", () => {
    const { props } = show();
    fireEvent.click(screen.getByRole("button", { name: "Empty the list" }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });
  it("copies the list as text and says it was copied", async () => {
    const copy = vi.fn<(text: string) => Promise<boolean>>(async () => true);
    show({ copy });
    fireEvent.click(screen.getByRole("button", { name: "Copy the list as text" }));
    await waitFor(() => expect(screen.getByText("Copied to the clipboard.")).toBeTruthy());
    expect(copy.mock.calls[0]![0]).toContain("Shortlisted places");
    expect(copy.mock.calls[0]![0]).toContain("Beta Court");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("shows the text to select when the browser cannot copy", async () => {
    show({ copy: async () => false });
    fireEvent.click(screen.getByRole("button", { name: "Copy the list as text" }));
    await waitFor(() => expect(screen.getByText(/could not copy/)).toBeTruthy());
    const box = screen.getByRole("textbox", { name: "The list as text" }) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.value).toContain("Beta Court");
  });
  it("shows and hides the text on request, with the state on the button", () => {
    show();
    const toggle = screen.getByRole("button", { name: "Show the text" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("textbox")).toBeTruthy();
    const hide = screen.getByRole("button", { name: "Hide the text" });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    expect(hide.getAttribute("aria-controls")).toBe(screen.getByRole("textbox").id);
    fireEvent.click(hide);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("puts the four actions in a named group", () => {
    show();
    expect(within(screen.getByRole("group", { name: "List actions" })).getAllByRole("button")).toHaveLength(4);
  });
});

describe("Shortlist differences and CSV", () => {
  it("names the columns that differ between the listed places", () => {
    show();
    expect(screen.getByText("These columns differ between the places: Wheelchair tag.")).toBeTruthy();
  });
  it("marks the cells of a differing column", () => {
    const { container } = show();
    const marked = [...container.querySelectorAll("td[data-differs]")].map((td) => td.textContent);
    expect(marked).toEqual(["Yes", "No"]);
  });
  it("says the places report the same when no column differs, and does not rank them", () => {
    show({ list: [entry("a"), entry("c")] });
    const note = screen.getByText(/These columns differ|report the same/).textContent ?? "";
    expect(note).toMatch(/Wheelchair tag|report the same/);
    expect(note).not.toMatch(/better|best|worse|rank(ed)? (first|higher)/i);
  });
  it("shows no differences line for one place", () => {
    show({ list: [entry("a")] });
    expect(screen.queryByText(/These columns differ|report the same/)).toBeNull();
  });
  it("copies the list as CSV and says so", async () => {
    const copy = vi.fn<(text: string) => Promise<boolean>>(async () => true);
    show({ copy });
    fireEvent.click(screen.getByRole("button", { name: "Copy the list as CSV" }));
    await waitFor(() => expect(screen.getByText("Copied as CSV.")).toBeTruthy());
    const csv = copy.mock.calls[0]![0];
    expect(csv.split("\r\n")[0]).toContain("place_id");
    expect(csv).toContain("Beta Court");
  });
  it("shows the CSV to select when the browser cannot copy it", async () => {
    show({ copy: async () => false });
    fireEvent.click(screen.getByRole("button", { name: "Copy the list as CSV" }));
    const box = (await screen.findByRole("textbox", { name: "The list as CSV" })) as HTMLTextAreaElement;
    expect(box.value).toContain("place_id");
  });
  it("offers no CSV button when every listed place is missing from the pack", () => {
    show({ list: [entry("x"), entry("y")] });
    expect(screen.queryByRole("button", { name: "Copy the list as CSV" })).toBeNull();
  });
  it("is French", () => {
    show({ locale: "fr" });
    expect(screen.getByText((_, node) => node?.tagName === "P" && node.textContent === "Ces colonnes diffèrent d’un lieu à l’autre\u00a0: Indication pour fauteuil roulant.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copier la liste en CSV" })).toBeTruthy();
  });
});

describe("Shortlist in French and accessibility", () => {
  it("uses French labels, the French count and clean typography", () => {
    const { container } = show({ locale: "fr", list: [entry("a"), entry("gone")] });
    expect(screen.getByRole("heading", { level: 2, name: "Votre liste (2 sur 12)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retirer Place a de la liste" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copier la liste en texte" })).toBeTruthy();
    for (const node of container.querySelectorAll("p, caption, th, button")) expect(lintFrench(node.textContent ?? ""), node.textContent ?? "").toEqual([]);
    expect(container.textContent).not.toMatch(/INCONNU/);
  });
  it("sets the language on the section", () => {
    const { container } = show({ locale: "fr" });
    expect(container.querySelector("section")?.getAttribute("lang")).toBe("fr");
  });
  it("has no axe violations in English or French, with the text showing", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show({ locale, from: { lat: 43.65, lon: -79.38 } });
      fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show the text" : "Afficher le texte" }));
      expect((await axe.run(container, axeRules)).violations, locale).toEqual([]);
      cleanup();
    }
  });
  it("shows names and ids as text, never as markup", () => {
    const hostile: PackPlaceRecord[] = [...parsePackPlaces([raw("x", { name: "<img src=x onerror=alert(1)>", address: "<b>bold</b>" })]).places];
    const { container } = render(<Shortlist list={[entry("x")]} places={hostile} locale="en" today={TODAY} kept onRemove={() => undefined} onClear={() => undefined} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("td b")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
