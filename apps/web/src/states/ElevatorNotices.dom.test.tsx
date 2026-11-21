/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { ElevatorNotices } from "./ElevatorNotices.tsx";
import { manyNotices } from "./elevatorFixtures.ts";
import { lcg } from "./placeFixtures.ts";
import type { Locale } from "./stateCopy.ts";

const pack = (JSON.parse(contentText) as { elevator_status: unknown[] }).elevator_status;
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const TODAY = "2026-11-21";

function show(notices: unknown, locale: Locale = "en", today = TODAY) {
  document.documentElement.lang = locale;
  return render(<ElevatorNotices notices={notices} locale={locale} today={today} />);
}
const open = (locale: Locale = "en") => fireEvent.click(screen.getByRole("button", { name: locale === "fr" ? "Chercher, filtrer et enregistrer les avis" : "Search, filter and save the notices" }));
const count = () => document.querySelector("[data-elevator-count]")?.textContent;
const stations = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const search = (v: string, locale: Locale = "en") => fireEvent.change(screen.getByLabelText(locale === "fr" ? "Chercher dans les avis" : "Search the notices"), { target: { value: v } });

afterEach(cleanup);

describe("the saved notices as first shown", () => {
  it("has a heading, the lead and the count, and no tool open", () => {
    show(pack);
    expect(screen.getByRole("heading", { level: 2, name: "Saved elevator notices" })).toBeTruthy();
    expect(document.body.textContent).toContain("They are not live and may be out of date.");
    expect(count()).toBe("3 notices shown.");
    expect(screen.queryByLabelText("Search the notices")).toBeNull();
    expect(screen.getByRole("button", { name: "Search, filter and save the notices" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("lists the stations as level 3 headings, with no heading skipped", () => {
    show(pack);
    expect(stations()).toEqual(["Cedarvale", "Finch", "Pape"]);
    expect(screen.queryAllByRole("heading").map((h) => h.tagName)).toEqual(["H2", "H3", "H3", "H3"]);
  });
  it("shows the operator's words as written, in a paragraph of their own", () => {
    show(pack);
    expect(screen.getByText("Finch: Elevator out of service between GO and YRT bus platform and fares concourse while we perform maintenance.").tagName).toBe("P");
  });
  it("shows what was read beside the words", () => {
    show(pack);
    const pape = within(document.querySelector('[data-station="Pape"]') as HTMLElement);
    expect(pape.getByText("8D1L")).toBeTruthy();
    expect(pape.getByText("Out of service")).toBeTruthy();
    expect(pape.getByText("Maintenance")).toBeTruthy();
    expect(pape.getByText("Pape Ave entrance, concourse and Line 2 westbound platform")).toBeTruthy();
  });
  it("shows no elevator label for Finch, which gives none", () => {
    show(pack);
    const finch = within(document.querySelector('[data-station="Finch"]') as HTMLElement);
    expect(finch.queryByText("Elevator")).toBeNull();
    expect(finch.getByText("The notice says")).toBeTruthy();
  });
  it("says how long ago each was checked and that it is a saved copy", () => {
    show(pack);
    expect(screen.getAllByText("Last checked on 13 November 2026, 8 days before today. This is a saved copy.")).toHaveLength(3);
  });
  it("gives the source, licence, date and tier of each", () => {
    show(pack);
    expect(screen.getAllByText("Source: TTC GTFS-Realtime accessibility alerts. Licence: OGL-Toronto-1.0. Retrieved 13 November 2026. Tier 0, saved copy.")).toHaveLength(3);
  });
  it("lists the stop ids", () => {
    show(pack);
    expect(screen.getByText("Stop ids in the notice: 13746, 13745.")).toBeTruthy();
  });
  it("tags each notice with its age band", () => {
    show(pack);
    for (const li of document.querySelectorAll("li[data-band]")) expect(li.getAttribute("data-band")).toBe("older");
  });
  it("declares the page language", () => {
    show(pack, "fr");
    expect(document.querySelector("[data-elevator-notices]")?.getAttribute("lang")).toBe("fr");
  });
  it("marks the language of a notice in the other language", () => {
    show([{ id: "f", station: "Pape", operator_text: "Pape : Ascenseur 3 hors service", operator_text_language: "fr", checked_at: "2026-11-20T10:00:00Z" }]);
    expect(screen.getByText("Pape : Ascenseur 3 hors service").getAttribute("lang")).toBe("fr");
    expect(screen.getByText("The notice is in French.")).toBeTruthy();
  });
  it("says a notice was not read into parts, and still shows its words", () => {
    show([{ id: "x", station: "Pape", operator_text: "Planned work this weekend.", checked_at: "2026-11-20T10:00:00Z" }]);
    expect(screen.getByText("Planned work this weekend.")).toBeTruthy();
    expect(screen.getByText("These words were not read into parts. They are shown as written.")).toBeTruthy();
    expect(document.querySelector("dl")).toBeNull();
  });
});

describe("nothing or little to show", () => {
  it("renders nothing for no list, an empty list or a list that is not a list", () => {
    for (const v of [null, undefined, [], {}, "x", 3]) {
      const { container } = show(v);
      expect(container.innerHTML, String(v)).toBe("");
      cleanup();
    }
  });
  it("says so when records could not be read, with no tools to open", () => {
    show([null, 5]);
    expect(screen.getByText("2 saved records could not be read and are not shown.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(count()).toBe("No elevator notices are saved.");
  });
  it("notes dropped records beside shown ones", () => {
    show([...pack, null]);
    expect(screen.getByText("1 saved record could not be read and is not shown.")).toBeTruthy();
    expect(stations()).toHaveLength(3);
  });
  it("shows a station with no name under a plain heading", () => {
    show([{ id: "a", operator_text: "Elevator 1 out of service" }]);
    expect(stations()).toEqual(["Station not named"]);
    expect(screen.getByText("The time this notice was last checked is not recorded.")).toBeTruthy();
  });
  it("renders hostile text as text", () => {
    const { container } = show([{ id: "h", station: "<b>x</b>", operator_text: "<img src=x onerror=alert(1)>", checked_at: "2026-11-20T10:00:00Z" }]);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("the tools", () => {
  it("open on the button, with the button saying so", () => {
    show(pack);
    open();
    const b = screen.getByRole("button", { name: "Hide search and saving" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Search the notices")).toBeTruthy();
  });
  it("close again and drop the fields", () => {
    show(pack);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Hide search and saving" }));
    expect(screen.queryByLabelText("Search the notices")).toBeNull();
  });
  it("tie the button to the region it opens", () => {
    show(pack);
    const b = screen.getByRole("button", { name: "Search, filter and save the notices" });
    const id = b.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toBeTruthy();
  });
  it("add no heading when open", () => {
    show(pack);
    open();
    expect(screen.queryAllByRole("heading")).toHaveLength(4);
  });
  it("keep the search after the tools are closed", () => {
    show(pack);
    open();
    search("pape");
    fireEvent.click(screen.getByRole("button", { name: "Hide search and saving" }));
    expect(stations()).toEqual(["Pape"]);
  });
});

describe("searching, filtering and sorting", () => {
  it("narrows the stations and the count", () => {
    show(pack);
    open();
    search("finch");
    expect(stations()).toEqual(["Finch"]);
    expect(count()).toBe("1 of 3 notices shown.");
  });
  it("finds by stop id", () => {
    show(pack);
    open();
    search("16069");
    expect(stations()).toEqual(["Cedarvale"]);
  });
  it("says when nothing matches and brings every notice back when cleared", () => {
    show(pack);
    open();
    search("zzz");
    expect(stations()).toEqual([]);
    expect(count()).toBe("No notices match. 3 saved.");
    search("");
    expect(stations()).toHaveLength(3);
  });
  it("offers only the age bands that hold a notice, with counts", () => {
    show(pack);
    open();
    expect(screen.getByRole("radio", { name: "Any time" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Checked more than a week ago (3)" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Checked today/ })).toBeNull();
  });
  it("filters by band", () => {
    const rnd = lcg(3);
    const set = manyNotices(20, rnd).map((n) => ({ id: n.id, station: n.station, operator_text: n.text, checked_at: n.checkedAt }));
    show(set);
    open();
    const radios = screen.getAllByRole("radio").filter((r) => /\(\d+\)/.test(r.closest("label")?.textContent ?? ""));
    expect(radios.length).toBeGreaterThan(1);
    const before = count();
    fireEvent.click(radios[0]!);
    expect(count()).not.toBe(before);
  });
  it("sorts by oldest and newest check", () => {
    show([
      { id: "a", station: "Union", operator_text: "Elevator 1 out of service", checked_at: "2026-11-10T10:00:00Z" },
      { id: "b", station: "Finch", operator_text: "Elevator 2 out of service", checked_at: "2026-11-20T10:00:00Z" },
    ]);
    open();
    expect(stations()).toEqual(["Finch", "Union"]);
    fireEvent.click(screen.getByRole("radio", { name: "Longest since checked first" }));
    expect(stations()).toEqual(["Union", "Finch"]);
    fireEvent.click(screen.getByRole("radio", { name: "Most recently checked first" }));
    expect(stations()).toEqual(["Finch", "Union"]);
  });
  it("is all in French for fr", () => {
    show(pack, "fr");
    open("fr");
    search("pape", "fr");
    expect(count()).toBe("1 avis affichés sur 3.");
    expect(screen.getByRole("radio", { name: "N’importe quand" })).toBeTruthy();
  });
});

describe("saving", () => {
  let blobs: Blob[];
  let names: string[];
  beforeEach(() => {
    blobs = [];
    names = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
  });
  afterEach(() => vi.restoreAllMocks());
  const read = (b: Blob) =>
    new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsText(b);
    });

  it("saves a text page named for the day, and says so", async () => {
    show(pack);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    });
    expect(names).toEqual(["elevator-notices-2026-11-21.txt"]);
    expect(await read(blobs[0]!)).toContain("Saved elevator notices");
    expect(document.querySelector("[data-elevator-saved]")?.textContent).toBe("Saved elevator-notices-2026-11-21.txt.");
  });
  it("saves a CSV with a byte order mark and one row per shown notice", async () => {
    show(pack);
    open();
    search("pape");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    });
    const csv = await read(blobs[0]!);
    expect(names).toEqual(["elevator-notices-2026-11-21.csv"]);
    expect(blobs[0]?.type).toContain("text/csv");
    expect(csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(csv).toContain("Pape");
    expect(csv).not.toContain("Cedarvale");
  });
  it("says so when the browser cannot make a file", () => {
    URL.createObjectURL = undefined as unknown as typeof URL.createObjectURL;
    show(pack);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(document.querySelector("[data-elevator-saved]")?.textContent).toBe("This browser could not make a file here.");
  });
  it("clears the saved line as a new save is made", async () => {
    show(pack);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    });
    expect(document.querySelector("[data-elevator-saved]")?.textContent).toBe("Saved elevator-notices-2026-11-21.csv.");
  });
});

describe("accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations, closed and open, in ${locale}`, async () => {
      show(pack, locale);
      expect((await axe.run(document.body, axeRules)).violations.map((v) => v.id)).toEqual([]);
      open(locale);
      expect((await axe.run(document.body, axeRules)).violations.map((v) => v.id)).toEqual([]);
    });
  }
  it("has no axe violations with a search that finds nothing", async () => {
    show(pack);
    open();
    search("zzz");
    expect((await axe.run(document.body, axeRules)).violations.map((v) => v.id)).toEqual([]);
  });
  it("has no axe violations with unread and unnamed notices", async () => {
    show([{ id: "a", operator_text: "Planned work." }, { id: "b" }, null]);
    expect((await axe.run(document.body, axeRules)).violations.map((v) => v.id)).toEqual([]);
  });
  it("uses polite live lines and no status role, so the page's own status stays the only one", () => {
    show(pack);
    expect(document.querySelector("[data-elevator-count]")?.getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("has the radio groups labelled", () => {
    show(pack);
    open();
    expect(screen.getByRole("radiogroup", { name: "When it was last checked" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Order" })).toBeTruthy();
  });
});
