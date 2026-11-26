/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { VenueGroups } from "./VenueGroups";

afterEach(cleanup);
const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles/global.css"), "utf8");
const focusables = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter((e) => !e.closest("[hidden]") && e.getAttribute("tabindex") !== "-1");
const at = (id: string, name: string, wheelchair: string) => place(id, { name, wheelchair, lat: 43.65, lon: -79.38 });
const places = [at("a", "Hall", "yes"), at("b", "Hall Entrance", "no")];
const openIt = () => fireEvent.click(screen.getByRole("button", { name: "Show these places grouped into venues" }));

describe("VenueGroups keyboard and controls", () => {
  it("exposes only the toggle while closed", () => {
    const { container } = render(<VenueGroups places={places} locale="en" />);
    expect(focusables(container).map((c) => c.textContent)).toEqual(["Show these places grouped into venues"]);
  });
  it("reaches the controls in reading order: toggle, find, order, part kinds, tags filter, then the two saves", () => {
    const { container } = render(<VenueGroups places={places} locale="en" />);
    openIt();
    const names = focusables(container).map((c) => c.textContent || (c as HTMLInputElement).labels?.[0]?.textContent || "");
    expect(names).toEqual([
      "Hide venues by name",
      "Find a venue",
      "Most parts first",
      "Lists an entrance",
      "Lists an elevator",
      "Lists a parking",
      "Lists a washroom",
      "Lists a ramp",
      "Only venues whose parts have different wheelchair tags",
      "Save Hall as text (.txt)",
      "Save the venues as text (.txt)",
      "Save the venues as a spreadsheet (CSV)",
    ]);
  });
  it("the order choice is one tab stop", () => {
    const { container } = render(<VenueGroups places={places} locale="en" />);
    openIt();
    const radios = [...container.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });
  it("every control is a button or an input, named, and none is a div or span acting as a button", () => {
    const { container } = render(<VenueGroups places={places} locale="en" />);
    openIt();
    for (const c of focusables(container)) {
      expect(["BUTTON", "INPUT"]).toContain(c.tagName);
      expect((c.textContent ?? "").trim() !== "" || ((c as HTMLInputElement).labels?.length ?? 0) > 0).toBe(true);
    }
    expect(container.querySelectorAll("div[role=button], span[role=button]")).toHaveLength(0);
  });
  it("keeps focus on the toggle when it opens", () => {
    render(<VenueGroups places={places} locale="en" />);
    const t = screen.getByRole("button", { name: "Show these places grouped into venues" });
    t.focus();
    fireEvent.click(t);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide venues by name" }));
  });
  it("changing the filter or saving never closes the panel", () => {
    render(<VenueGroups places={places} locale="en" onSave={() => true} />);
    openIt();
    fireEvent.click(screen.getByRole("checkbox", { name: /different wheelchair tags/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save the venues as text (.txt)" }));
    expect(screen.getByRole("button", { name: "Hide venues by name" })).toBeTruthy();
  });
  it("renders its buttons through the shared button", () => {
    const { container } = render(<VenueGroups places={places} locale="en" />);
    openIt();
    for (const b of container.querySelectorAll("button")) expect(b.className).toContain("btn");
  });
  it("the shared button rule gives at least 44px of height", () => {
    const m = /\.btn[^{]*\{[^}]*min-height:\s*(\d+)px/.exec(css);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });
});
