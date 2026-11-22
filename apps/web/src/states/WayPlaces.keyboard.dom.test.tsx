/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { WayPlaces } from "./WayPlaces";

afterEach(cleanup);

const set = [place("a", { name: "Aa", lat: 43.6501, lon: -79.39 }), place("b", { name: "Bb", lat: 43.6501, lon: -79.37 }), place("c", { name: "Cc", lat: 43.7, lon: -79.3 })];
const mount = () => render(<WayPlaces places={set} locale="en" from={{ lat: 43.65, lon: -79.4 }} onSave={() => true} />);
const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};
const openTool = () => fireEvent.click(screen.getByRole("button", { name: "Show places along a straight line" }));

describe("WayPlaces by keyboard", () => {
  it("opens with Enter and closes with Space on the button, which keeps focus", () => {
    mount();
    const btn = screen.getByRole("button", { name: "Show places along a straight line" });
    btn.focus();
    press(btn, "Enter");
    expect(screen.getByLabelText("First point latitude")).toBeTruthy();
    const hide = screen.getByRole("button", { name: "Hide places along a straight line" });
    expect(document.activeElement).toBe(hide);
    press(hide, " ");
    expect(screen.queryByLabelText("First point latitude")).toBeNull();
    expect(document.activeElement?.textContent).toMatch(/^Show places/);
  });

  it("copies the near-me point and adds a point in between with Enter", () => {
    mount();
    openTool();
    const use = screen.getByRole("button", { name: "Use the point typed above" });
    use.focus();
    press(use, "Enter");
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65000");
    const add = screen.getByRole("button", { name: "Add a point in between" });
    add.focus();
    press(add, "Enter");
    expect(screen.getByLabelText("Point in between 1 latitude")).toBeTruthy();
  });

  it("shows the width, tag and limit as radio groups, each with one tab stop", () => {
    mount();
    openTool();
    fireEvent.change(screen.getByLabelText("First point latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("First point longitude"), { target: { value: "-79.4" } });
    fireEvent.change(screen.getByLabelText("Second point latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("Second point longitude"), { target: { value: "-79.36" } });
    const groups = screen.getAllByRole("radiogroup");
    expect(groups.map((g) => g.getAttribute("aria-labelledby") !== null || g.getAttribute("aria-label") !== null)).toEqual([true, true, true]);
    for (const g of groups) {
      const tabbable = Array.from(g.querySelectorAll("input[type=radio]")).filter((r) => (r as HTMLInputElement).tabIndex >= 0);
      expect(tabbable).toHaveLength(1);
    }
  });

  it("lets the scrolling table be reached with Tab", () => {
    mount();
    openTool();
    fireEvent.change(screen.getByLabelText("First point latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("First point longitude"), { target: { value: "-79.4" } });
    fireEvent.change(screen.getByLabelText("Second point latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("Second point longitude"), { target: { value: "-79.36" } });
    expect(screen.getByRole("region", { name: "Places along the line" }).tabIndex).toBe(0);
  });
});
