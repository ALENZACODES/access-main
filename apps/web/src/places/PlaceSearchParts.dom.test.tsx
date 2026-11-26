/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const manifest = {
  regions: [
    { id: "toronto", label: { en: "Toronto", fr: "Toronto" }, cells: ["a", "b"] },
    { id: "ottawa", label: { en: "Ottawa", fr: "Ottawa" }, cells: ["c"] },
  ],
  search: { a: { bytes: 3_300_000 }, b: { bytes: 2_200_000 }, c: { bytes: 400_000 } },
};
vi.mock("./packAccess.ts", () => ({ sharedPackSource: async () => ({ manifest: async () => manifest }) }));

const { PlaceResults, RegionPicker } = await import("./PlaceSearchParts.tsx");

afterEach(cleanup);

const hit = {
  id: "osm:node/1", name: "Union Station", category: "train_station", city: "Toronto",
  provenance: { source_name: "OpenStreetMap", licence: "ODbL-1.0", source_date: "2026-11-13", tier: 0 },
};

describe("PlaceResults", () => {
  it("shows each place as a link with what it is, where, and where the name came from", () => {
    render(<MemoryRouter><PlaceResults items={[hit]} locale="en" /></MemoryRouter>);
    const list = screen.getByRole("region", { name: "Places found" });
    const link = within(list).getByRole("link", { name: "Union Station" });
    expect(link.getAttribute("href")).toBe("/places/osm%3Anode%2F1");
    expect(within(list).getByText("Train station")).toBeTruthy();
    expect(within(list).getByText(/in Toronto/)).toBeTruthy();
    expect(within(list).getByText("Name from OpenStreetMap (ODbL-1.0), 2026-11-13, tier 0")).toBeTruthy();
  });

  it("shows nothing for an empty or malformed list, and no unknown city", () => {
    const { container } = render(<MemoryRouter><PlaceResults items={[{ nope: 1 }]} locale="en" /></MemoryRouter>);
    expect(container.textContent).toBe("");
    render(<MemoryRouter><PlaceResults items={[{ ...hit, city: "UNKNOWN" }]} locale="en" /></MemoryRouter>);
    expect(screen.queryByText(/in UNKNOWN/)).toBeNull();
  });
});

describe("RegionPicker", () => {
  it("lists the pack's regions with the size of each search list, and reports a choice", async () => {
    const onChange = vi.fn();
    render(<RegionPicker value="toronto" onChange={onChange} locale="en" />);
    const select = await screen.findByLabelText("Area to search");
    expect([...(select as HTMLSelectElement).options].map((option) => option.textContent)).toEqual([
      "Toronto (search list 5.5 MB)",
      "Ottawa (search list 400 KB)",
    ]);
    fireEvent.change(select, { target: { value: "ottawa" } });
    expect(onChange).toHaveBeenCalledWith("ottawa");
  });

  it("uses French units in French", async () => {
    render(<RegionPicker value="toronto" onChange={() => {}} locale="fr" />);
    const select = await screen.findByLabelText("Secteur de recherche");
    expect((select as HTMLSelectElement).options[0]?.textContent).toBe("Toronto (liste de recherche 5,5 Mo)");
  });
});
