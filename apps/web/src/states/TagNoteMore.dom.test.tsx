/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { withNote } from "./noteTopicFixtures";
import type { Locale } from "./stateCopy";
import { checkPlaces } from "./tagNoteCheck";
import { findingsToCsv } from "./tagNoteExport";
import { TagNoteCheck } from "./TagNoteCheck";
import { TagNoteEarlier } from "./TagNoteEarlier";
import { TagNoteSpread } from "./TagNoteSpread";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const places = () => [
  withNote("a", "Two steps at the door.", { wheelchair: "yes", name: "Alpha", category: "cafe" }),
  withNote("b", "Ramp at the side.", { wheelchair: "yes", name: "Beta", category: "cafe" }),
  withNote("c", "Step free entrance.", { wheelchair: "no", name: "Gamma", category: "library" }),
  withNote("d", "Ramp.", { wheelchair: "yes", name: "Delta", category: "library" }),
  withNote("e", "Two steps.", { wheelchair: "yes", name: "Epsilon", category: "library" }),
];

afterEach(cleanup);

describe("TagNoteSpread", () => {
  const show = (over: { places?: ReturnType<typeof places>; locale?: Locale; onSave?: (f: SavedFile) => void } = {}) => render(<TagNoteSpread places={over.places ?? places()} locale={over.locale ?? "en"} onSave={over.onSave ?? (() => undefined)} />);
  const body = (c: HTMLElement) => [...c.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((x) => x.textContent));

  it("shows a table with a caption, column headers and a row header per kind", () => {
    const { container } = show();
    expect(container.querySelector("caption")!.textContent).toBe("Places with a note, by kind");
    expect([...container.querySelectorAll("thead th")].every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect([...container.querySelectorAll("tbody th")].every((th) => th.getAttribute("scope") === "row")).toBe(true);
  });
  it("counts compared places, differences, clear cases and share", () => {
    const { container } = show();
    expect(body(container)).toEqual([
      ["library", "3", "2", "2", "67%"],
      ["cafe", "2", "1", "1", "50%"],
    ]);
  });
  it("totals the kinds", () => {
    show();
    expect(screen.getByText("2 of 2 kinds have at least one place that points different ways (3 of 5 compared).")).toBeTruthy();
  });
  it("orders by share and by name", () => {
    const { container } = show();
    fireEvent.click(screen.getByRole("radio", { name: "Highest share first" }));
    expect(body(container).map((r) => r[0])).toEqual(["library", "cafe"]);
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    expect(body(container).map((r) => r[0])).toEqual(["cafe", "library"]);
  });
  it("says so when no place can be compared", () => {
    const { container } = show({ places: [withNote("a", null, { wheelchair: "yes" })] as ReturnType<typeof places> });
    expect(screen.getByText("No place has a yes or no tag and a note, so there is nothing to group.")).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });
  it("saves the table in the order shown", () => {
    const onSave = vi.fn<(f: SavedFile) => void>();
    show({ onSave });
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the kinds as a CSV file" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].name).toBe("tag-and-note-by-kind.csv");
    expect(onSave.mock.calls[0]![0].content.split("\r\n")[1]).toBe("cafe,2,1,1,50");
  });
  it("uses a non-breaking space before the percent sign in French", () => {
    const { container } = show({ locale: "fr" });
    expect(container.querySelector("tbody td:last-child")!.textContent).toMatch(/\d\u00a0%$/);
    for (const el of container.querySelectorAll<HTMLElement>("p, th, caption, label")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations in ${locale}`, async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
});

describe("TagNoteEarlier", () => {
  const csvOf = (ps: ReturnType<typeof places>) => findingsToCsv(checkPlaces(ps).findings, { bom: true });
  const HEADER = "place_id,place_name,wheelchair_tag,kind,weight,words_against_tag,words_with_tag,note\r\n";
  const show = (over: { locale?: Locale; places?: ReturnType<typeof places> } = {}) => {
    const r = render(<TagNoteEarlier places={over.places ?? places()} locale={over.locale ?? "en"} />);
    return { ...r, area: r.container.querySelector("textarea")!, compare: () => fireEvent.click(screen.getAllByRole("button")[0]!) };
  };
  const paste = (area: HTMLTextAreaElement, text: string) => fireEvent.change(area, { target: { value: text } });

  it("has a labelled text box and a Compare and a Clear button", () => {
    const { area } = show();
    expect(screen.getByLabelText("Earlier tag-and-note file, pasted as text")).toBe(area);
    expect(screen.getByRole("button", { name: "Compare" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
  });
  it("has no file input", () => {
    expect(show().container.querySelector("input[type=file]")).toBeNull();
  });
  it("says what is new, changed and gone", () => {
    const earlier = csvOf([withNote("a", "Two steps at the door.", { wheelchair: "yes", name: "Alpha" }), withNote("z", "Two steps.", { wheelchair: "yes", name: "Zulu" })]);
    const { container, area, compare } = show();
    paste(area, earlier);
    compare();
    expect(screen.getByText("2 new, 0 changed, 1 no longer, 1 the same.")).toBeTruthy();
    const items = [...container.querySelectorAll("[data-tag-note-earlier-list] li")].map((li) => li.querySelector("strong")!.textContent);
    expect(items).toEqual(["Epsilon", "Gamma", "Zulu"]);
    expect(container.querySelector("[data-tag-note-earlier-list]")!.textContent).not.toContain("Alpha");
  });
  it("does nothing until Compare is pressed", () => {
    const { container, area } = show();
    paste(area, csvOf(places()));
    expect(container.querySelector("[data-tag-note-earlier-list]")).toBeNull();
  });
  it("marks a changed note", () => {
    const earlier = csvOf([withNote("a", "Two stairs at the door.", { wheelchair: "yes", name: "Alpha" })]);
    const { container, area, compare } = show({ places: [withNote("a", "Two steps at the door.", { wheelchair: "yes", name: "Alpha" })] as ReturnType<typeof places> });
    paste(area, earlier);
    compare();
    expect(container.querySelector("li")!.textContent).toContain("Changed");
  });
  it("counts the same places when nothing differs", () => {
    const same = [withNote("a", "Two steps.", { wheelchair: "yes", name: "Alpha" })] as ReturnType<typeof places>;
    const { area, compare, container } = show({ places: same });
    paste(area, csvOf(same));
    compare();
    expect(screen.getByText("0 new, 0 changed, 0 no longer, 1 the same.")).toBeTruthy();
    expect(container.querySelector("[data-tag-note-earlier-list]")?.children.length ?? 0).toBe(0);
  });
  it("says so when neither side has a difference", () => {
    const none = [withNote("a", "Ramp.", { wheelchair: "yes" })] as ReturnType<typeof places>;
    const { area, compare } = show({ places: none });
    paste(area, HEADER + "q,,yes,yes-but-barrier,one-sided,,,n\r\n");
    compare();
    expect(screen.getByText(/1 no longer/)).toBeTruthy();
  });
  it("asks for some text when the box is empty", () => {
    const { compare } = show();
    compare();
    expect(screen.getByRole("status").textContent).toBe("Paste some text first.");
  });
  it("refuses text that is not a tag-and-note file", () => {
    const { area, compare } = show();
    paste(area, "place_id,place_name\r\na,b\r\n");
    compare();
    expect(screen.getByRole("status").textContent).toBe("This is not a tag-and-note file saved by the App.");
  });
  it("explains a file with a problem", () => {
    const { area, compare } = show();
    paste(area, HEADER);
    compare();
    expect(screen.getByRole("status").textContent).toBe("The file has a header but no places.");
  });
  it("clears the text and the result", () => {
    const { area, compare, container } = show();
    paste(area, csvOf(places()));
    compare();
    expect(container.querySelector("[data-tag-note-earlier-list]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(area.value).toBe("");
    expect(container.querySelector("[data-tag-note-earlier-list]")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });
  it("counts rows it could not use", () => {
    const { area, compare } = show();
    paste(area, csvOf(places()) + "bad,row\r\n");
    compare();
    expect(screen.getByText("1 row was left out because it could not be read.")).toBeTruthy();
  });
  it("shows at most twenty and says how many more", () => {
    const many = Array.from({ length: 24 }, (_, i) => withNote(`m${i}`, "Two steps.", { wheelchair: "yes", name: `P${String(i).padStart(2, "0")}` }));
    const { area, compare, container } = show({ places: many as ReturnType<typeof places> });
    paste(area, csvOf([withNote("zz", "Two steps.", { wheelchair: "yes" })] as ReturnType<typeof places>));
    compare();
    expect(container.querySelectorAll("[data-tag-note-earlier-list] li")).toHaveLength(20);
    expect(screen.getByText("5 more are not shown.")).toBeTruthy();
  });
  it("is read by keyboard: the box, then Compare, then Clear", () => {
    const { area } = show();
    const order = [...document.querySelectorAll<HTMLElement>("textarea, button")];
    expect(order[0]).toBe(area);
    expect(order.map((e) => e.tagName)).toEqual(["TEXTAREA", "BUTTON", "BUTTON"]);
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations with a result in ${locale}`, async () => {
      const { area, compare, container } = show({ locale });
      paste(area, csvOf(places().slice(0, 1)));
      compare();
      expect(container.querySelector("[data-tag-note-earlier-list]")).not.toBeNull();
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      if (locale === "fr") for (const el of container.querySelectorAll<HTMLElement>("p, label, li small, button")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    });
  }
});

describe("both sections inside the check", () => {
  it("appear in the open panel and not before", () => {
    const { container } = render(<TagNoteCheck places={places()} locale="en" />);
    expect(container.querySelector("[data-tag-note-spread]")).toBeNull();
    expect(container.querySelector("[data-tag-note-earlier]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Look for a tag and a note that point different ways" }));
    expect(container.querySelector("[data-tag-note-spread]")).not.toBeNull();
    expect(within(container as HTMLElement).getByLabelText("Earlier tag-and-note file, pasted as text")).toBeTruthy();
  });
  it("save the by-kind file through the same save path and report it", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<TagNoteCheck places={places()} locale="en" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Look for a tag and a note that point different ways" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the kinds as a CSV file" }));
    expect(onSave.mock.calls[0]![0].name).toBe("tag-and-note-by-kind.csv");
    expect(screen.getByText("Saved tag-and-note-by-kind.csv.")).toBeTruthy();
  });
  it("show the table even when no note disagrees with its tag", () => {
    const calm = [withNote("a", "Ramp.", { wheelchair: "yes", name: "Alpha", category: "cafe" })] as ReturnType<typeof places>;
    const { container } = render(<TagNoteCheck places={calm} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Look for a tag and a note that point different ways" }));
    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByText("None of them point different ways.")).toBeTruthy();
  });
});
