/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SameName } from "./SameName";
import { place } from "./placeFixtures";

afterEach(cleanup);

const set = [place("a", { name: "Shop", lon: -79.4 }), place("b", { name: "Shop", lon: -79.3 }), place("c", { name: "Hall", lon: -79.2 }), place("d", { name: "hall", lon: -79.1 })];
const mount = () => render(<SameName places={set} locale="en" from={{ lat: 43.65, lon: -79.4 }} onSave={() => true} />);
const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};

describe("SameName by keyboard", () => {
  it("opens with Enter and closes with Space on the same button, keeping focus on it", () => {
    mount();
    const btn = screen.getByRole("button", { name: "Show places that share a name" });
    btn.focus();
    press(btn, "Enter");
    const hide = screen.getByRole("button", { name: "Hide places that share a name" });
    expect(document.activeElement).toBe(hide);
    press(hide, " ");
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(document.activeElement?.textContent).toMatch(/^Show places/);
  });
  it("has four radio groups, each with a single tab stop, and one selected radio in each", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show places that share a name" }));
    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(4);
    for (const g of groups) {
      expect(g.querySelectorAll<HTMLInputElement>("input[type=radio]:not([tabindex='-1'])").length).toBeLessThanOrEqual(1);
      expect([...g.querySelectorAll<HTMLInputElement>("input[type=radio]")].filter((r) => r.checked)).toHaveLength(1);
    }
  });
  it("starts with most places first, two or more, all names, ten shown", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show places that share a name" }));
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked).map((r) => (r as HTMLInputElement).value)).toEqual(["count", "2", "all", "10"]);
  });
  it("saves with Enter and with Space, and reports it", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show places that share a name" }));
    const save = screen.getByRole("button", { name: "Save the list (text)" });
    save.focus();
    press(save, "Enter");
    expect((document.querySelector("[data-same-name-status]") as HTMLElement).textContent).toMatch(/^Saved /);
    const csv = screen.getByRole("button", { name: "Save the list (CSV)" });
    csv.focus();
    press(csv, " ");
    expect((document.querySelector("[data-same-name-status]") as HTMLElement).textContent).toMatch(/\.csv\.$/);
  });
  it("keeps the controls in reading order: order, size, which names, how many, then the list and the buttons", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show places that share a name" }));
    const all = [...document.querySelectorAll<HTMLElement>("[role=radiogroup], [data-same-name-list], [role=group][aria-label]")];
    const kinds = all.map((e) => (e.getAttribute("role") === "radiogroup" ? "radios" : e.hasAttribute("data-same-name-list") ? "list" : "actions"));
    expect(kinds).toEqual(["radios", "radios", "radios", "radios", "list", "actions"]);
  });
});
