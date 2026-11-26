/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { place } from "./placeFixtures";
import { PossibleRepeats, REPEAT_GROUPS_SHOWN } from "./PossibleRepeats";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const twin = (id: string, over: Record<string, unknown> = {}) => place(id, { name: "Alpha Hall", address: "5 Elm Street", category: "cafe", lat: 43.65, lon: -79.38, ...over });
const set = () => [twin("a", { wheelchair: "yes" }), twin("b", { wheelchair: "no" }), place("z", { name: "Zed Pharmacy", address: "99 Far Road", lat: 44.5, lon: -80 })];

afterEach(cleanup);

function show(over: { places?: ReturnType<typeof set>; locale?: Locale; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<PossibleRepeats places={over.places ?? set()} locale={locale} onSave={over.onSave} />);
}
const toggle = (l: Locale = "en") => screen.getByRole("button", { name: l === "en" ? /^(Look for places listed more than once|Hide possible repeats)$/ : /^(Chercher les lieux listés plus d’une fois|Masquer les répétitions possibles)$/ });
const open = (l: Locale = "en") => fireEvent.click(toggle(l));

describe("PossibleRepeats closed", () => {
  it("shows nothing for fewer than two places", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [twin("a")] }).container.innerHTML).toBe("");
  });
  it("starts closed, body hidden, with no heading element and no work done", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe(container.querySelector("[data-possible-repeats-body]")!.id);
    expect((container.querySelector("[data-possible-repeats-body]") as HTMLElement).hidden).toBe(true);
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(container.querySelector("[data-possible-repeats-groups]")).toBeNull();
  });
});

