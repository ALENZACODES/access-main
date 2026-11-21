/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { MeetUp } from "./MeetUp";
import { buildMeetUp } from "./meetUp";
import { MEET_UP_GEOJSON_FILENAMES, meetUpToGeoJson } from "./meetUpGeo";
import { place } from "./placeFixtures";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
const set = [place("a", { name: "Alpha", lat: 43.6501, lon: -79.395 }), place("b", { name: "Bravo", lat: 43.6501, lon: -79.365 }), place("c", { name: "Charlie", lat: 43.6501, lon: -79.38 })];

afterEach(cleanup);

function ready(onSave: (f: SavedFile) => boolean = () => true) {
  document.documentElement.lang = "en";
  render(<MeetUp places={set} locale="en" onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
  for (const [l, v] of [["First point latitude", "43.65"], ["First point longitude", "-79.4"], ["Second point latitude", "43.65"], ["Second point longitude", "-79.36"]] as const) fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
}
const pace = (who: "First" | "Second", v: string) => fireEvent.change(screen.getByLabelText(`${who} person pace in km/h`), { target: { value: v } });
const heads = () => screen.getAllByRole("columnheader").map((h) => h.textContent);
const cells = (name: string) => within(screen.getAllByRole("row").find((r) => within(r).queryByRole("rowheader")?.textContent === name)!).getAllByRole("cell").map((c) => c.textContent);

describe("MeetUp paces", () => {
  it("shows no time columns and no note until a pace is typed", () => {
    ready();
    expect(heads()).toEqual(["Position", "Place", "From the first point", "From the second point", "Nearer"]);
    expect(document.querySelector("[data-meet-up-pace-note]")).toBeNull();
  });
  it("adds two minimum-time columns when either person has a pace, with a dash for the other", () => {
    ready();
    pace("First", "5");
    expect(heads()).toHaveLength(7);
    const alpha = cells("Alpha");
    expect(alpha[3]).toBe("5\u00a0min");
    expect(alpha[4]).toBe("–");
    expect(document.querySelector("[data-meet-up-pace-note]")!.textContent).toMatch(/least a straight line/);
  });
  it("gives both columns for both paces, the slower person more minutes for the same distance", () => {
    ready();
    pace("First", "2");
    pace("Second", "4");
    const c = cells("Charlie");
    expect(c[3]).not.toBe("–");
    expect(c[4]).not.toBe("–");
    const mins = (s: string | null) => Number(/\d+/.exec(s ?? "")![0]);
    expect(mins(c[3]!)).toBeGreaterThan(mins(c[4]!));
  });
  it("accepts a decimal comma and rejects a pace out of range, naming the field", () => {
    ready();
    pace("First", "3,5");
    expect(heads()).toHaveLength(7);
    pace("Second", "20");
    expect(screen.getByText(/Type a pace from 0.5 to 8 km\/h/)).toBeTruthy();
    expect(screen.getByLabelText("Second person pace in km/h").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("First person pace in km/h").getAttribute("aria-invalid")).not.toBe("true");
    expect(heads()).toHaveLength(7);
  });
  it("does not change the order of the places", () => {
    ready();
    const order = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);
    const before = order();
    pace("First", "2");
    pace("Second", "6");
    expect(order()).toEqual(before);
  });
  it("has no axe violations with paces typed, one of them wrong", async () => {
    ready();
    pace("First", "3");
    pace("Second", "x");
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});

describe("MeetUp GeoJSON", () => {
  it("saves the same document the module makes, with the paces typed", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    ready(onSave);
    pace("First", "4");
    fireEvent.click(screen.getByRole("button", { name: "Save the points and places (GeoJSON)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe(MEET_UP_GEOJSON_FILENAMES.en);
    expect(file.mime).toBe("application/geo+json;charset=utf-8");
    expect(file.content).toBe(meetUpToGeoJson(buildMeetUp(set, A, B), A, B, set, { a: 4, b: null }));
    expect(JSON.parse(file.content).features).toHaveLength(6);
  });
  it("reports a failed save", () => {
    ready(() => false);
    fireEvent.click(screen.getByRole("button", { name: "Save the points and places (GeoJSON)" }));
    expect((document.querySelector("[data-meet-up-status]") as HTMLElement).textContent).toBe("This browser cannot save a file here.");
  });
});

describe("MeetUp paces in French", () => {
  it("labels the pace fields in French and every sentence passes lintFrench", () => {
    document.documentElement.lang = "fr";
    render(<MeetUp places={set} locale="fr" onSave={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: "Afficher les lieux de rencontre pour deux personnes" }));
    for (const [l, v] of [["Latitude du premier point", "43.65"], ["Longitude du premier point", "-79.4"], ["Latitude du deuxième point", "43.65"], ["Longitude du deuxième point", "-79.36"]] as const) fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
    fireEvent.change(screen.getByLabelText("Rythme de la première personne en km/h"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Rythme de la deuxième personne en km/h"), { target: { value: "4" } });
    const lines = [...document.querySelectorAll("p, caption, legend, label, button, th")].map((e) => e.textContent ?? "").filter(Boolean);
    expect(document.body.textContent).toMatch(/Saisissez un rythme de 0,5 à 8 km\/h/);
    for (const s of lines) expect(lintFrench(s), s).toEqual([]);
  });
});
