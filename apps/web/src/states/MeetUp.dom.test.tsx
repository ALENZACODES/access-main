/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { MeetUp } from "./MeetUp";
import { buildMeetUp } from "./meetUp";
import { MEET_UP_CSV_FILENAMES, MEET_UP_FILENAMES, meetUpToCsv, meetUpToText } from "./meetUpCopy";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const A = { lat: 43.65, lon: -79.4 };
const B = { lat: 43.65, lon: -79.36 };
const at = (id: string, name: string, lon: number) => place(id, { name, lat: 43.6501, lon });
const set = [at("a", "Alpha", -79.395), at("m", "Middle", -79.38), at("b", "Bravo", -79.365), at("z", "Zulu", -79.3), bare("none")];

afterEach(cleanup);

interface Over {
  places?: typeof set;
  locale?: "en" | "fr";
  from?: { lat: number; lon: number } | null;
  onSave?: (f: SavedFile) => boolean;
}
function show(over: Over = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<MeetUp places={over.places ?? set} locale={locale} from={over.from ?? null} onSave={over.onSave ?? (() => true)} />);
}
const toggle = () => fireEvent.click(screen.getByRole("button", { name: /^(Show|Hide) places for two|^(Afficher|Masquer) les lieux de rencontre/ }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fill = (a = A, b = B) => {
  type("First point latitude", String(a.lat));
  type("First point longitude", String(a.lon));
  type("Second point latitude", String(b.lat));
  type("Second point longitude", String(b.lon));
};
const names = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);
const status = () => (document.querySelector("[data-meet-up-status]") as HTMLElement).textContent;
const ready = (over: Over = {}) => {
  show(over);
  toggle();
  fill();
};

describe("MeetUp when there is little to meet about", () => {
  it("renders nothing for no places or one place", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [set[0]!] }).container.innerHTML).toBe("");
  });
  it("is closed to begin with: one button and no heading or fields", () => {
    show();
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.getByRole("region", { name: "Places for two people to meet" })).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Show places for two people to meet" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("First point latitude")).toBeNull();
    expect(document.querySelector("[data-meet-up]")!.getAttribute("data-meet-up")).toBe("closed");
  });
  it("opens and closes, and the button points at what it controls", () => {
    show();
    toggle();
    const btn = screen.getByRole("button", { name: "Hide places for two people to meet" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).toBeTruthy();
    expect(screen.getByLabelText("First point latitude")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Places for two people to meet" }).tagName).toBe("H3");
    toggle();
    expect(screen.queryByLabelText("First point latitude")).toBeNull();
  });
  it("asks for both points before it shows a list", () => {
    show();
    toggle();
    expect(document.querySelector("[data-meet-up-wait]")).toBeTruthy();
    type("First point latitude", "43.65");
    type("First point longitude", "-79.4");
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("MeetUp with two points", () => {
  it("lists the located places, balanced by default, and says how far apart the points are", () => {
    ready();
    expect(names()).toEqual(buildMeetUp(set, A, B).rows.map((r) => r.name));
    expect(names()[0]).toBe("Middle");
    expect(document.querySelector("[data-meet-up-apart]")!.textContent).toContain("apart in a straight line");
    expect(document.querySelector("[data-meet-up-count]")!.textContent).toContain("4 places measured from both points. 1 with no map point: UNKNOWN.");
  });
  it("has a captioned table with column headers and a keyboard-reachable scrolling region", () => {
    ready();
    expect(within(screen.getByRole("table")).getByText(/Showing 4 of 4 places/)).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.getByRole("region", { name: "Places by distance from both points" }).getAttribute("tabindex")).toBe("0");
  });
  it("changes the order with the radio group", () => {
    ready();
    fireEvent.click(screen.getByRole("radio", { name: "Nearest to the first point" }));
    expect(names()).toEqual(["Alpha", "Middle", "Bravo", "Zulu"]);
    fireEvent.click(screen.getByRole("radio", { name: "Nearest to the second point" }));
    expect(names()).toEqual(["Bravo", "Middle", "Alpha", "Zulu"]);
    expect(status()).toBe("Ordered by: Nearest to the second point. Showing 4 of 4.");
  });
  it("swapping the two points swaps the first-point and second-point orders", () => {
    ready();
    fireEvent.click(screen.getByRole("radio", { name: "Nearest to the first point" }));
    const before = names();
    fill(B, A);
    fireEvent.click(screen.getByRole("radio", { name: "Nearest to the second point" }));
    expect(names()).toEqual(before);
  });
  it("limits the list and says how many are not shown", () => {
    const many = Array.from({ length: 12 }, (_, i) => at(`p${i}`, `Place ${String(i).padStart(2, "0")}`, -79.4 + i * 0.004));
    ready({ places: many });
    expect(names()).toHaveLength(10);
    expect(document.querySelector("[data-meet-up-more]")!.textContent).toBe("2 more places are not shown. Save the file to see all of them.");
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    expect(names()).toHaveLength(5);
    expect(document.querySelector("[data-meet-up-more]")!.textContent).toContain("7 more");
    fireEvent.click(screen.getByRole("radio", { name: "25" }));
    expect(names()).toHaveLength(12);
    expect(document.querySelector("[data-meet-up-more]")).toBeNull();
  });
  it("shows the caveat and never calls a place good or accessible", () => {
    ready();
    expect(screen.getByText(/not routes/)).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b(best|recommended|accessible route|safe)\b/i);
  });
  it("puts UNKNOWN for a place with no name and keeps it last on a tie", () => {
    ready({ places: [at("a", "Alpha", -79.38), { ...at("n", "x", -79.38), name: null }] as typeof set });
    expect(names()).toEqual(["Alpha", "UNKNOWN"]);
  });
});

describe("MeetUp with a bad point", () => {
  it("says what a good point looks like and keeps the list away", () => {
    show();
    toggle();
    type("First point latitude", "95");
    type("First point longitude", "-79");
    type("Second point latitude", "43");
    type("Second point longitude", "-79");
    expect(screen.getByText(/latitude from -90 to 90/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    type("First point latitude", "43.6");
    expect(screen.queryByText(/latitude from -90 to 90/)).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();
  });
  it("flags only the pair with the mistake", () => {
    show();
    toggle();
    type("Second point latitude", "abc");
    type("Second point longitude", "1");
    expect(screen.getAllByText(/latitude from -90 to 90/)).toHaveLength(1);
    expect(screen.getByLabelText("Second point latitude").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("First point latitude").getAttribute("aria-invalid")).not.toBe("true");
  });
  it("accepts a French decimal comma", () => {
    show({ locale: "fr" });
    fireEvent.click(screen.getByRole("button", { name: "Afficher les lieux de rencontre pour deux personnes" }));
    type("Latitude du premier point", "43,65");
    type("Longitude du premier point", "-79,4");
    type("Latitude du deuxième point", "43,65");
    type("Longitude du deuxième point", "-79,36");
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("MeetUp and the near-me point", () => {
  it("offers the typed point only when there is one, and fills the first point from it", () => {
    show();
    toggle();
    expect(screen.queryByRole("button", { name: "Use the point typed above" })).toBeNull();
    cleanup();
    show({ from: { lat: 43.65, lon: -79.4 } });
    toggle();
    fireEvent.click(screen.getByRole("button", { name: "Use the point typed above" }));
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65000");
    expect((screen.getByLabelText("First point longitude") as HTMLInputElement).value).toBe("-79.40000");
    expect((screen.getByLabelText("Second point latitude") as HTMLInputElement).value).toBe("");
  });
});

describe("MeetUp files", () => {
  it("saves the text file with every located place, and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    ready({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the list (text)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe(MEET_UP_FILENAMES.en);
    expect(file.mime).toBe("text/plain;charset=utf-8");
    expect(file.content).toBe(meetUpToText(buildMeetUp(set, A, B), A, B, "en"));
    expect(status()).toBe(`Saved ${MEET_UP_FILENAMES.en}.`);
  });
  it("saves a CSV with all places even when only some are shown", () => {
    const many = Array.from({ length: 12 }, (_, i) => at(`p${i}`, `Place ${i}`, -79.4 + i * 0.004));
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    ready({ places: many, onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe(MEET_UP_CSV_FILENAMES.en);
    expect(file.content).toBe(meetUpToCsv(buildMeetUp(many, A, B), many, "en"));
    expect(file.content.split("\r\n").filter(Boolean)).toHaveLength(13);
  });
  it("says so when the browser cannot save, including when saving throws", () => {
    ready({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the list (text)" }));
    expect(status()).toBe("This browser cannot save a file here.");
    cleanup();
    ready({ onSave: () => { throw new Error("no"); } });
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    expect(status()).toBe("This browser cannot save a file here.");
  });
});

describe("MeetUp in French", () => {
  it("is marked as French, with French headings and buttons", () => {
    show({ locale: "fr" });
    expect(document.querySelector("[data-meet-up]")!.getAttribute("lang")).toBe("fr");
    fireEvent.click(screen.getByRole("button", { name: "Afficher les lieux de rencontre pour deux personnes" }));
    expect(screen.getByRole("heading", { name: "Lieux de rencontre pour deux personnes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Masquer les lieux de rencontre pour deux personnes" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Équilibré/ })).toBeTruthy();
  });
  it("every visible sentence passes lintFrench", () => {
    show({ locale: "fr" });
    fireEvent.click(screen.getByRole("button", { name: "Afficher les lieux de rencontre pour deux personnes" }));
    type("Latitude du premier point", "43.65");
    type("Longitude du premier point", "-79.4");
    type("Latitude du deuxième point", "43.65");
    type("Longitude du deuxième point", "-79.36");
    fireEvent.click(screen.getByRole("radio", { name: "Le plus proche du deuxième point" }));
    const lines = [...document.querySelectorAll("p, caption, legend, label, button, th")].map((e) => e.textContent ?? "").filter(Boolean);
    expect(lines.length).toBeGreaterThan(12);
    for (const s of lines) expect(lintFrench(s), s).toEqual([]);
  });
});

describe("MeetUp accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`${locale}: has no axe violations closed, open and with a list`, async () => {
      show({ locale });
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show places for two people to meet" : "Afficher les lieux de rencontre pour deux personnes" }));
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
      if (locale === "en") fill();
      else {
        type("Latitude du premier point", "43.65");
        type("Longitude du premier point", "-79.4");
        type("Latitude du deuxième point", "43.65");
        type("Longitude du deuxième point", "-79.36");
      }
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
    });
  }
  it("has no axe violations with a bad point showing", async () => {
    show();
    toggle();
    type("First point latitude", "zz");
    type("First point longitude", "1");
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});
