/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AroundPlace } from "./AroundPlace";
import { at, crossroads } from "./aroundFixtures";
import { parseCsv } from "./csvParse";
import type { SavedFile } from "./downloadFile";
import type { Locale } from "./stateCopy";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const NBSP = "\u00a0";
/** Testing Library reads a no-break space as a plain one when it matches text. */
const plain = (text: string): string => text.split(NBSP).join(" ");

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof crossroads>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<AroundPlace places={over.places ?? crossroads()} locale={locale} onSave={over.onSave} />);
}
const open = (locale: Locale = "en") => fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show places around a place" : "Afficher les lieux autour d’un lieu" }));
const choose = (label: string, locale: Locale = "en") => fireEvent.change(screen.getByLabelText(locale === "en" ? "Place to look around" : "Lieu autour duquel regarder"), { target: { value: label } });
const table = (name: RegExp) => screen.getByRole("table", { name });
const rowHeaders = (t: HTMLElement) => within(t).getAllByRole("rowheader").map((h) => h.textContent);

describe("when it shows", () => {
  it("shows nothing for fewer than two places", () => {
    expect(show({ places: [at("a", 0, 0)] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [] }).container.innerHTML).toBe("");
  });
  it("shows nothing when no place has a map point", () => {
    expect(show({ places: [at("a", null, null), at("b", null, null)] }).container.innerHTML).toBe("");
  });
  it("is closed to begin with, with one button that says it is collapsed", () => {
    show();
    const button = screen.getByRole("button", { name: "Show places around a place" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Place to look around")).toBeNull();
    expect(screen.queryAllByRole("table")).toHaveLength(0);
  });
  it("opens and closes with the same button", () => {
    show();
    open();
    expect(screen.getByRole("button", { name: "Hide places around a place" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide places around a place" }));
    expect(screen.queryByLabelText("Place to look around")).toBeNull();
  });
});

describe("choosing a place", () => {
  it("lists the places that have a map point, by name, and says how many cannot be chosen", () => {
    show();
    open();
    const options = within(screen.getByLabelText("Place to look around")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose a place", "Centre Hall, 1 Main Street", "East Library, 1 Main Street", "Far Museum, 1 Main Street", "North Cafe, 1 Main Street", "South Shop, 1 Main Street", "West Bar, 1 Main Street"]);
    expect(screen.getByText("1 place has no map point, so it cannot be chosen.")).toBeTruthy();
  });
  it("asks the person to choose before there is a list", () => {
    show();
    open();
    expect(screen.getByRole("status").textContent).toBe("Choose a place to see what is listed around it.");
    expect(screen.queryAllByRole("table")).toHaveLength(0);
  });
  it("lists the neighbours within 250 m, nearest first, with direction and tag", () => {
    show();
    open();
    choose("centre");
    const list = table(/Places listed around/);
    expect(rowHeaders(list)).toEqual(["North Cafe", "East Library", "South Shop", "West Bar"]);
    const cells = within(list).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells).toEqual([[`80${NBSP}m to the north`, "No"], [`120${NBSP}m to the east`, "Limited"], [`200${NBSP}m to the south`, "Designated"], [`240${NBSP}m to the west`, "UNKNOWN"]]);
  });
  it("says in words how many are listed, and that the lines are straight", () => {
    show();
    open();
    choose("centre");
    expect(screen.getByText(plain(`4 places listed within 250${NBSP}m of Centre Hall.`))).toBeTruthy();
    expect(screen.getByText(/does not say the way between the two is open/)).toBeTruthy();
  });
  it("says how many lie farther and how many have no map point", () => {
    show();
    open();
    choose("centre");
    expect(screen.getByText(plain(`1 more place with a map point lies farther than 250${NBSP}m.`))).toBeTruthy();
    expect(screen.getByText("1 place has no map point, so it is left out.")).toBeTruthy();
  });
  it("changes the list when the distance changes", () => {
    show();
    open();
    choose("centre");
    fireEvent.click(screen.getByRole("radio", { name: `Within 100${NBSP}m` }));
    expect(rowHeaders(table(/Places listed around/))).toEqual(["North Cafe"]);
    fireEvent.click(screen.getByRole("radio", { name: `Within 1${NBSP}km` }));
    expect(rowHeaders(table(/Places listed around/))).toEqual(["North Cafe", "East Library", "South Shop", "West Bar", "Far Museum"]);
  });
  it("starts at 250 m", () => {
    show();
    open();
    expect((screen.getByRole("radio", { name: `Within 250${NBSP}m` }) as HTMLInputElement).checked).toBe(true);
  });
  it("says so plainly when nothing else is listed within the distance", () => {
    show({ places: [at("c", 0, 0, { name: "Lonely" }), at("far", 900, 0)] });
    open();
    choose("c");
    expect(screen.getByText(plain(`No other place with a map point is listed within 250${NBSP}m of Lonely.`))).toBeTruthy();
    expect(screen.queryAllByRole("table")).toHaveLength(0);
  });
});

describe("the bands and directions tables", () => {
  it("counts places by distance band with a column per tag", () => {
    show();
    open();
    choose("centre");
    const bands = table(/Places by distance band/);
    expect(within(bands).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Distance", "Places", "Yes", "Limited", "No", "Designated", "UNKNOWN"]);
    expect(rowHeaders(bands)).toEqual([`Up to 50${NBSP}m`, `50${NBSP}m to 100${NBSP}m`, `100${NBSP}m to 250${NBSP}m`]);
    const counts = within(bands).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0]!.textContent);
    expect(counts).toEqual(["0", "1", "3"]);
  });
  it("counts places by direction, leaving out empty directions", () => {
    show();
    open();
    choose("centre");
    expect(rowHeaders(table(/Places by direction/))).toEqual(["north (N)", "east (E)", "south (S)", "west (W)"]);
  });
});

describe("narrowing the list", () => {
  const setup = () => {
    show();
    open();
    choose("centre");
  };
  it("keeps places that match words typed", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Find among these places"), { target: { value: "lib" } });
    expect(rowHeaders(table(/Places listed around/))).toEqual(["East Library"]);
    expect(screen.getByText(/1 shown after your filters/)).toBeTruthy();
  });
  it("keeps places with a chosen tag", () => {
    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Wheelchair tag: UNKNOWN" }));
    expect(rowHeaders(table(/Places listed around/))).toEqual(["West Bar"]);
  });
  it("keeps places in a chosen direction", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "S" } });
    expect(rowHeaders(table(/Places listed around/))).toEqual(["South Shop"]);
  });
  it("says when nothing matches and still shows how many are listed", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Find among these places"), { target: { value: "zzz" } });
    expect(screen.getByText("None of the places around it match your filters.")).toBeTruthy();
    expect(screen.queryByRole("table", { name: /Places listed around/ })).toBeNull();
    expect(screen.getByText(/4 places listed within/)).toBeTruthy();
  });
  it("orders by name and by tag", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    expect(rowHeaders(table(/Places listed around/))).toEqual(["East Library", "North Cafe", "South Shop", "West Bar"]);
    fireEvent.click(screen.getByRole("radio", { name: "By wheelchair tag" }));
    expect(rowHeaders(table(/Places listed around/))).toEqual(["East Library", "North Cafe", "South Shop", "West Bar"]);
  });
  it("clears the filters when another place is chosen", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Find among these places"), { target: { value: "lib" } });
    choose("e");
    expect((screen.getByLabelText("Find among these places") as HTMLInputElement).value).toBe("");
  });
});

