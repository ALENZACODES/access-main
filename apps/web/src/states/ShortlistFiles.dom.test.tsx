/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortlistFiles } from "./ShortlistFiles";
import { place } from "./placeFixtures";
import { lintFrench } from "./typography";
import type { SavedFile } from "./downloadFile";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const A = place("a");
const B = place("b", { lat: null, lon: null });

describe("ShortlistFiles", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<ShortlistFiles places={[]} locale="en" />);
    expect(container.innerHTML).toBe("");
  });
  it("is a labelled group with two buttons when some place has a map point", () => {
    render(<ShortlistFiles places={[A, B]} locale="en" />);
    expect(screen.getByRole("group", { name: "Take the list along" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save the list as contact cards (.vcf)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save the list as waypoints (GPX, 1 with a map point)" })).toBeTruthy();
  });
  it("replaces the GPX button with a note when no place has a map point", () => {
    render(<ShortlistFiles places={[B]} locale="en" />);
    expect(screen.queryByRole("button", { name: /GPX/ })).toBeNull();
    expect(screen.getByText(/None of the listed places has a map point/)).toBeTruthy();
  });
  it("saves every listed place as a card, in the list's order", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<ShortlistFiles places={[B, A]} locale="en" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /contact cards/ }));
    const file = onSave.mock.calls[0]![0] as SavedFile;
    expect(file.name).toBe("places.vcf");
    expect(file.content.indexOf("pack-place-b")).toBeLessThan(file.content.indexOf("pack-place-a"));
    expect(document.querySelector("[data-shortlist-files-status]")?.textContent).toBe("Saved places.vcf.");
  });
  it("saves waypoints only for the located places", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<ShortlistFiles places={[A, B]} locale="fr" onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /points de passage/ }));
    const file = onSave.mock.calls[0]![0] as SavedFile;
    expect(file.name).toBe("lieux.gpx");
    expect(file.content.match(/<wpt /g)).toHaveLength(1);
  });
  it("reports a failed save, including a thrown one", () => {
    for (const onSave of [() => false, () => { throw new Error("x"); }]) {
      const { unmount } = render(<ShortlistFiles places={[A]} locale="fr" onSave={onSave} />);
      fireEvent.click(screen.getByRole("button", { name: /fiches de contact/ }));
      expect(document.querySelector("[data-shortlist-files-status]")?.textContent).toBe("Ce navigateur ne peut pas enregistrer de fichier ici.");
      unmount();
    }
  });
  it("is correct French, with no English UNKNOWN translated", () => {
    const { container } = render(<ShortlistFiles places={[B]} locale="fr" />);
    for (const el of container.querySelectorAll("p, button")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    expect(container.textContent).not.toMatch(/INCONN/i);
  });
  it("has no axe violations", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container, unmount } = render(<ShortlistFiles places={[A, B]} locale={locale} />);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      unmount();
    }
  });
});
