/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PackManifest, PackPart, PackSourceEntry, RegionStatus,
} from "../../../../../packages/data-client/src/types";
import { DEFAULT_RESERVE_BYTES } from "./quotaPlanning";
import type { StorageEstimate } from "./regionDownload";
import PackFootprintPanel from "./PackFootprintPanel";

const bbox: [number, number, number, number] = [-80, 42, -79, 43];
const builtAt = "2026-11-21T08:00:00Z";

function part(hashDigit: string, bytes: number, sourceId: string): PackPart {
  return {
    path: "cells/" + sourceId + "-" + hashDigit + ".gz",
    sha256: hashDigit.repeat(64),
    count: 1,
    bytes,
    sourceId,
  };
}

function credit(id: string, name: string): PackSourceEntry {
  return { sourceId: id, name, licence: "CC BY 4.0", retrieved: "2026-05-01", inWebPack: true };
}

function manifest(): PackManifest {
  return {
    version: 1, builtAt, sourceCommit: "builder", tiles: {}, search: {},
    counts: { records: 4, byTranche: {}, bySource: {} },
    sources: [credit("common", "County data"), credit("east", "East archives"), credit("west", "West archives")],
    regions: [
      { id: "e", label: { en: "East shore", fr: "Rive est" }, cells: ["e1"], bbox },
      { id: "w", label: { en: "West shore", fr: "Rive ouest" }, cells: ["w1"], bbox },
    ],
    tranches: { venue: { cells: {
      e1: { bbox, parts: [part("a", 21, "common"), part("b", 40, "east")] },
      w1: { bbox, parts: [part("a", 21, "common"), part("c", 60, "west")] },
    } } },
    withheld: [{ path: "private.gz", sourceId: null, tranche: "venue", cell: "e1", reason: "terms" }],
  };
}

function reading(pack: PackManifest, id: string, missingCells: string[], version = builtAt): RegionStatus {
  const region = pack.regions.find(item => item.id === id)!;
  return {
    id, cells: region.cells, label: region.label, missingCells, builtAt: version,
    bytes: 0, count: 0, downloaded: false, verified: false,
  };
}

function mount(pack = manifest(), statuses: RegionStatus[] = [], language: "en" | "fr" = "en",
  estimateStorage: () => Promise<StorageEstimate> = vi.fn(async () => ({}))) {
  const props = { pack, statuses, language, estimateStorage };
  const view = render(<PackFootprintPanel {...props} />);
  return { ...view, props };
}

function add(id: string, lang: "en" | "fr" = "en") {
  const chooser = screen.getByRole("combobox", { name: lang === "en" ? "Region to add" : "Région à ajouter" });
  fireEvent.change(chooser, { target: { value: id } });
  fireEvent.click(screen.getByRole("button", { name: lang === "en" ? "Add region" : "Ajouter la région" }));
}

function amount(label: string, container?: HTMLElement): string | null | undefined {
  return (container ? within(container) : screen).getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
}

function orderedRows() {
  const order = screen.getByRole("list", { name: "Selected regions in order" });
  return within(order).getAllByRole("listitem");
}

