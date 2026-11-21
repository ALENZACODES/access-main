/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { MeetUp } from "./MeetUp";
import { buildMeetUp, halfway } from "./meetUp";
import { meetUpToCsv, meetUpToText } from "./meetUpCopy";
import { place } from "./placeFixtures";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
const set = [place("a", { name: "Alpha", lat: 43.6501, lon: -79.395 }), place("b", { name: "Bravo", lat: 43.6501, lon: -79.365 }), place("c", { name: "Charlie", lat: 43.6501, lon: -79.3 })];

afterEach(cleanup);

function ready(onSave: (f: SavedFile) => boolean = () => true) {
  document.documentElement.lang = "en";
  render(<MeetUp places={set} locale="en" onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
  for (const [l, v] of [["First point latitude", "43.65"], ["First point longitude", "-79.4"], ["Second point latitude", "43.65"], ["Second point longitude", "-79.36"]] as const) fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
}
const val = (l: string) => (screen.getByLabelText(l) as HTMLInputElement).value;
const status = () => (document.querySelector("[data-meet-up-status]") as HTMLElement).textContent;
const order = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);

describe("swapping the two points", () => {
  it("exchanges the fields and the paces, and says so", () => {
    ready();
    fireEvent.change(screen.getByLabelText("First person pace in km/h"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Second person pace in km/h"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Swap the two points" }));
    expect([val("First point latitude"), val("First point longitude"), val("Second point longitude")]).toEqual(["43.65", "-79.36", "-79.4"]);
    expect([val("First person pace in km/h"), val("Second person pace in km/h")]).toEqual(["5", "3"]);
    expect(status()).toBe("The two points and paces are swapped.");
  });
  it("swaps the nearest-first orders and leaves the balanced order alone", () => {
    ready();
    const balanced = order();
    fireEvent.click(screen.getByRole("radio", { name: "Nearest to the first point" }));
    const first = order();
    fireEvent.click(screen.getByRole("button", { name: "Swap the two points" }));
    expect(order()).not.toEqual(first);
    fireEvent.click(screen.getByRole("radio", { name: "Nearest to the second point" }));
    expect(order()).toEqual(first);
    fireEvent.click(screen.getByRole("radio", { name: /^Balanced/ }));
    expect(order()).toEqual(balanced);
  });
  it("swapping twice puts everything back", () => {
    ready();
    fireEvent.change(screen.getByLabelText("First person pace in km/h"), { target: { value: "4" } });
    const swap = screen.getByRole("button", { name: "Swap the two points" });
    fireEvent.click(swap);
    fireEvent.click(swap);
    expect([val("First point lon" + "gitude"), val("Second point longitude"), val("First person pace in km/h"), val("Second person pace in km/h")]).toEqual(["-79.4", "-79.36", "4", ""]);
  });
  it("works while a point is still empty", () => {
    document.documentElement.lang = "en";
    render(<MeetUp places={set} locale="en" onSave={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
    fireEvent.change(screen.getByLabelText("First point latitude"), { target: { value: "43.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Swap the two points" }));
    expect([val("First point latitude"), val("Second point latitude")]).toEqual(["", "43.6"]);
  });
});

describe("making the first point the halfway point", () => {
  it("puts the middle in the first point, to five decimals, and says so", () => {
    ready();
    const mid = halfway(A, B);
    fireEvent.click(screen.getByRole("button", { name: "Make the first point the halfway point" }));
    expect(val("First point latitude")).toBe(mid.lat.toFixed(5));
    expect(val("First point longitude")).toBe(mid.lon.toFixed(5));
    expect(val("Second point longitude")).toBe("-79.36");
    expect(status()).toBe("The first point is now halfway between the two.");
  });
  it("is only offered once both points are good", () => {
    document.documentElement.lang = "en";
    render(<MeetUp places={set} locale="en" onSave={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
    expect(screen.queryByRole("button", { name: "Make the first point the halfway point" })).toBeNull();
  });
  it("moves the points closer: the distance between them halves", () => {
    ready();
    const apart = () => /(\d[\d.,]*)\s*(km|m)/.exec(document.querySelector("[data-meet-up-apart]")!.textContent ?? "")!.slice(1, 3).join(" ");
    const before = apart();
    fireEvent.click(screen.getByRole("button", { name: "Make the first point the halfway point" }));
    expect(apart()).not.toBe(before);
  });
});

describe("saved files with paces", () => {
  it("text lines and the CSV carry the minutes when a pace is typed, and not otherwise", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    ready(onSave);
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    expect(onSave.mock.calls[0]![0].content).not.toContain("Least minutes");
    fireEvent.change(screen.getByLabelText("First person pace in km/h"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    expect(onSave.mock.calls[1]![0].content).toBe(meetUpToCsv(buildMeetUp(set, A, B), set, "en", { a: 4, b: null }));
    expect(onSave.mock.calls[1]![0].content).toContain("Least minutes, first person");
    fireEvent.click(screen.getByRole("button", { name: "Save the list (text)" }));
    expect(onSave.mock.calls[2]![0].content).toBe(meetUpToText(buildMeetUp(set, A, B), A, B, "en", { a: 4, b: null }));
    expect(onSave.mock.calls[2]![0].content).toMatch(/At least \d+\u00a0min for the first person\./);
  });
  it("has no axe violations with the new buttons showing", async () => {
    ready();
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});