describe("PossibleRepeats open", () => {
  it("lists the group of the two alike places and not the other", () => {
    const { container } = show();
    open();
    const group = container.querySelector("[data-possible-repeats-groups] > li")!;
    expect(within(group as HTMLElement).getByText("Group 1: 2 places")).toBeTruthy();
    expect(group.textContent).toContain("Alpha Hall");
    expect(group.textContent).not.toContain("Zed Pharmacy");
    expect(screen.getByText("1 group of places that look alike, 2 places in all.")).toBeTruthy();
  });
  it("gives a one-line tally of the groups", () => {
    const { container } = show();
    open();
    expect(container.querySelector("[data-possible-repeats-stats]")!.textContent).toContain("1 of two places, 0 larger (up to 2).");
  });
  it("shows each member's address, kind, tag and id", () => {
    const { container } = show();
    open();
    expect(container.textContent).toContain("Address: 5 Elm Street; Kind: cafe; Tag: yes; Id: a");
    expect(container.textContent).toContain("Tag: no; Id: b");
  });
  it("says why, with the distance", () => {
    const { container } = show();
    open();
    expect(container.querySelector("[data-possible-repeats-why]")!.textContent).toMatch(/a \/ b: same name, same street address, very near each other, same kind of place; 0 m apart/);
  });
  it("says when the records report different tags", () => {
    show();
    open();
    expect(screen.getByText(/report different wheelchair tags/)).toBeTruthy();
  });
  it("says nothing differs when the tags agree", () => {
    show({ places: [twin("a"), twin("b")] as ReturnType<typeof set> });
    open();
    expect(screen.queryByText(/report different wheelchair tags/)).toBeNull();
  });
  it("says so when nothing looks alike", () => {
    show({ places: [twin("a", { name: "One", address: "1 A St", lat: 40 }), twin("b", { name: "Two", address: "2 B St", lat: 41 })] as ReturnType<typeof set> });
    open();
    expect(screen.getByText("No places on this list look alike at this level.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save as a CSV file" })).toBeNull();
  });
  it("changes what it finds with the level chosen", () => {
    const near = [twin("a", { name: "Quesnel Library", address: "1 A St", lat: 43.7 }), twin("b", { name: "Quesnell Library", address: "2 B St", lat: 43.7002, category: "bar" })];
    show({ places: near as ReturnType<typeof set> });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Very alike" }));
    expect(screen.getByText("No places on this list look alike at this level.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Somewhat alike" }));
    expect(screen.getByText("1 group of places that look alike, 2 places in all.")).toBeTruthy();
  });
  it("writes UNKNOWN for a missing address or kind", () => {
    const { container } = show({ places: [twin("a", { address: null, category: null }), twin("b", { address: null, category: null })] as ReturnType<typeof set> });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Somewhat alike" }));
    expect(container.textContent).toContain("Address: UNKNOWN; Kind: UNKNOWN");
  });
  it("lists at most the group limit", () => {
    const many = Array.from({ length: (REPEAT_GROUPS_SHOWN + 3) * 2 }, (_, i) => twin(`m${i}`, { name: `Shop ${Math.floor(i / 2)}`, address: `${Math.floor(i / 2) + 1} Road ${Math.floor(i / 2)}`, lat: 40 + Math.floor(i / 2) * 0.1 }));
    const { container } = show({ places: many as ReturnType<typeof set> });
    open();
    expect(container.querySelectorAll("[data-possible-repeats-groups] > li")).toHaveLength(REPEAT_GROUPS_SHOWN);
    expect(screen.getByText(`${REPEAT_GROUPS_SHOWN + 3} groups of places that look alike, ${(REPEAT_GROUPS_SHOWN + 3) * 2} places in all.`)).toBeTruthy();
  });
  it("says when a very common name was left out", () => {
    const chain = Array.from({ length: 41 }, (_, i) => twin(`c${i}`, { name: "Chain Coffee", address: `${i + 1} Road ${i}`, lat: 40 + i * 0.5, lon: -70 }));
    show({ places: [...chain, ...set()] as ReturnType<typeof set> });
    open();
    expect(screen.getByText(/1 very common name, address or area was left out because too many places share it\./)).toBeTruthy();
    expect(screen.getByText("1 group of places that look alike, 2 places in all.")).toBeTruthy();
  });
  it("keeps the level when closed and opened again", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Very alike" }));
    open();
    open();
    expect((screen.getByRole("radio", { name: "Very alike" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("PossibleRepeats comparison", () => {
  const cmpToggle = () => screen.getByRole("button", { name: /^(Compare these records field by field|Hide the comparison)$/ });
  it("is closed for each group until asked for", () => {
    const { container } = show();
    open();
    expect(cmpToggle().getAttribute("aria-expanded")).toBe("false");
    expect((container.querySelector("[data-repeat-compare]") as HTMLElement).hidden).toBe(true);
    expect(container.querySelector("[data-repeat-compare] table")).toBeNull();
  });
  it("lines the records up field by field with the values as given", () => {
    const { container } = show();
    open();
    fireEvent.click(cmpToggle());
    const table = within(container.querySelector("[data-repeat-compare]") as HTMLElement).getByRole("table", { name: "Group 1, field by field" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Field", "Match", "Record a", "Record b"]);
    const tag = within(table).getByRole("row", { name: /Wheelchair tag/ });
    expect(within(tag).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Differs", "yes", "no"]);
    const name = within(table).getByRole("row", { name: /^Name/ });
    expect(within(name).getAllByRole("cell")[0]!.textContent).toBe("Same");
  });
  it("says which fields differ and that nothing is chosen", () => {
    show();
    open();
    fireEvent.click(cmpToggle());
    expect(screen.getByText("They differ on: Wheelchair tag.")).toBeTruthy();
    expect(screen.getByText("Nothing is chosen or merged here. The pack does not say which value is right.")).toBeTruthy();
  });
  it("shows a gap as not given", () => {
    const { container } = show({ places: [twin("a"), twin("b", { category: null })] as ReturnType<typeof set> });
    open();
    fireEvent.click(cmpToggle());
    expect(within(container.querySelector("[data-repeat-compare]") as HTMLElement).getByRole("row", { name: /Kind/ }).textContent).toContain("not given");
  });
  it("closes again", () => {
    const { container } = show();
    open();
    fireEvent.click(cmpToggle());
    fireEvent.click(cmpToggle());
    expect((container.querySelector("[data-repeat-compare]") as HTMLElement).hidden).toBe(true);
  });
  it("has no axe violations with the comparison open", async () => {
    const { container } = show();
    open();
    fireEvent.click(cmpToggle());
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});

describe("PossibleRepeats saving", () => {
  it("saves the text and the CSV and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(onSave.mock.calls.map((c) => c[0].name)).toEqual(["possible-repeats.txt", "possible-repeats.csv"]);
    expect(onSave.mock.calls[0]![0].content).toContain("nothing was merged or removed");
    expect(screen.getByText("Saved possible-repeats.csv.")).toBeTruthy();
  });
  it("says the browser cannot save when saving fails or throws", () => {
    show({ onSave: () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({
      onSave: () => {
        throw new Error("no");
      },
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
});

describe("PossibleRepeats by keyboard", () => {
  it("opens with Enter and Space, keeping focus on the toggle", () => {
    show();
    const b = toggle();
    b.focus();
    for (const key of ["Enter", " "]) {
      fireEvent.keyDown(b, { key });
      fireEvent.keyUp(b, { key });
    }
    expect(document.activeElement).toBe(b);
  });
});

for (const locale of ["en", "fr"] as const) {
  describe(`PossibleRepeats in ${locale}`, () => {
    it("has no axe violations closed, open and at another level", async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
      fireEvent.click(screen.getAllByRole("radio")[2]!);
      expect((await axe.run(container, axeRules)).violations, "level").toEqual([]);
    });
    it("uses the page's language and French typography on its own words", () => {
      const { container } = show({ locale });
      open(locale);
      expect(container.querySelector("section")!.getAttribute("lang")).toBe(locale);
      if (locale === "fr") for (const el of container.querySelectorAll<HTMLElement>("section > p, button, label, [data-possible-repeats-body] > p")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    });
  });
}
