/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoteTopics } from "./NoteTopics";
import { topicSet } from "./noteTopicFixtures";
import type { SavedFile } from "./downloadFile";

afterEach(cleanup);

const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};
const mount = (onSave: (f: SavedFile) => boolean = () => true) => render(<NoteTopics places={topicSet()} locale="en" onSave={onSave} />);
const toggle = () => screen.getByRole("button", { name: /^(Show|Hide) the words in the notes$/ });
const stops = () => [...document.querySelectorAll<HTMLElement>("button, input, select, [tabindex='0']")].filter((e) => !(e as HTMLButtonElement).disabled);

describe("NoteTopics by keyboard", () => {
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
  it("puts the first word choice straight after the toggle in the tab order", () => {
    mount();
    press(toggle(), "Enter");
    const s = stops();
    expect(s[0]).toBe(toggle());
    expect(s[1]).toBe(screen.getByRole("checkbox", { name: "Steps and stairs (3 places)" }));
  });
  it("has no tab stop above 0", () => {
    mount();
    press(toggle(), "Enter");
    for (const el of document.querySelectorAll("[tabindex]")) expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  });
  it("toggles a word with the keyboard and keeps focus on it", () => {
    mount();
    press(toggle(), "Enter");
    const box = screen.getByRole("checkbox", { name: "Ramps and slopes (2 places)" });
    box.focus();
    fireEvent.click(box);
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(within(screen.getByRole("list", { name: "Notes" })).getAllByRole("listitem")).toHaveLength(2);
    expect(document.activeElement).toBe(box);
    fireEvent.click(box);
    expect((box as HTMLInputElement).checked).toBe(false);
  });
  it("announces the count in a status region as the choice changes", () => {
    mount();
    press(toggle(), "Enter");
    const status = document.querySelector("[data-note-topics-summary]")!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("Showing all 8 notes.");
    fireEvent.click(screen.getByRole("checkbox", { name: "Ramps and slopes (2 places)" }));
    expect(status.textContent).toBe("Showing 2 of 8 notes.");
  });
  it("saves with Enter and says so in a polite live region, keeping focus on the button", () => {
    const saved: SavedFile[] = [];
    mount((f) => (saved.push(f), true));
    press(toggle(), "Enter");
    const save = screen.getByRole("button", { name: "Save as text (.txt)" });
    save.focus();
    press(save, "Enter");
    expect(saved).toHaveLength(1);
    const live = document.querySelector("[data-note-topics-status]")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("Saved pack-note-words.txt.");
    expect(document.activeElement).toBe(save);
  });
  it("gives the table a caption and scoped headers, so it reads by row and by column", () => {
    mount();
    press(toggle(), "Enter");
    const table = screen.getByRole("table");
    expect(table.querySelector("caption")!.textContent).toBe("Places by word and wheelchair tag");
    for (const th of table.querySelectorAll("thead th")) expect(th.getAttribute("scope")).toBe("col");
    for (const th of table.querySelectorAll("tbody th")) expect(th.getAttribute("scope")).toBe("row");
  });
});
