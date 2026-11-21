/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_DETAIL_LISTED, PackGroupDetail } from "./PackGroupDetail";
import { PackFingerprint } from "./PackFingerprint";
import { type BucketKey, bucketOf, fingerprintPlaces } from "./packFingerprint";
import { printToCode } from "./packFingerprintCode";
import { comparePrints } from "./packFingerprintCompare";
import { MAX_DETAIL_ENTRIES, makeDetailCode } from "./packGroupDetail";
import { place, varied } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);

const mine = varied(91, 30);
const groups: BucketKey[] = ["1", "5", "9"];
const PASTE = { en: "Paste a detail code from the other device", fr: "Collez un code de détail de l’autre appareil" } as const;
const detailOf = (places: PackPlaceRecord[], keys: readonly BucketKey[] = groups): string => {
  const m = makeDetailCode(places, [...keys]);
  if (!m.ok) throw new Error("no code");
  return m.code;
};

function show(over: { places?: PackPlaceRecord[]; groups?: BucketKey[]; locale?: "en" | "fr"; copy?: (t: string) => Promise<boolean> } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const view = render(<PackGroupDetail places={over.places ?? mine} groups={over.groups ?? groups} locale={locale} copy={over.copy ?? (async () => true)} />);
  return { ...view, locale };
}
const paste = (text: string, locale: "en" | "fr" = "en") => fireEvent.change(screen.getByLabelText(PASTE[locale]), { target: { value: text } });
const idIn = (keys: BucketKey[], prefix: string) => Array.from({ length: 500 }, (_, i) => `${prefix}-${i}`).find((id) => keys.includes(bucketOf(id)))!;

