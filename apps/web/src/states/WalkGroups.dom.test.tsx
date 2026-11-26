/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { place } from "./placeFixtures";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";
import { WALK_GROUPS_SHOWN, WALK_MEMBERS_SHOWN, WalkGroups } from "./WalkGroups";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const at = (id: string, east: number, north: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + north / 111_195, lon: -79.38 + east / 80_500, ...over });
const set = () => [
  at("a", 0, 0, { name: "Alpha", address: "1 Main Street", wheelchair: "yes" }),
  at("b", 60, 0, { name: "Beta", address: "2 Main Street", wheelchair: "no" }),
  at("c", 200, 0, { name: "Gamma", address: "4 Main Street", wheelchair: "yes" }),
  at("d", 5000, 0, { name: "Delta", address: null, wheelchair: "UNKNOWN" }),
  at("e", 5050, 0, { name: "Epsilon", address: null, wheelchair: "UNKNOWN" }),
  at("f", 9000, 0, { name: "Zeta", wheelchair: "yes" }),
  place("g", { lat: null, lon: null, name: "Nowhere" }),
];

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof set>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<WalkGroups places={over.places ?? set()} locale={locale} onSave={over.onSave} />);
}
const NAME = { en: "Group the places that are close together", fr: "Regrouper les lieux rapprochés" };
const HIDE = { en: "Hide the places close together", fr: "Masquer les lieux rapprochés" };
const toggle = (l: Locale = "en") => screen.getByRole("button", { name: new RegExp(`^(${NAME[l]}|${HIDE[l]})$`) });
const open = (l: Locale = "en") => fireEvent.click(toggle(l));
const titles = (c: HTMLElement) => [...c.querySelectorAll("[data-walk-groups-list] > li > strong")].map((e) => e.textContent);
const group = (name: string) => screen.getByRole("radiogroup", { name });

describe("WalkGroups closed", () => {
  it("shows nothing when fewer than two places have a map point", () => {
    expect(show({ places: [at("a", 0, 0), place("b", { lat: null, lon: null })] as ReturnType<typeof set> }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [] }).container.innerHTML).toBe("");
  });
  it("starts closed, with a hidden body, an aria-controls link and no heading element", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe(container.querySelector("[data-walk-groups-body]")!.id);
    expect((container.querySelector("[data-walk-groups-body]") as HTMLElement).hidden).toBe(true);
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
  });
  it("does no grouping while closed", () => {
    const { container } = show();
    expect(container.querySelector("[data-walk-groups-body]")!.childElementCount).toBe(0);
  });
});

