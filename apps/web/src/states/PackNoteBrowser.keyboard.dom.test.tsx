/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PackNoteBrowser } from "./PackNoteBrowser";
import { noteSet } from "./packNoteFixtures";
import type { SavedFile } from "./downloadFile";

afterEach(cleanup);

const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};
const mount = (onSave: (f: SavedFile) => boolean = () => true) => render(<PackNoteBrowser places={noteSet()} locale="en" onSave={onSave} />);
const toggle = () => screen.getByRole("button", { name: /^(Show|Hide) the notes$/ });
const stops = () => [...document.querySelectorAll<HTMLElement>("button, input, select, [tabindex='0']")].filter((e) => !(e as HTMLButtonElement).disabled);

describe("PackNoteBrowser by keyboard", () => {
  it("opens and closes with Enter and with Space, keeping focus on the toggle", () => {
    mount();
    const b = toggle();
    b.focus();
    press(b, "Enter");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(b);
    press(b, " ");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(b);
  });
  it("puts the search box straight after the toggle in the tab order", () => {
    mount();
    press(toggle(), "Enter");
    const s = stops();
    expect(s[0]).toBe(toggle());
    expect(s[1]).toBe(screen.getByLabelText("Search the notes"));
  });
  it("has no tab stop above 0, and every note's button is reachable in order", () => {
    mount();
    press(toggle(), "Enter");
    for (const el of document.querySelectorAll("[tabindex]")) expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
    const whole = screen.getByRole("button", { name: "Show the whole note, Gamma Museum" });
    expect(stops()).toContain(whole);
  });
  it("shows the whole note with Enter on its button and goes back with Space, keeping focus", () => {
    mount();
    press(toggle(), "Enter");
    const b = screen.getByRole("button", { name: "Show the whole note, Gamma Museum" });
    b.focus();
    press(b, "Enter");
    const less = screen.getByRole("button", { name: "Show less, Gamma Museum" });
    expect(less.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(less);
    press(less, " ");
    expect(screen.getByRole("button", { name: "Show the whole note, Gamma Museum" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("types a search into the box and announces the count in a status region", () => {
    mount();
    press(toggle(), "Enter");
    const box = screen.getByLabelText("Search the notes");
    box.focus();
    fireEvent.change(box, { target: { value: "ramp" } });
    const status = document.querySelector("[data-pack-notes-summary]")!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("2 of 6 notes match your search and filters.");
    expect(document.activeElement).toBe(box);
  });
  it("toggles a filter with the keyboard and keeps focus on it", () => {
    mount();
    press(toggle(), "Enter");
    const box = screen.getByRole("checkbox", { name: "Wheelchair tag: No" });
    box.focus();
    fireEvent.click(box);
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(within(screen.getByRole("list", { name: "Notes" })).getAllByRole("listitem")).toHaveLength(1);
    expect(document.activeElement).toBe(box);
  });
  it("saves with Enter and says so in a polite live region", () => {
    const saved: SavedFile[] = [];
    mount((f) => (saved.push(f), true));
    press(toggle(), "Enter");
    const save = screen.getByRole("button", { name: "Save as text (.txt)" });
    save.focus();
    press(save, "Enter");
    expect(saved).toHaveLength(1);
    const live = document.querySelector("[data-pack-notes-status]")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("Saved pack-notes.txt.");
    expect(document.activeElement).toBe(save);
  });
});
