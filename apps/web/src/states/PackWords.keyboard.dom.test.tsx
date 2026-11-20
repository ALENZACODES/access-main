/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackSearchWords, PackWordList } from "./PackWords";
import { place } from "./placeFixtures";
import { searchPlaces } from "./packSearchFixtures";

afterEach(cleanup);
const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};
const toggle = () => screen.getByRole("button", { name: /^(Show|Hide) the words$/ });
const stops = () => [...document.querySelectorAll<HTMLElement>("button, input, select, [tabindex='0']")];
const places = [...searchPlaces(), place("s1", { name: "Starbucks", category: "cafe" })];

describe("PackWordList by keyboard", () => {
  it("opens and closes with Enter and Space and keeps focus on the toggle", () => {
    render(<PackWordList places={places} locale="en" onTry={() => undefined} />);
    const b = toggle();
    b.focus();
    press(b, "Enter");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(b);
    press(b, " ");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(b);
  });
  it("puts the choice of where to look right after the toggle, then the words, in the tab order", () => {
    render(<PackWordList places={places} locale="en" onTry={() => undefined} />);
    press(toggle(), "Enter");
    const s = stops();
    expect(s[0]).toBe(toggle());
    expect(s[1]!.tagName).toBe("INPUT");
    const wordButtons = s.filter((e) => /^Search for /.test(e.getAttribute("aria-label") ?? ""));
    expect(wordButtons.length).toBeGreaterThan(5);
    expect(s.indexOf(wordButtons[0]!)).toBeGreaterThan(s.indexOf(s[1]!));
    for (const el of document.querySelectorAll("[tabindex]")) expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  });
  it("searches for a word with Enter and with Space", () => {
    const onTry = vi.fn();
    render(<PackWordList places={places} locale="en" onTry={onTry} />);
    press(toggle(), "Enter");
    const b = screen.getByRole("button", { name: "Search for “street”" });
    b.focus();
    press(b, "Enter");
    press(b, " ");
    expect(onTry).toHaveBeenCalledTimes(2);
    expect(onTry).toHaveBeenLastCalledWith("street");
  });
  it("saves a file with the keyboard", () => {
    const onSave = vi.fn(() => true);
    render(<PackWordList places={places} locale="en" onTry={() => undefined} onSave={onSave} />);
    press(toggle(), "Enter");
    const b = screen.getByRole("button", { name: "Save the words as text" });
    b.focus();
    press(b, "Enter");
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("PackSearchWords by keyboard", () => {
  it("uses a replacement word with Enter and with Space", () => {
    const onUse = vi.fn();
    render(<PackSearchWords places={places} text="starbuks" locale="en" onUse={onUse} />);
    const b = screen.getByRole("button", { name: "Search for “starbucks”" });
    b.focus();
    press(b, "Enter");
    press(b, " ");
    expect(onUse).toHaveBeenCalledTimes(2);
    expect(onUse).toHaveBeenLastCalledWith("starbucks");
  });
  it("takes no focus away from the search box when it appears", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const { rerender } = render(<PackSearchWords places={places} text="" locale="en" onUse={() => undefined} />);
    rerender(<PackSearchWords places={places} text="starbuks" locale="en" onUse={() => undefined} />);
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
