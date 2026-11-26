/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as downloads from "../../states/downloadFile";
import type { BundleMember } from "./model";
import { PackingListCheck, PackingListExport } from "./PackingListPanel";
import { encodePackingList } from "./packingList";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function row(n: number): BundleMember {
  const file = new Blob(["fixture " + n]);
  return { kind: "brief", byteLength: file.size, digest: n.toString().padStart(64, "0"), recordCount: n, file };
}
const first = row(1);
const second = row(2);
const third = row(3);

function choose(text: string, read?: () => Promise<ArrayBuffer>) {
  const input = screen.getByLabelText(/Choose a packing list|Choisir une liste de fichiers/u);
  const data = new TextEncoder().encode(text);
  const file = new File([text], "example.json");
  Object.defineProperty(file, "arrayBuffer", { value: read ?? (async () => data.buffer) });
  fireEvent.change(input, { target: { files: [file] } });
  return input;
}

describe("checking a separately delivered list", () => {
  it("names both slots and makes multiple reasons for a mismatch available", async () => {
    render(<PackingListCheck members={[third, first, second]} locale="en" />);
    choose(encodePackingList([{ ...second, recordCount: 4, kind: "refresh" }, first, row(4)]));
    expect(await screen.findByText("The received bundle differs from the packing list.")).toBeTruthy();
    expect(screen.getByText("Packing list position 3 — Missing from the bundle")).toBeTruthy();
    expect(screen.getByText("Bundle position 1 — Absent from the packing list")).toBeTruthy();
    const details = screen.getByText("Matching file fingerprints (2)").closest("details");
    if (!details) throw new Error("Expected a disclosure containing the file matches");
    fireEvent.click(within(details).getByText("Matching file fingerprints (2)"));
    expect(within(details).getAllByText("Relative order changed")).toHaveLength(2);
    expect(within(details).getByText("File type differs, Record count differs")).toBeTruthy();
    expect(within(details).getByText("Packing list position 1 → Bundle position 3")).toBeTruthy();
  });

  it("identifies a rejected list on the file control and recovers in French", async () => {
    render(<PackingListCheck members={[second]} locale="fr" />);
    const picker = choose("{}");
    expect(await screen.findByText("Choisissez une liste de fichiers de récupération valide.")).toBeTruthy();
    expect(picker.getAttribute("aria-invalid")).toBe("true");
    const status = screen.getByRole("status");
    expect(picker.getAttribute("aria-describedby")?.split(" ")).toContain(status.id);
    choose(encodePackingList([second]));
    expect(await screen.findByText("Tous les fichiers correspondent à la liste et suivent l’ordre prévu.")).toBeTruthy();
    expect(picker.getAttribute("aria-invalid")).toBe("false");
  });

  it("ignores an older matching list after the recipient has selected another", async () => {
    let finish!: (buffer: ArrayBuffer) => void;
    const earlier = encodePackingList([first]);
    const gate = new Promise<ArrayBuffer>(resolve => { finish = resolve; });
    render(<PackingListCheck members={[first]} locale="en" />);
    choose(earlier, () => gate);
    expect(screen.getByRole("status").textContent).toBe("Checking the packing list…");
    choose(encodePackingList([second]));
    expect(await screen.findByText("The received bundle differs from the packing list.")).toBeTruthy();
    await act(async () => { finish(new TextEncoder().encode(earlier).buffer); await gate; });
    expect(screen.getByRole("status").textContent).toContain("differs");
    expect(screen.getByText("Packing list position 1 — Missing from the bundle")).toBeTruthy();
  });

  it("drops a previous report when a different bundle is opened", async () => {
    const ui = render(<PackingListCheck members={[first]} locale="en" />);
    choose(encodePackingList([first]));
    await screen.findByText("All files match the packing list in the expected order.");
    ui.rerender(<PackingListCheck members={[second]} locale="en" />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByText("Matching file fingerprints (1)")).toBeNull();
    ui.rerender(<PackingListCheck members={[]} locale="en" />);
    expect(screen.queryByLabelText("Choose a packing list")).toBeNull();
  });

  it("keeps an equivalent member sequence during a language change", async () => {
    const ui = render(<PackingListCheck members={[first]} locale="en" />);
    choose(encodePackingList([first]));
    await screen.findByText("All files match the packing list in the expected order.");
    ui.rerender(<PackingListCheck members={[{ ...first }]} locale="fr" />);
    expect(screen.getByRole("status").textContent).toBe("Tous les fichiers correspondent à la liste et suivent l’ordre prévu.");
    expect(screen.getByLabelText("Choisir une liste de fichiers")).toBeTruthy();
  });

  it("announces browser download failure and allows a second attempt", () => {
    const writer = vi.spyOn(downloads, "saveTextFile")
      .mockImplementationOnce(() => { throw new Error("synthetic unavailable download"); })
      .mockReturnValue(true);
    render(<PackingListExport members={[second, first]} locale="en" />);
    const button = screen.getByRole("button", { name: "Save packing list" });
    fireEvent.click(button);
    expect(screen.getByRole("status").textContent).toBe("The browser could not save the packing list.");
    fireEvent.click(button);
    expect(screen.getByRole("status").textContent).toBe("Packing list prepared for download.");
    expect(writer).toHaveBeenLastCalledWith({
      name: "recovery-packing-list.json", mime: "application/json", content: encodePackingList([second, first]),
    });
  });
});