describe("making this device's detail code", () => {
  it("explains the step, naming the groups", () => {
    show();
    expect(screen.getByText(/for the 3 groups that differ \(1, 5, 9\)/)).toBeTruthy();
  });
  it("copies the code and says so", async () => {
    const copy = vi.fn(async () => true);
    show({ copy });
    const inGroups = mine.filter((p) => groups.includes(bucketOf(p.id))).length;
    fireEvent.click(screen.getByRole("button", { name: `Copy the detail code (${inGroups} ${inGroups === 1 ? "place" : "places"})` }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(detailOf(mine)));
    await waitFor(() => expect(screen.getByText("Detail code copied.")).toBeTruthy());
    expect(screen.queryByLabelText("Detail code for this device")).toBeNull();
  });
  it("shows the code to select when the browser could not copy", async () => {
    show({ copy: async () => false });
    fireEvent.click(screen.getByRole("button", { name: /^Copy the detail code/ }));
    const box = (await screen.findByLabelText("Detail code for this device")) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.value).toBe(detailOf(mine));
  });
  it("says so, with no button, when there are too many places to list", () => {
    const many = Array.from({ length: MAX_DETAIL_ENTRIES + 25 }, (_, i) => place(`bulk-${i}`, {}));
    show({ places: many, groups: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"] });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/more than a detail code can list \(1000\)/)).toBeTruthy();
  });
});

describe("reading the other device's detail code", () => {
  it("says nothing until something is pasted", () => {
    show();
    expect(document.querySelector("[data-detail-result]")).toBeNull();
    expect(document.querySelector("[data-detail-problem]")).toBeNull();
  });
  it("says every place matches when the groups are the same", () => {
    show();
    paste(detailOf([...mine].reverse()));
    expect(screen.getByText(/all \d+ places? match\. The difference is somewhere else\./)).toBeTruthy();
    expect(document.querySelectorAll("[data-detail-list]")).toHaveLength(0);
  });
  it("lists a place that is only here, with its name and id", () => {
    show();
    const gone = mine.find((p) => groups.includes(bucketOf(p.id)))!;
    paste(detailOf(mine.filter((p) => p.id !== gone.id)));
    const list = document.querySelector("[data-detail-list='only-here']") as HTMLElement;
    expect(within(list).getByText(`Only on this device (1)`)).toBeTruthy();
    expect(within(list).getByText(`${gone.name ?? "UNKNOWN"} (${gone.id})`)).toBeTruthy();
  });
  it("lists a place that is only there, by id, saying the name is on the other device", () => {
    show();
    const extra = idIn(groups, "there");
    paste(detailOf([...mine, place(extra, { name: "Only over there" })]));
    const list = document.querySelector("[data-detail-list='only-there']") as HTMLElement;
    expect(within(list).getByText(`${extra} (name is on the other device)`)).toBeTruthy();
    expect(list.textContent).not.toContain("Only over there");
  });
  it("lists a place that is on both with different details, using this device's name", () => {
    show();
    const t = mine.find((p) => groups.includes(bucketOf(p.id)))!;
    paste(detailOf(mine.map((p) => (p.id === t.id ? place(p.id, { name: "Their name", wheelchair: "no" }) : p))));
    const list = document.querySelector("[data-detail-list='changed']") as HTMLElement;
    expect(within(list).getByText("On both, with different details (1)")).toBeTruthy();
    expect(within(list).getByText(`${t.name ?? "UNKNOWN"} (${t.id})`)).toBeTruthy();
    expect(list.textContent).not.toContain("Their name");
  });
  it("shows UNKNOWN for a place with no name", () => {
    const unnamed = place(idIn(groups, "blank"), { name: null });
    show({ places: [...mine, unnamed] });
    paste(detailOf(mine));
    expect(screen.getByText(`UNKNOWN (${unnamed.id})`)).toBeTruthy();
  });
  it("caps each list and counts the rest", () => {
    const many = Array.from({ length: 200 }, (_, i) => place(`many-${i}`, {})).filter((p) => groups.includes(bucketOf(p.id)));
    expect(many.length).toBeGreaterThan(MAX_DETAIL_LISTED + 2);
    show({ places: many });
    paste(detailOf([]));
    const list = document.querySelector("[data-detail-list='only-here']") as HTMLElement;
    expect(within(list).getAllByRole("listitem")).toHaveLength(MAX_DETAIL_LISTED + 1);
    expect(within(list).getByText(`and ${many.length - MAX_DETAIL_LISTED} more`)).toBeTruthy();
  });
  it("does not compare a code for other groups, and says which it covers", () => {
    show();
    paste(detailOf(mine, ["1", "5"]));
    expect(screen.getByText(/covers groups 1, 5, but the groups that differ here are 1, 5, 9/)).toBeTruthy();
    expect(document.querySelector("[data-detail-result]")).toBeNull();
  });
  it("refuses a typo, and a code for the wrong step", () => {
    show();
    paste(detailOf(mine).replace(/k=[0-9a-f]/, (m) => (m.endsWith("0") ? "k=1" : "k=0")));
    expect(screen.getByText(/has a typo or was changed/)).toBeTruthy();
    paste(printToCode(fingerprintPlaces(mine)));
    expect(screen.getByText(/That is not a detail code\. It starts with PACKGRP, and the device code starts with PACKFP\./)).toBeTruthy();
    expect(document.querySelector("[data-detail-result]")).toBeNull();
  });
  it("always says the lists do not say which device is better", () => {
    show();
    paste(detailOf(mine.slice(2)));
    expect(screen.getByText(/do not say which device has the better record/)).toBeTruthy();
  });
});

describe("inside the fingerprint tool", () => {
  const OPEN = "Check that another device has the same saved places";
  const code = (places: PackPlaceRecord[]) => printToCode(fingerprintPlaces(places));

  it("appears only once the device codes show a difference, for exactly the groups that differ", () => {
    render(<PackFingerprint places={mine} locale="en" today="2026-11-21" />);
    fireEvent.click(screen.getByRole("button", { name: OPEN }));
    expect(document.querySelector("[data-group-detail]")).toBeNull();
    fireEvent.change(screen.getByLabelText("Paste a code from another device"), { target: { value: code(mine) } });
    expect(document.querySelector("[data-group-detail]")).toBeNull();
    const other = [...mine.slice(3), place("fresh-1", {})];
    fireEvent.change(screen.getByLabelText("Paste a code from another device"), { target: { value: code(other) } });
    const differing = comparePrints(fingerprintPlaces(mine), fingerprintPlaces(other)).differing;
    expect(document.querySelector("[data-group-detail]")).not.toBeNull();
    expect(screen.getByText(new RegExp(`\\(${differing.join(", ")}\\) on each device`))).toBeTruthy();
  });
  it("finds the exact place that differs, from the two devices' detail codes", () => {
    const target = mine[7]!;
    const other = mine.map((p) => (p.id === target.id ? place(p.id, { name: "Edited elsewhere", wheelchair: p.tag === "no" ? "yes" : "no" }) : p));
    render(<PackFingerprint places={mine} locale="en" today="2026-11-21" />);
    fireEvent.click(screen.getByRole("button", { name: OPEN }));
    fireEvent.change(screen.getByLabelText("Paste a code from another device"), { target: { value: code(other) } });
    const differing = comparePrints(fingerprintPlaces(mine), fingerprintPlaces(other)).differing;
    expect(differing).toEqual([bucketOf(target.id)]);
    fireEvent.change(screen.getByLabelText(PASTE.en), { target: { value: detailOf(other, differing) } });
    const list = document.querySelector("[data-detail-list='changed']") as HTMLElement;
    expect(within(list).getByText(`${target.name ?? "UNKNOWN"} (${target.id})`)).toBeTruthy();
  });
});

describe("in French and for accessibility", () => {
  it("uses French words and punctuation", () => {
    show({ locale: "fr" });
    paste(detailOf(mine.slice(1)), "fr");
    for (const el of document.querySelectorAll("p, button, label")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    expect(screen.getByText(/Seulement sur cet appareil|Dans ces groupes/)).toBeTruthy();
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations with a result (${locale})`, async () => {
      const { container } = show({ locale });
      const extra = idIn(groups, "axe");
      paste(detailOf([...mine.slice(2), place(extra, {})]), locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
    it(`has no axe violations with a refused code (${locale})`, async () => {
      const { container } = show({ locale });
      paste("nonsense", locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
  it("labels the boxes and adds no heading", () => {
    show();
    for (const box of screen.getAllByRole("textbox")) expect(document.querySelector(`label[for="${box.id}"]`)).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
