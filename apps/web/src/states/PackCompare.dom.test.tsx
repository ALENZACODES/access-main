/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import type { SavedFile } from "./downloadFile";
import { MAX_SHOWN, PackCompare, readFileText } from "./PackCompare";
import { packPlacesToCsv, readExportRecords } from "./packExport";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const shipped = (JSON.parse(contentText) as { places: Record<string, unknown>[] }).places;
const savedCsv = (items: unknown[]) => packPlacesToCsv(readExportRecords(items).records, { bom: true });
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const place = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Place ${id}`, category: "cafe", address: "1 Main Street", wheelchair: "yes", lat: 43.65, lon: -79.38, provenance: prov, ...over });

afterEach(cleanup);

interface Options {
  locale?: "en" | "fr";
  read?: (file: File) => Promise<string>;
  onSave?: (f: SavedFile) => boolean;
}
function show(places: unknown, { locale = "en", read, onSave }: Options = {}) {
  document.documentElement.lang = locale;
  return render(<PackCompare places={places} locale={locale} today={TODAY} readFile={read} onSave={onSave} />);
}
const choose = (text: string, name = "earlier.csv") => {
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  const file = new File([text], name, { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
};
const status = () => (document.querySelector("[data-compare-status]") as HTMLElement).textContent;
const saveLine = () => (document.querySelector("[data-compare-saved]") as HTMLElement).textContent;
const stubRead = (text: string) => async () => text;

describe("PackCompare before a file is chosen", () => {
  it("shows nothing when the pack has no usable place", () => {
    for (const input of [null, [], "x", {}, [{ name: "no id" }]]) {
      const { container } = show(input);
      expect(container.innerHTML, JSON.stringify(input)).toBe("");
      cleanup();
    }
  });
  it("has one h2, an explanation that the file stays here, and a labelled file input", () => {
    show(shipped);
    expect(screen.getAllByRole("heading").map((h) => [h.tagName, h.textContent])).toEqual([["H2", "Compare with an earlier file"]]);
    expect(screen.getByText(/The file stays on this device\./)).toBeTruthy();
    const input = screen.getByLabelText("Earlier places file") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toContain(".csv");
  });
  it("has empty polite lines and no save buttons yet", () => {
    show(shipped);
    expect(status()).toBe("");
    expect(saveLine()).toBe("");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("status")).toEqual([]);
  });
});

describe("PackCompare with files", () => {
  it("says nothing differs for the file saved from this pack", async () => {
    show(shipped, { read: stubRead(savedCsv(shipped)) });
    choose(savedCsv(shipped));
    await waitFor(() => expect(status()).toBe(`No difference found: ${shipped.length} places in both.`));
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });
  it("shows what changed, was added and is no longer listed", async () => {
    const earlier = savedCsv([place("a"), place("b"), place("gone", { name: "Old Cafe" })]);
    show([place("a", { wheelchair: "no" }), place("b"), place("new", { name: "New Cafe" })], { read: stubRead(earlier) });
    choose(earlier);
    await waitFor(() => expect(status()).toBe("1 added; 1 no longer listed; 1 changed; 1 unchanged."));
    expect(screen.getByText("Wheelchair tag: 1")).toBeTruthy();
    const summaries = [...document.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries).toEqual(["Added (1)", "No longer listed (1)", "Changed (1)"]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("New Cafe");
    expect(text).toContain("Old Cafe");
    expect(text).toContain("Wheelchair tag: yes → no");
  });
  it("says a removed place may still exist", async () => {
    const earlier = savedCsv([place("gone")]);
    show([place("other")], { read: stubRead(earlier) });
    choose(earlier);
    await waitFor(() => expect(screen.getByText("The pack no longer lists these places. That does not say they are gone.")).toBeTruthy());
  });
  it("names the file while it is being read", async () => {
    let finish: (text: string) => void = () => undefined;
    show(shipped, { read: () => new Promise<string>((resolve) => (finish = resolve)) });
    choose("x", "my-places.csv");
    expect(status()).toBe("Reading my-places.csv…");
    finish(savedCsv(shipped));
    await waitFor(() => expect(status()).toContain("No difference found"));
  });
  it("says so when a file cannot be read at all", async () => {
    show(shipped, { read: async () => { throw new Error("denied"); } });
    choose("x", "locked.csv");
    await waitFor(() => expect(status()).toBe("locked.csv could not be read."));
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
  it("says what is wrong with a file of the wrong kind, and shows no comparison", async () => {
    const bad = "name,age\r\nAnn,3\r\n";
    show(shipped, { read: stubRead(bad) });
    choose(bad);
    await waitFor(() => expect(status()).toMatch(/^This is not a places file saved by the App\. Missing columns: place_id,/));
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });
  it.each([
    ["", "The file is empty."],
    ['place_id\r\n"x', "A quotation mark in the file is never closed, so it cannot be read safely."],
  ])("explains problem %j", async (text, expected) => {
    show(shipped, { read: stubRead(text) });
    choose(text);
    await waitFor(() => expect(status()).toContain(expected.slice(0, 20)));
  });
  it("lists rows that could not be used, with line numbers, and still compares the rest", async () => {
    const lines = savedCsv([place("a")]).replace(/\r\n$/, "") + "\r\n" + "short,row\r\n";
    show([place("a")], { read: stubRead(lines) });
    choose(lines);
    await waitFor(() => expect(status()).toContain("No difference found"));
    const summary = screen.getByText("1 place in the file could not be used");
    fireEvent.click(summary);
    expect(screen.getByText("Line 3: fewer cells than the header")).toBeTruthy();
  });
  it("clears the comparison when the file is removed from the input", async () => {
    const earlier = savedCsv([place("a")]);
    show([place("a", { wheelchair: "no" })], { read: stubRead(earlier) });
    choose(earlier);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
    fireEvent.change(document.querySelector("input[type=file]")!, { target: { files: [] } });
    await waitFor(() => expect(screen.queryAllByRole("button")).toEqual([]));
    expect(status()).toBe("");
  });
  it("shows at most the page limit in a list and says the rest are in the files", async () => {
    const many = Array.from({ length: MAX_SHOWN + 7 }, (_, i) => place(`p${String(i).padStart(3, "0")}`));
    show(many, { read: stubRead(savedCsv([place("zzz")])) });
    choose(savedCsv([place("zzz")]));
    await waitFor(() => expect(screen.getByText("7 more are in the saved files.")).toBeTruthy());
    const added = document.querySelectorAll("details")[0]!;
    expect(within(added as HTMLElement).getAllByRole("listitem")).toHaveLength(MAX_SHOWN);
  });
  it("reads a real file chosen in the browser with the default reader", async () => {
    show(shipped);
    choose(savedCsv(shipped));
    await waitFor(() => expect(status()).toContain("No difference found"));
  });
});

describe("PackCompare saving", () => {
  const earlier = savedCsv([place("a"), place("gone")]);
  const ready = async (onSave: (f: SavedFile) => boolean) => {
    show([place("a", { wheelchair: "no" }), place("new")], { read: stubRead(earlier), onSave });
    choose(earlier);
    await screen.findByRole("button", { name: "Save the changes (CSV)" });
  };
  it("saves the changes as CSV with every row, and as text with the credit", async () => {
    const files: SavedFile[] = [];
    await ready((f) => (files.push(f), true));
    fireEvent.click(screen.getByRole("button", { name: "Save the changes (CSV)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the changes (text)" }));
    expect(files.map((f) => [f.name, f.mime])).toEqual([["pack-changes.csv", "text/csv;charset=utf-8"], ["pack-changes.txt", "text/plain;charset=utf-8"]]);
    expect(files[0]!.content.startsWith("﻿change,place_id")).toBe(true);
    expect(files[0]!.content.split("\r\n").filter(Boolean)).toHaveLength(4);
    expect(files[1]!.content).toContain("© OpenStreetMap contributors");
    expect(saveLine()).toBe("Saved pack-changes.txt.");
  });
  it("says plainly when the browser cannot save", async () => {
    await ready(() => false);
    fireEvent.click(screen.getByRole("button", { name: "Save the changes (CSV)" }));
    expect(saveLine()).toBe("This browser cannot save a file here.");
  });
  it("clears the saved line when another file is chosen", async () => {
    await ready(() => true);
    fireEvent.click(screen.getByRole("button", { name: "Save the changes (CSV)" }));
    expect(saveLine()).not.toBe("");
    choose(earlier);
    expect(saveLine()).toBe("");
  });
});

describe("PackCompare in French", () => {
  it("is French throughout with correct typography and the token UNKNOWN", async () => {
    const earlier = savedCsv([place("a"), place("gone", { name: "" })]);
    show([place("a", { wheelchair: "no" }), place("new")], { locale: "fr", read: stubRead(earlier) });
    expect(screen.getByRole("heading", { name: "Comparer avec un fichier précédent" })).toBeTruthy();
    choose(earlier);
    await waitFor(() => expect(status()).toBe("1 ajouté ; 1 qui ne figure plus ; 1 modifié ; 0 inchangé."));
    expect(document.body.textContent).not.toMatch(/INCONNU/);
    const lines = [...document.querySelectorAll("p, summary, li, label, h2")].map((n) => n.textContent ?? "");
    for (const line of lines) expect(lintFrench(line), line).toEqual([]);
    expect(screen.getByRole("button", { name: "Enregistrer les changements (CSV)" })).toBeTruthy();
  });
  it("explains a file problem in French", async () => {
    show(shipped, { locale: "fr", read: stubRead("a,b\r\n") });
    choose("a,b\r\n");
    await waitFor(() => expect(status()).toMatch(/^Ce n’est pas un fichier de lieux enregistré par l’App\./));
  });
});

describe("PackCompare accessibility and safety", () => {
  it.each(["en", "fr"] as const)("has no axe violations with a comparison showing (%s)", async (locale) => {
    const earlier = savedCsv([place("a"), place("gone")]);
    const { container } = show([place("a", { wheelchair: "no" }), place("new")], { locale, read: stubRead(earlier) });
    choose(earlier);
    await screen.findAllByRole("button");
    expect((await axe.run(container, axeRules)).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
  it("shows text from a file as text, never as markup", async () => {
    const earlier = savedCsv([place("a", { name: "<img src=x onerror=alert(1)>" })]);
    const { container } = show([place("a", { name: "<b>bold</b>" })], { read: stubRead(earlier) });
    choose(earlier);
    await waitFor(() => expect(container.textContent).toContain("<img src=x onerror=alert(1)>"));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
  it("saves nothing and sends nothing by itself", async () => {
    const before = window.localStorage.length;
    const earlier = savedCsv([place("a")]);
    show([place("a", { wheelchair: "no" })], { read: stubRead(earlier) });
    choose(earlier);
    await screen.findAllByRole("button");
    expect(window.localStorage.length).toBe(before);
    expect(window.sessionStorage.length).toBe(0);
  });
  it("names no organisation and gives no verdict", async () => {
    const earlier = savedCsv([place("a"), place("gone")]);
    const { container } = show([place("a", { wheelchair: "no" }), place("new")], { read: stubRead(earlier) });
    choose(earlier);
    await screen.findAllByRole("button");
    expect(containsForbiddenOrg(container.textContent ?? "")).toBe(false);
    expect(container.textContent).not.toMatch(/\b(better|worse|improved|worsened|accessible|safe)\b/i);
  });
});

describe("readFileText", () => {
  it("reads a file as text in the browser", async () => {
    expect(await readFileText(new File(["café,é"], "a.csv"))).toBe("café,é");
  });
  it("rejects when the reader fails", async () => {
    const spy = vi.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>));
    });
    await expect(readFileText(new File(["x"], "a.csv"))).rejects.toBeDefined();
    spy.mockRestore();
  });
});
