/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagNoteReads } from "./TagNoteReads";
import { tagNotePlaces } from "./tagNoteFixtures";

afterEach(cleanup);
const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};
const toggle = () => screen.getByRole("button", { name: /^(Show|Hide) tags and notes$/ });
const stops = () => [...document.querySelectorAll<HTMLElement>("button, input, select, [tabindex='0']")];

describe("TagNoteReads by keyboard", () => {
  it("opens and closes with Enter and Space and keeps focus on the toggle", () => {
    render(<TagNoteReads places={tagNotePlaces()} locale="en" />);
    const b = toggle();
    b.focus();
    press(b, "Enter");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(b);
    press(b, " ");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(b);
  });
  it("has the choices straight after the toggle and the save buttons last, with no positive tabindex", () => {
    render(<TagNoteReads places={tagNotePlaces()} locale="en" />);
    press(toggle(), "Enter");
    const s = stops();
    expect(s[0]).toBe(toggle());
    expect(s[1]!.tagName).toBe("INPUT");
    expect(s[s.length - 1]!.textContent).toBe("Save the list as a table (CSV)");
    for (const el of document.querySelectorAll("[tabindex]")) expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  });
  it("saves with Enter and with Space", () => {
    const onSave = vi.fn(() => true);
    render(<TagNoteReads places={tagNotePlaces()} locale="en" onSave={onSave} />);
    press(toggle(), "Enter");
    const b = screen.getByRole("button", { name: "Save the list as text" });
    b.focus();
    press(b, "Enter");
    press(b, " ");
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});
