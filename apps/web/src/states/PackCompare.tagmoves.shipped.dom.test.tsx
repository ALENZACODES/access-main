/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { PackCompare } from "./PackCompare";
import { packPlacesToCsv, readExportRecords } from "./packExport";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const shipped = (JSON.parse(contentText) as { places: Record<string, unknown>[] }).places;
const csvOf = (items: unknown[]) => packPlacesToCsv(readExportRecords(items).records, { bom: true });

/** The shipped pack with the wheelchair tag of every nth place turned to another value. */
const retagged = (every: number): Record<string, unknown>[] =>
  shipped.map((p, i) => (i % every === 0 ? { ...p, wheelchair: p.wheelchair === "yes" ? "no" : "yes" } : p));

afterEach(cleanup);

function open(earlier: unknown[], locale: "en" | "fr" = "en") {
  document.documentElement.lang = locale;
  const view = render(<PackCompare places={shipped} locale={locale} today={TODAY} readFile={async () => csvOf(earlier)} />);
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "earlier.csv", { type: "text/csv" })] } });
  return view;
}
const region = () => document.querySelector("[data-tag-moves]") as HTMLElement | null;

describe("tag changes against the shipped Toronto pack", () => {
  it("is absent when the earlier file is the pack itself", async () => {
    open(shipped);
    await waitFor(() => expect(document.querySelector("[data-compare-status]")!.textContent).not.toBe(""));
    expect(region()).toBeNull();
  });
  it("counts exactly the places whose tag was turned", async () => {
    const turned = shipped.filter((_, i) => i % 7 === 0).length;
    open(retagged(7));
    await waitFor(() => expect(region()).not.toBeNull());
    expect(within(region()!).getByText(new RegExp(`^${turned} places? ${turned === 1 ? "changed its" : "changed their"} wheelchair tag`))).toBeTruthy();
  });
  it("puts the places now tagged yes in the no-to-yes cell, since the earlier file had them as no", async () => {
    open(retagged(5));
    await waitFor(() => expect(region()).not.toBeNull());
    const nowYes = shipped.filter((p, i) => i % 5 === 0 && p.wheelchair === "yes").length;
    const cell = region()!.querySelector('[data-move="no>yes"]')!.textContent;
    expect(cell).toBe(String(nowYes));
  });
  it("puts the others in the yes-to-their-tag cells, which add up with it to every turned place", async () => {
    open(retagged(5));
    await waitFor(() => expect(region()).not.toBeNull());
    const turned = shipped.filter((_, i) => i % 5 === 0).length;
    let total = 0;
    for (const td of region()!.querySelectorAll("[data-move]")) total += Number(td.textContent);
    expect(total).toBe(turned);
  });
  it("shows places added when the earlier file is missing some", async () => {
    open(shipped.slice(3));
    await waitFor(() => expect(region()).not.toBeNull());
    expect(within(region()!).getByText("3 places added.")).toBeTruthy();
    expect(region()!.textContent).not.toMatch(/changed their wheelchair tag/);
  });
  it("shows places no longer listed when the earlier file has extra ones", async () => {
    const extra = [{ ...shipped[0]!, id: "extra-1" }, { ...shipped[0]!, id: "extra-2" }];
    open([...shipped, ...extra]);
    await waitFor(() => expect(region()).not.toBeNull());
    expect(within(region()!).getByText("2 places no longer listed.")).toBeTruthy();
  });
  it("is in French, passes the French check and keeps UNKNOWN", async () => {
    open(retagged(4), "fr");
    await waitFor(() => expect(region()).not.toBeNull());
    const text = region()!.textContent ?? "";
    expect(lintFrench(text)).toEqual([]);
    expect(text).not.toMatch(/INCONNU/i);
    expect(containsForbiddenOrg(text)).toBe(false);
  });
  it("has no axe violations beside the comparison's own content", async () => {
    const { container } = open(retagged(4));
    await waitFor(() => expect(region()).not.toBeNull());
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("still has exactly one h2 on the page, because the tag changes add no heading", async () => {
    open(retagged(4));
    await waitFor(() => expect(region()).not.toBeNull());
    expect(document.querySelectorAll("h1, h2, h3, h4").length).toBe(document.querySelectorAll("h2").length);
    expect(document.querySelectorAll("h2")).toHaveLength(1);
  });
});
