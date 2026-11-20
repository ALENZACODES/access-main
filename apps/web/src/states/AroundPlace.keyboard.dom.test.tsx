/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AroundPlace } from "./AroundPlace";
import { crossroads } from "./aroundFixtures";
import type { SavedFile } from "./downloadFile";

afterEach(cleanup);

const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};
const mount = (onSave: (f: SavedFile) => boolean = () => true) => render(<AroundPlace places={crossroads()} locale="en" onSave={onSave} />);
const tabStops = () => [...document.querySelectorAll<HTMLElement>("button, input, select, [tabindex='0']")].filter((e) => !(e as HTMLButtonElement).disabled);

describe("AroundPlace by keyboard", () => {
  it("opens with Enter and with Space on the toggle, and keeps focus on it", () => {
    mount();
    const toggle = screen.getByRole("button", { name: "Show places around a place" });
    toggle.focus();
    press(toggle, "Enter");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(toggle);
    press(toggle, " ");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
  it("puts the place choice straight after the toggle in the tab order", () => {
    mount();
    const toggle = screen.getByRole("button", { name: "Show places around a place" });
    press(toggle, "Enter");
    const stops = tabStops();
    expect(stops[0]).toBe(toggle);
    expect(stops[1]).toBe(screen.getByLabelText("Place to look around"));
  });
  it("has no stop above tabindex 0 anywhere", () => {
    mount();
    press(screen.getByRole("button", { name: "Show places around a place" }), "Enter");
    fireEvent.change(screen.getByLabelText("Place to look around"), { target: { value: "centre" } });
    for (const el of document.querySelectorAll("[tabindex]")) expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  });
  it("chooses a place with the select, then a distance with the arrow keys on the radios", () => {
    mount();
    press(screen.getByRole("button", { name: "Show places around a place" }), "Enter");
    fireEvent.change(screen.getByLabelText("Place to look around"), { target: { value: "centre" } });
    const group = screen.getByRole("radiogroup", { name: "How far around" });
    const current = group.querySelector<HTMLInputElement>("input[type=radio]:checked")!;
    current.focus();
    fireEvent.keyDown(current, { key: "ArrowRight" });
    fireEvent.keyUp(current, { key: "ArrowRight" });
    expect(screen.getByText(/places? listed within 500/)).toBeTruthy();
  });
  it("toggles a tag filter with Space and shows the narrowed count", () => {
    mount();
    press(screen.getByRole("button", { name: "Show places around a place" }), "Enter");
    fireEvent.change(screen.getByLabelText("Place to look around"), { target: { value: "centre" } });
    const box = screen.getByRole("checkbox", { name: "Wheelchair tag: Limited" });
    box.focus();
    fireEvent.click(box);
    expect(screen.getByText(/1 shown after your filters/)).toBeTruthy();
    fireEvent.click(box);
    expect(screen.queryByText(/shown after your filters/)).toBeNull();
  });
  it("saves a file with Enter on the save button and says so in a live region", () => {
    const saved: SavedFile[] = [];
    mount((f) => (saved.push(f), true));
    press(screen.getByRole("button", { name: "Show places around a place" }), "Enter");
    fireEvent.change(screen.getByLabelText("Place to look around"), { target: { value: "centre" } });
    const save = screen.getByRole("button", { name: "Save as text (.txt)" });
    save.focus();
    press(save, "Enter");
    expect(saved).toHaveLength(1);
    const live = document.querySelector("[data-around-status]")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("Saved places-around-a-place.txt.");
    expect(document.activeElement).toBe(save);
  });
  it("announces the summary in a status region that changes when the list does", () => {
    mount();
    press(screen.getByRole("button", { name: "Show places around a place" }), "Enter");
    fireEvent.change(screen.getByLabelText("Place to look around"), { target: { value: "centre" } });
    const status = document.querySelector("[data-around-summary]")!;
    expect(status.getAttribute("role")).toBe("status");
    const before = status.textContent;
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "N" } });
    expect(status.textContent).not.toBe(before);
  });
});