function orderNames() {
  return orderedRows().map(row => within(row).getByRole("heading").textContent);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("choosing and ordering region packs", () => {
  it("starts without any selection or device read; choosing an option alone changes no estimate", () => {
    const estimateStorage = vi.fn(async () => ({}));
    mount(manifest(), [], "en", estimateStorage);
    expect(screen.getByRole("button", { name: "Add region" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Choose a region to see its size and possible transfer.")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "e" } });
    expect(screen.queryByText("Combined estimate")).toBeNull();
    expect(estimateStorage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add region" }));
    expect(amount("Size counting each file once")).toBe("61 bytes");
    expect(screen.getByRole("combobox", { name: "Region to add" })).toBe(document.activeElement);
    expect(screen.queryByRole("option", { name: "East shore" })).toBeNull();
    expect(estimateStorage).not.toHaveBeenCalled();
  });

  it("separates what each step adds from what omitting that region would save", () => {
    mount();
    add("e"); add("w");
    const [east, west] = orderedRows();
    expect(orderNames()).toEqual(["East shore", "West shore"]);
    expect(amount("Region size on its own", west)).toBe("81 bytes");
    expect(amount("Size added at this step", east)).toBe("61 bytes");
    expect(amount("Size added at this step", west)).toBe("60 bytes");
    expect(amount("Size removed if you leave out this region", east)).toBe("40 bytes");
    expect(amount("Reduction in the maximum transfer if left out", west)).toBe("60 bytes");
    expect(amount("Files already counted at earlier steps", west)).toBe("1");
    expect(amount("Parts withheld by the pack builder", east)).toBe("1");
    expect(amount("Size counting each file once")).toBe("121 bytes");
    expect(amount("Repeated bytes counted only once")).toBe("21 bytes");
    expect(screen.getByText("Every listed region is in the comparison.")).toBeTruthy();
  });

  it("changes ordered contributions without changing the total, and keeps focus on the moving row", () => {
    mount();
    add("e"); add("w");
    const earlier = screen.getByRole("button", { name: "Move earlier — West shore" });
    earlier.focus();
    fireEvent.click(earlier);
    expect(orderNames()).toEqual(["West shore", "East shore"]);
    expect(amount("Size added at this step", orderedRows()[0])).toBe("81 bytes");
    expect(amount("Size added at this step", orderedRows()[1])).toBe("40 bytes");
    expect(amount("Size removed if you leave out this region", orderedRows()[0])).toBe("60 bytes");
    expect(amount("Size counting each file once")).toBe("121 bytes");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "West shore" }));
    expect(earlier).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Move later — West shore" }));
    expect(orderNames()).toEqual(["East shore", "West shore"]);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "West shore" }));
  });

  it("returns focus to the chooser with a removed region ready to re-add", () => {
    mount();
    add("e"); add("w");
    fireEvent.click(screen.getByRole("button", { name: "Remove — East shore" }));
    const chooser = screen.getByRole("combobox", { name: "Region to add" });
    expect(chooser).toBe(document.activeElement);
    expect(chooser).toHaveProperty("value", "e");
    expect(amount("Size counting each file once")).toBe("81 bytes");
    fireEvent.click(screen.getByRole("button", { name: "Add region" }));
    expect(orderNames()).toEqual(["West shore", "East shore"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove — East shore" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove — West shore" }));
    expect(screen.queryByRole("heading", { name: "Combined estimate" })).toBeNull();
    expect(screen.getByText("Choose a region to see its size and possible transfer.")).toBeTruthy();
  });

  it("removes obsolete selections on a pack refresh, keeping surviving regions in their prior order", () => {
    const view = mount();
    add("w"); add("e");
    const original = view.props.pack;
    const updated = { ...original, regions: original.regions.filter(region => region.id === "e") };
    view.rerender(<PackFootprintPanel {...view.props} pack={updated} />);
    expect(orderNames()).toEqual(["East shore"]);
    expect(amount("Size counting each file once")).toBe("61 bytes");
    view.rerender(<PackFootprintPanel {...view.props} />);
    expect(orderNames()).toEqual(["East shore"]);
    expect(screen.getByRole("option", { name: "West shore" })).toBeTruthy();
  });

  it("uses localized options, names, totals and controls when the language changes", () => {
    const view = mount();
    add("e");
    view.rerender(<PackFootprintPanel {...view.props} language="fr" />);
    expect(screen.getByRole("heading", { name: "Rive est" })).toBeTruthy();
    add("w", "fr");
    expect(amount("Taille en comptant chaque fichier une seule fois")).toMatch(/^121\s+octets$/u);
    expect(screen.getByRole("button", { name: "Reculer — Rive est" })).toBeTruthy();
    expect(screen.queryByText("Combined estimate")).toBeNull();
    for (const control of screen.getAllByRole("button").concat(screen.getAllByRole("combobox"))) {
      expect(control.style.minHeight).toBe("44px");
      expect(control.style.minWidth).toBe("44px");
    }
  });

  it("shows a localized empty state for a pack with no regions", () => {
    mount({ ...manifest(), regions: [] }, [], "fr");
    expect(screen.getByText("Ce pack ne propose aucune région à sélectionner.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ajouter la région" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("heading", { name: "Estimation combinée" })).toBeNull();
  });
});