describe("WalkGroups open", () => {
  it("opens with the default distance and lists the groups, largest first", () => {
    const { container } = show();
    open();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect((within(group("Distance between places")).getByRole("radio", { name: /^Within 200/ }) as HTMLInputElement).checked).toBe(true);
    expect(titles(container)).toEqual(["Around Main Street", "Around Delta"]);
  });
  it("says what it is: straight-line, not a route", () => {
    show();
    open();
    expect(screen.getAllByText(/not a route/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Straight-line distances from the map points/)).toBeTruthy();
  });
  it("summarises the groups and what was left out", () => {
    show();
    open();
    expect(screen.getByText("2 groups holding 5 places (83% of the places with a map point). The largest has 3.")).toBeTruthy();
    expect(screen.getByText("1 place has no other place that close.")).toBeTruthy();
    expect(screen.getByText("1 place has no map point and is not grouped.")).toBeTruthy();
  });
  it("lists the members of a group by name with their addresses", () => {
    const { container } = show();
    open();
    const li = container.querySelector("[data-walk-groups-list] > li")!;
    expect([...li.querySelectorAll("ul > li")].map((x) => x.textContent)).toEqual(["Alpha, 1 Main Street", "Beta, 2 Main Street", "Gamma, 4 Main Street"]);
    expect(li.textContent).toContain("Tags: 2 yes, 1 no");
  });
  it("changes the groups when the distance changes", () => {
    const { container } = show();
    open();
    fireEvent.click(within(group("Distance between places")).getByRole("radio", { name: /^Within 100/ }));
    expect(container.querySelector("[data-walk-groups-list] > li")!.textContent).toContain("2 places");
    expect(screen.getByText(/^2 groups holding 4 places/)).toBeTruthy();
    fireEvent.click(within(group("Distance between places")).getByRole("radio", { name: /^Within 200/ }));
    expect(container.querySelector("[data-walk-groups-list] > li")!.textContent).toContain("3 places");
    expect(screen.getByText(/^2 groups holding 5 places/)).toBeTruthy();
  });
  it("suggests a longer distance when no two places are that close", () => {
    show({ places: [at("a", 0, 0), at("b", 3000, 0)] as ReturnType<typeof set> });
    open();
    expect(screen.getByText("No two places are that close together.")).toBeTruthy();
    expect(screen.getByText("No two places are close enough to group at any of these distances.")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Show" })).toBeNull();
  });
  it("filters and says when nothing matches", () => {
    const { container } = show();
    open();
    fireEvent.click(within(group("Show")).getByRole("radio", { name: "Every tag UNKNOWN" }));
    expect(titles(container)).toEqual(["Around Delta"]);
    fireEvent.click(within(group("Show")).getByRole("radio", { name: "Different tags in the group" }));
    expect(titles(container)).toEqual(["Around Main Street"]);
    cleanup();
    show({ places: [at("a", 0, 0, { wheelchair: "yes" }), at("b", 10, 0, { wheelchair: "yes" })] as ReturnType<typeof set> });
    open();
    fireEvent.click(within(group("Show")).getByRole("radio", { name: "A place tagged no" }));
    expect(screen.getByText("No group matches that choice.")).toBeTruthy();
  });
  it("orders by name and by pack order", () => {
    const { container } = show();
    open();
    fireEvent.click(within(group("Order")).getByRole("radio", { name: "By name" }));
    expect(titles(container)).toEqual(["Around Delta", "Around Main Street"]);
    fireEvent.click(within(group("Order")).getByRole("radio", { name: "Pack order" }));
    expect(titles(container)).toEqual(["Around Main Street", "Around Delta"]);
  });
  it("lists at most the limit of groups and says how many more", () => {
    const many = Array.from({ length: WALK_GROUPS_SHOWN + 3 }, (_, i) => [at(`m${i}a`, i * 5000, 0, { name: `G${i}a` }), at(`m${i}b`, i * 5000 + 10, 0, { name: `G${i}b` })]).flat();
    const { container } = show({ places: many as ReturnType<typeof set> });
    open();
    expect(container.querySelectorAll("[data-walk-groups-list] > li")).toHaveLength(WALK_GROUPS_SHOWN);
    expect(screen.getByText("3 more groups are in the saved files.")).toBeTruthy();
  });
  it("lists at most the limit of members and says how many more", () => {
    const row = Array.from({ length: WALK_MEMBERS_SHOWN + 2 }, (_, i) => at(`r${i}`, i * 20, 0, { name: `Row ${String(i).padStart(2, "0")}` }));
    const { container } = show({ places: row as ReturnType<typeof set> });
    open();
    const items = container.querySelectorAll("[data-walk-groups-list] > li > ul > li");
    expect(items).toHaveLength(WALK_MEMBERS_SHOWN + 1);
    expect(items[WALK_MEMBERS_SHOWN]!.textContent).toBe("and 2 more in the saved files");
  });
  it("keeps its choices when closed and opened again", () => {
    show();
    open();
    fireEvent.click(within(group("Order")).getByRole("radio", { name: "By name" }));
    open();
    open();
    expect((within(group("Order")).getByRole("radio", { name: "By name" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("WalkGroups inside a group", () => {
  it("names the place that links the group when there is one", () => {
    const row = [at("a", 0, 0, { name: "Aa" }), at("b", 150, 0, { name: "Bb" }), at("c", 300, 0, { name: "Cc" })];
    const { container } = show({ places: row as ReturnType<typeof set> });
    open();
    expect(container.querySelector("[data-walk-links]")!.textContent).toBe("Without this place the rest of the group would split into parts more than 200\u00a0m apart: Bb.");
  });
  it("says which place stands furthest from its neighbour", () => {
    const { container } = show();
    open();
    expect(container.querySelector("[data-walk-groups-list] > li [data-walk-apart]")!.textContent).toMatch(/^Gamma is the furthest from its nearest neighbour in the group, 14\d\u00a0m\.$/);
  });
  it("counts places with an UNKNOWN tag when there are two or more", () => {
    const { container } = show();
    open();
    const items = [...container.querySelectorAll("[data-walk-groups-list] > li")];
    expect(items[0]!.textContent).not.toContain("UNKNOWN)");
    expect(items[1]!.textContent).toContain("2 places here have no wheelchair tag (UNKNOWN).");
  });
  it("offers a filter for two or more UNKNOWN tags", () => {
    const { container } = show();
    open();
    fireEvent.click(within(group("Show")).getByRole("radio", { name: "Two or more tags UNKNOWN" }));
    expect(titles(container)).toEqual(["Around Delta"]);
  });
  it("shows no link line for a group without a link", () => {
    const { container } = show({ places: [at("a", 0, 0), at("b", 10, 0), at("c", 20, 0)] as ReturnType<typeof set> });
    open();
    expect(container.querySelector("[data-walk-links]")).toBeNull();
  });
});

describe("WalkGroups by distance", () => {
  const rows = (c: HTMLElement) => [...c.querySelectorAll("[data-walk-sweep] tbody tr")].map((tr) => [...tr.children].map((x) => x.textContent));
  it("shows the same places grouped at each distance", () => {
    const { container } = show();
    open();
    expect(rows(container)).toEqual([
      ["Within 100\u00a0m", "2", "4", "2", "2"],
      ["Within 200\u00a0m", "2", "5", "3", "1"],
      ["Within 400\u00a0m", "2", "5", "3", "1"],
    ]);
  });
  it("marks the row for the chosen distance", () => {
    const { container } = show();
    open();
    expect(container.querySelector("[data-walk-sweep] tr[aria-current=true] th")!.textContent).toBe("Within 200\u00a0m");
    fireEvent.click(within(group("Distance between places")).getByRole("radio", { name: /^Within 400/ }));
    expect(container.querySelector("[data-walk-sweep] tr[aria-current=true] th")!.textContent).toBe("Within 400\u00a0m");
  });
  it("has a caption, column headers and row headers", () => {
    const { container } = show();
    open();
    expect(container.querySelector("[data-walk-sweep] caption")!.textContent).toBe("The same places grouped at each distance");
    expect([...container.querySelectorAll("[data-walk-sweep] thead th")].every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect([...container.querySelectorAll("[data-walk-sweep] tbody th")].every((th) => th.getAttribute("scope") === "row")).toBe(true);
  });
  it("says at which distance groups start when none forms at the chosen one", () => {
    show({ places: [at("a", 0, 0), at("b", 350, 0)] as ReturnType<typeof set> });
    open();
    expect(screen.getByText(/^Try a longer distance\. Groups start to form at 400/)).toBeTruthy();
  });
  it("says what the next distance would change", () => {
    const row = [at("a", 0, 0), at("b", 50, 0), at("c", 270, 0), at("d", 320, 0)];
    const { container } = show({ places: row as ReturnType<typeof set> });
    open();
    fireEvent.click(within(group("Distance between places")).getByRole("radio", { name: /^Within 100/ }));
    expect(container.querySelector("[data-walk-next]")!.textContent).toBe("At 200\u00a0m the groups would only get larger or stay the same.");
    fireEvent.click(within(group("Distance between places")).getByRole("radio", { name: /^Within 200/ }));
    expect(container.querySelector("[data-walk-next]")!.textContent).toBe("At 400\u00a0m: 2 groups would join into larger ones.");
  });
  it("has no line about a longer distance at the longest", () => {
    const { container } = show();
    open();
    fireEvent.click(within(group("Distance between places")).getByRole("radio", { name: /^Within 400/ }));
    expect(container.querySelector("[data-walk-next]")).toBeNull();
  });
  it("says so when no distance forms a group", () => {
    show({ places: [at("a", 0, 0), at("b", 5000, 0)] as ReturnType<typeof set> });
    open();
    expect(screen.getByText("No two places are close enough to group at any of these distances.")).toBeTruthy();
  });
});

describe("WalkGroups saving", () => {
  it("saves the groups as listed, as text and as CSV", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(within(group("Show")).getByRole("radio", { name: "Every tag UNKNOWN" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as a CSV file" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as a text file" }));
    expect(onSave.mock.calls.map((c) => c[0].name)).toEqual(["places-close-together.csv", "places-close-together.txt"]);
    expect(onSave.mock.calls[0]![0].content.trim().split("\r\n")).toHaveLength(3);
    expect(screen.getByText("Saved places-close-together.txt.")).toBeTruthy();
  });
  it("says the browser cannot save when saving fails or throws", () => {
    show({ onSave: () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({
      onSave: () => {
        throw new Error("no");
      },
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as a CSV file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
});

for (const locale of ["en", "fr"] as const) {
  describe(`WalkGroups in ${locale}`, () => {
    it("has no axe violations closed, open and after a choice", async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
      fireEvent.click(within(container.querySelector("[data-walk-groups-body]") as HTMLElement).getAllByRole("radio")[0]!);
      expect((await axe.run(container, axeRules)).violations, "chosen").toEqual([]);
    });
    it("uses the page's language, and French typography in French", () => {
      const { container } = show({ locale });
      open(locale);
      expect(container.querySelector("section")!.getAttribute("lang")).toBe(locale);
      if (locale === "fr") for (const el of container.querySelectorAll<HTMLElement>("section > p, button, label, [data-walk-groups-body] > p, [data-walk-groups-list] small")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    });
  });
}