describe("a place that cannot be measured", () => {
  it("is not offered as a centre, and a place chosen that then goes away is reported", () => {
    const { rerender } = show();
    open();
    choose("centre");
    rerender(<AroundPlace places={crossroads().filter((p) => p.id !== "centre")} locale="en" />);
    expect(screen.getByText("That place is no longer in the list shown. Choose another.")).toBeTruthy();
  });
});

describe("saving", () => {
  it("saves the list as text and as CSV with the shown places", () => {
    const saved: SavedFile[] = [];
    show({ onSave: (f) => (saved.push(f), true) });
    open();
    choose("centre");
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a spreadsheet (.csv)" }));
    expect(saved.map((f) => f.name)).toEqual(["places-around-a-place.txt", "places-around-a-place.csv"]);
    expect(saved[0]!.content).toContain("1. North Cafe");
    const csv = parseCsv(saved[1]!.content);
    expect(csv.ok && csv.rows.length).toBe(5);
    expect(screen.getByText("Saved places-around-a-place.csv.")).toBeTruthy();
  });
  it("saves only what the filters leave", () => {
    const saved: SavedFile[] = [];
    show({ onSave: (f) => (saved.push(f), true) });
    open();
    choose("centre");
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "E" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    expect(saved[0]!.content).toContain("1. East Library");
    expect(saved[0]!.content).not.toContain("North Cafe");
  });
  it("says so when the browser cannot save, including when saving throws", () => {
    show({ onSave: () => false });
    open();
    choose("centre");
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({ onSave: vi.fn(() => { throw new Error("blocked"); }) });
    open();
    choose("centre");
    fireEvent.click(screen.getByRole("button", { name: "Save as text (.txt)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
  it("offers no save buttons before a list exists", () => {
    show();
    open();
    expect(screen.queryByRole("button", { name: /Save as/ })).toBeNull();
  });
  it("makes no network request and stores nothing", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    localStorage.clear();
    show();
    open();
    choose("centre");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe("in French", () => {
  it("is French throughout, with the French spacing and compass words", () => {
    show({ locale: "fr" });
    open("fr");
    choose("centre", "fr");
    expect(screen.getByText(plain(`4 lieux répertoriés à moins de 250${NBSP}m de Centre Hall.`))).toBeTruthy();
    const list = table(/Lieux répertoriés autour du lieu choisi/);
    expect(rowHeaders(list)).toEqual(["North Cafe", "East Library", "South Shop", "West Bar"]);
    expect(within(list).getAllByRole("row")[4]!.textContent).toContain("à l’ouest");
    expect(rowHeaders(table(/Lieux par direction/))).toEqual(["nord (N)", "est (E)", "sud (S)", "ouest (O)"]);
    expect(screen.getByRole("button", { name: "Enregistrer en texte (.txt)" })).toBeTruthy();
  });
  it("never writes INCONNU", () => {
    const { container } = show({ locale: "fr" });
    open("fr");
    choose("centre", "fr");
    expect(container.textContent).not.toMatch(/inconnu/i);
    expect(container.textContent).toContain("UNKNOWN");
  });
});

describe("accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations when closed and with a list, in ${locale === "en" ? "English" : "French"}`, async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      open(locale);
      choose("centre", locale);
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
    });
  }
  it("names every control and table", () => {
    show();
    open();
    choose("centre");
    for (const el of [...screen.getAllByRole("button"), ...screen.getAllByRole("checkbox"), ...screen.getAllByRole("radio"), ...screen.getAllByRole("combobox")]) {
      expect((el.getAttribute("aria-label") ?? el.textContent ?? "").trim().length > 0 || (el as HTMLInputElement).labels?.length, el.outerHTML).toBeTruthy();
    }
    for (const t of screen.getAllByRole("table")) expect(t.querySelector("caption")?.textContent?.length).toBeGreaterThan(0);
  });
});