describe("reading compressed transfer bounds", () => {
  it("moves from a broad range to exact remaining bytes when current cell observations arrive", () => {
    const view = mount();
    add("e"); add("w");
    expect(amount("Lower bound on transfer size")).toBe("0 bytes");
    expect(amount("Maximum possible transfer")).toBe("121 bytes");
    const p = view.props.pack;
    view.rerender(<PackFootprintPanel {...view.props} statuses={[
      reading(p, "e", []), reading(p, "w", ["w1"]),
    ]} />);
    expect(amount("Bytes reported present by current cell readings")).toBe("61 bytes");
    expect(amount("Lower bound on transfer size")).toBe("60 bytes");
    expect(amount("Maximum possible transfer")).toBe("60 bytes");
    expect(amount("Reduction in the maximum transfer if left out", orderedRows()[0])).toBe("0 bytes");
    view.rerender(<PackFootprintPanel {...view.props} statuses={[reading(p, "e", [], "old")]} />);
    expect(amount("Maximum possible transfer")).toBe("121 bytes");
  });

  it("shows UNKNOWN for incomplete metadata and avoids using an old pack size", () => {
    const original = manifest();
    original.tranches.venue!.cells.e1!.parts[0]!.sha256 = "unusable";
    mount(original);
    add("e");
    expect(amount("Size counting each file once")).toBe("UNKNOWN");
    expect(amount("Maximum possible transfer")).toBe("UNKNOWN");
    expect(amount("Lower bound on transfer size")).toBe("0 bytes");
    expect(screen.getByText(/Some declarations are incomplete/)).toBeTruthy();
    expect(amount("Size removed if you leave out this region")).toBe("UNKNOWN");
  });

  it("discloses contradictory device evidence and omits the contested presence claim", () => {
    const p = manifest();
    mount(p, [reading(p, "e", []), reading(p, "e", ["e1"])]);
    add("e");
    expect(screen.getByText(/Device readings disagree/)).toBeTruthy();
    expect(amount("Bytes reported present by current cell readings")).toBe("0 bytes");
    expect(amount("Maximum possible transfer")).toBe("61 bytes");
  });

  it("preserves exact integer bounds where rounding a displayed minimum upward would overstate it", () => {
    const p = manifest();
    p.tranches.venue!.cells.e1!.parts = [part("b", 1025, "east")];
    mount(p, [reading(p, "e", ["e1"])]);
    add("e");
    expect(amount("Lower bound on transfer size")).toBe("1,025 bytes");
    expect(amount("Maximum possible transfer")).toBe("1,025 bytes");
  });
});

