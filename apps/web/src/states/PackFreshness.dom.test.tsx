/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { PackFreshness } from "./PackFreshness";

const TODAY = "2026-11-19";
const place = (id: string, retrieved: string | null, over: Record<string, unknown> = {}) => ({
  id,
  name: `Place ${id}`,
  wheelchair: "yes",
  lat: 43.65,
  lon: -79.38,
  provenance: retrieved === null ? null : { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: retrieved },
  ...over,
});
afterEach(cleanup);

describe("PackFreshness", () => {
  const places = [place("a", "2026-11-13"), place("b", "2026-09-20"), place("c", "2024-01-01"), place("d", null)];
  it("shows the summary, range, buckets and undated count in English", async () => {
    const { container } = render(<PackFreshness places={places} locale="en" today={TODAY} />);
    expect(screen.getByRole("heading", { level: 2, name: "How old the saved places are" })).toBeTruthy();
    expect(screen.getByText("Retrieved between 1 January 2024 and 13 November 2026.")).toBeTruthy();
    expect(screen.getByText("1 retrieved within 30 days")).toBeTruthy();
    expect(screen.getByText("1 retrieved 31 to 90 days ago")).toBeTruthy();
    expect(screen.getByText("1 retrieved more than 365 days ago")).toBeTruthy();
    expect(screen.getByText("1 place has no usable source, so no date.")).toBeTruthy();
    expect(container.querySelector("section")?.getAttribute("data-freshness")).toBe("aging");
    expect((await axe.run(container, { rules: { region: { enabled: false } } })).violations).toEqual([]);
  });
  it("is in French", () => {
    const { container } = render(<PackFreshness places={places} locale="fr" today={TODAY} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Ancienneté des lieux enregistrés");
    expect(screen.getByText("Consultés entre le 1er janvier 2024 et le 13 novembre 2026.")).toBeTruthy();
    expect(container.querySelector("section")?.getAttribute("lang")).toBe("fr");
  });
  it("never says the data is current", () => {
    render(<PackFreshness places={[place("a", "2026-11-18")]} locale="en" today={TODAY} />);
    expect(screen.getByText(/not that it is still right/)).toBeTruthy();
  });
  it("says the age is UNKNOWN when no place has a date", () => {
    render(<PackFreshness places={[place("a", null)]} locale="en" today={TODAY} />);
    expect(screen.getByText(/age is UNKNOWN/)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("renders nothing for no readable place", () => {
    for (const p of [[], null, undefined, "x", [null, 5, { id: "" }]]) {
      const { container, unmount } = render(<PackFreshness places={p} locale="en" today={TODAY} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
});
