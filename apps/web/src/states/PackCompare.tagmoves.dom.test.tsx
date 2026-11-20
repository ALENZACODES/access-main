/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { PackCompare } from "./PackCompare";
import { packPlacesToCsv, readExportRecords } from "./packExport";

const TODAY = "2026-11-19";
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const place = (id: string, wheelchair: string | undefined) => ({ id, name: `Place ${id}`, category: "cafe", address: "1 Main Street", wheelchair, lat: 43.65, lon: -79.38, provenance: prov });
const savedCsv = (items: unknown[]) => packPlacesToCsv(readExportRecords(items).records, { bom: true });

afterEach(cleanup);

function show(places: unknown, locale: "en" | "fr" = "en", onSave: (f: SavedFile) => boolean = () => true, text = "") {
  document.documentElement.lang = locale;
  return render(<PackCompare places={places} locale={locale} today={TODAY} readFile={async () => text} onSave={onSave} />);
}
const choose = (name = "earlier.csv") => {
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], name, { type: "text/csv" })] } });
};

describe("tag changes inside the comparison", () => {
  const earlier = [place("a", "yes"), place("b", "no"), place("c", undefined)];
  const current = [place("a", "limited"), place("b", "no"), place("c", "yes"), place("d", "yes")];

  it("is not there before a file is chosen", () => {
    show(current, "en", () => true, savedCsv(earlier));
    expect(document.querySelector("[data-tag-moves]")).toBeNull();
  });
  it("appears after an earlier file is read, with counts that match the comparison", async () => {
    show(current, "en", () => true, savedCsv(earlier));
    choose();
    await waitFor(() => expect(document.querySelector("[data-tag-moves]")).not.toBeNull());
    const region = document.querySelector("[data-tag-moves]") as HTMLElement;
    expect(within(region).getByText(/^2 places changed their wheelchair tag:/)).toBeTruthy();
    expect(within(region).getByText("1 place added.")).toBeTruthy();
  });
  it("is not there when only a field other than the tag changed", async () => {
    const same = [place("a", "yes"), { ...place("b", "no"), address: "2 Other Road" }];
    show([place("a", "yes"), place("b", "no")], "en", () => true, savedCsv(same));
    choose();
    await waitFor(() => expect(document.querySelector("[data-compare-status]")!.textContent).not.toBe(""));
    expect(document.querySelector("[data-tag-moves]")).toBeNull();
  });
  it("names the places in a pressed cell", async () => {
    show(current, "en", () => true, savedCsv(earlier));
    choose();
    await waitFor(() => expect(document.querySelector("[data-tag-moves]")).not.toBeNull());
    fireEvent.click(within(document.querySelector('[data-move="yes>limited"]') as HTMLElement).getByRole("button"));
    expect(within(document.querySelector("[data-tag-moves]") as HTMLElement).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Place a"]);
  });
  it("saves through the same onSave as the comparison's own files", async () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show(current, "en", onSave, savedCsv(earlier));
    choose();
    await waitFor(() => expect(document.querySelector("[data-tag-moves]")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Save the tag changes (CSV)" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].name).toBe("tag-changes.csv");
  });
  it("is in French when the page is", async () => {
    show(current, "fr", () => true, savedCsv(earlier));
    choose();
    await waitFor(() => expect(document.querySelector("[data-tag-moves]")).not.toBeNull());
    expect((document.querySelector("[data-tag-moves]") as HTMLElement).getAttribute("lang")).toBe("fr");
  });
  it("goes away when a second file shows no tag differences", async () => {
    const { rerender } = show(current, "en", () => true, savedCsv(earlier));
    choose();
    await waitFor(() => expect(document.querySelector("[data-tag-moves]")).not.toBeNull());
    rerender(<PackCompare places={current} locale="en" today={TODAY} readFile={async () => savedCsv(current)} onSave={() => true} />);
    choose("same.csv");
    await waitFor(() => expect(document.querySelector("[data-tag-moves]")).toBeNull());
  });
});