describe("inspecting individual files and their sources", () => {
  it("shows one selected digest at a time and the exact source behind it", () => {
    mount();
    add("e"); add("w");
    expect(screen.getByText("File 1 of 3")).toBeTruthy();
    expect(amount("File SHA-256")).toBe("a".repeat(64));
    expect(amount("Selected regions using this file")).toBe("East shore, West shore");
    expect(amount("Source")).toBe("County data");
    expect(amount("Licence")).toBe("CC BY 4.0");
    expect(amount("Source date")).toBe("2026-05-01");
    expect(screen.getByRole("button", { name: "Previous file" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Next file" }));
    expect(amount("File SHA-256")).toBe("b".repeat(64));
    expect(amount("Selected regions using this file")).toBe("East shore");
    expect(amount("Source")).toBe("East archives");
    expect(screen.queryByText("County data")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next file" }));
    expect(amount("Source")).toBe("West archives");
    expect(screen.getByRole("button", { name: "Next file" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Previous file" }));
    expect(amount("Declared size")).toBe("40 bytes");
    expect(screen.getByText("File 2 of 3")).toBeTruthy();
  });

  it("resets the cursor when a shared-files filter shrinks the review and separates an empty result", () => {
    mount();
    add("w");
    const filter = screen.getByRole("combobox", { name: "Files to inspect" });
    fireEvent.change(filter, { target: { value: "shared" } });
    expect(screen.getByText("No files match this selection.")).toBeTruthy();
    expect(screen.queryByText("File SHA-256")).toBeNull();
    add("e");
    fireEvent.click(screen.getByRole("button", { name: "Next file" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Files to inspect" }), { target: { value: "shared" } });
    expect(screen.getByText("File 1 of 1")).toBeTruthy();
    expect(amount("File SHA-256")).toBe("a".repeat(64));
    expect(amount("Selected regions using this file")).toBe("West shore, East shore");
    expect(screen.getByRole("button", { name: "Next file" })).toHaveProperty("disabled", true);
  });

  it("retains individually known credit fields and labels missing fields explicitly in French", () => {
    const p = manifest();
    p.sources[0] = { ...credit("common", "Fonds public"), licence: "", retrieved: "unknown" };
    mount(p, [], "fr");
    add("e", "fr");
    expect(amount("Source")).toBe("Fonds public");
    expect(amount("Licence")).toBe("UNKNOWN");
    expect(amount("Date de la source")).toBe("UNKNOWN");
  });

  it("pages distinct credits for a single digest and resets source position on the next file", () => {
    const p = manifest();
    p.sources.push(...Array.from({ length: 6 }, (_, i) => credit("common", "Archive " + (i + 1))));
    mount(p);
    add("e");
    expect(screen.getAllByText("CC BY 4.0")).toHaveLength(5);
    expect(screen.getByText("County data")).toBeTruthy();
    expect(screen.queryByText("Archive 6")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next sources" }));
    expect(screen.getByText("6–7 of 7")).toBeTruthy();
    expect(screen.getByText("Archive 6")).toBeTruthy();
    expect(screen.queryByText("County data")).toBeNull();
    expect(screen.getByRole("button", { name: "Next sources" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Previous sources" }));
    expect(screen.getByText("1–5 of 7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next sources" }));
    fireEvent.click(screen.getByRole("button", { name: "Next file" }));
    expect(amount("Source")).toBe("East archives");
    expect(screen.queryByRole("button", { name: "Next sources" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Previous file" }));
    expect(screen.getByText("1–5 of 7")).toBeTruthy();
  });

  it("shows a complete lack of source metadata explicitly for an otherwise usable search file", () => {
    const p = manifest();
    p.search.e1 = { path: "search/e1.json", count: 2, bytes: 8, sha256: "d".repeat(64) };
    mount(p);
    add("e");
    expect(amount("Declared size")).toBe("8 bytes");
    expect(screen.getByText("Source details are UNKNOWN.")).toBeTruthy();
    expect(screen.queryByText("CC BY 4.0")).toBeNull();
  });
});

describe("comparing the estimated transfer with device space", () => {
  it("reads only on request and recalculates using a fresh estimate after retrying", async () => {
    const read = vi.fn<() => Promise<StorageEstimate>>()
      .mockRejectedValueOnce(new Error("estimate unavailable"))
      .mockResolvedValueOnce({ usage: 100, quota: 100 + DEFAULT_RESERVE_BYTES + 61 });
    mount(manifest(), [], "fr", read);
    add("e", "fr");
    expect(read).not.toHaveBeenCalled();
    const check = screen.getByRole("button", { name: "Estimer l’espace disponible" });
    fireEvent.click(check);
    await screen.findByText("L’espace disponible porte la mention UNKNOWN.");
    expect(amount("Espace après la réserve")).toBe("UNKNOWN");
    fireEvent.click(check);
    await screen.findByText("Même le transfert maximal tient dans l’espace estimé.");
    expect(amount("Espace après la réserve")).toMatch(/^61\s+octets$/u);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("guards a pending read against repeated requests and a changed selection", async () => {
    let finish!: (value: StorageEstimate) => void;
    const read = vi.fn(() => new Promise<StorageEstimate>(resolve => { finish = resolve; }));
    mount(manifest(), [], "en", read);
    add("e");
    const check = screen.getByRole("button", { name: "Check available storage" });
    fireEvent.click(check);
    expect(screen.getByRole("status").textContent).toBe("Reading the device estimate…");
    expect(check).toHaveProperty("disabled", true);
    fireEvent.click(check);
    expect(read).toHaveBeenCalledTimes(1);
    add("w");
    expect(screen.getByRole("status").textContent).toBe("");
    await act(async () => { finish({ usage: 0, quota: DEFAULT_RESERVE_BYTES + 1000 }); });
    expect(screen.queryByText("Space after the reserve")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("keeps the last storage reading when only the order changes and recomputes on evidence updates", async () => {
    const p = manifest();
    const read = vi.fn(async () => ({ usage: 0, quota: DEFAULT_RESERVE_BYTES + 50 }));
    const view = mount(p, [], "en", read);
    add("e"); add("w");
    fireEvent.click(screen.getByRole("button", { name: "Check available storage" }));
    await screen.findByText("There may be too little space for the transfer.");
    fireEvent.click(screen.getByRole("button", { name: "Move earlier — West shore" }));
    expect(amount("Space after the reserve")).toBe("50 bytes");
    view.rerender(<PackFootprintPanel {...view.props} statuses={[
      reading(p, "e", []), reading(p, "w", ["w1"]),
    ]} />);
    expect(screen.getByRole("status").textContent).toBe("The lower bound already exceeds the estimated space.");
    view.rerender(<PackFootprintPanel {...view.props} statuses={[
      reading(p, "e", []), reading(p, "w", []),
    ]} />);
    expect(screen.getByRole("status").textContent).toBe("The current readings indicate no transfer is needed.");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("shows an unavailable estimate when the browser returns contradictory capacity fields", async () => {
    const read = vi.fn(async () => ({ usage: 500, quota: 10 }));
    mount(manifest(), [], "en", read);
    add("e");
    fireEvent.click(screen.getByRole("button", { name: "Check available storage" }));
    await screen.findByText("Available space is UNKNOWN.");
    expect(amount("Space after the reserve")).toBe("UNKNOWN");
    expect(amount("Maximum possible transfer")).toBe("61 bytes");
  });
});
