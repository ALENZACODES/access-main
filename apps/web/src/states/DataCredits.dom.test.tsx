/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { DataCredits } from "./DataCredits";
import type { CreditRecord } from "./dataCredits";
import type { Provenance } from "./provenance";

const TODAY = "2026-11-19";
const prov = (over: Partial<Provenance> = {}): Provenance => ({ source: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrievedOn: "2026-11-13", url: "https://www.openstreetmap.org/way/1", ...over });
const records: CreditRecord[] = [
  { provenance: prov(), tier: 0 },
  { provenance: prov({ retrievedOn: "2026-11-01" }), tier: null },
  { provenance: prov({ source: "Open Data Toronto", licence: "OGL-Ontario-1.0", retrievedOn: "2024-03-03", url: undefined }), tier: 1 },
  { provenance: null, tier: 0 },
];
afterEach(cleanup);

describe("DataCredits", () => {
  it("lists each source with licence link, count, dates and tiers, and the required credit, in English", async () => {
    const { container } = render(<DataCredits records={records} locale="en" today={TODAY} />);
    expect(screen.getByRole("heading", { level: 2, name: "Sources of the records saved on this device" })).toBeTruthy();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const osm = within(items[0]!);
    expect(osm.getByRole("heading", { level: 3 }).textContent).toBe("OpenStreetMap, Geofabrik Ontario extract");
    expect(osm.getByRole("link", { name: "ODbL 1.0" }).getAttribute("href")).toBe("https://opendatacommons.org/licenses/odbl/1-0/");
    expect(osm.getByText("2 records")).toBeTruthy();
    expect(osm.getByText("Retrieved 1 November 2026 to 13 November 2026")).toBeTruthy();
    expect(osm.getByText("Tier 0: 1; Tier UNKNOWN: 1")).toBeTruthy();
    expect(within(items[1]!).getByText("1 may be out of date.")).toBeTruthy();
    expect(screen.getByText(/1 record carry no usable source/)).toBeTruthy();
    expect((await axe.run(container, { rules: { region: { enabled: false } } })).violations).toEqual([]);
  });
  it("is in French with the token UNKNOWN and French typography", async () => {
    const { container } = render(<DataCredits records={records} locale="fr" today={TODAY} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Sources des enregistrements sur cet appareil");
    const tiers = screen.getAllByText((_, el) => el?.tagName === "P" && el.textContent === "Niveau 0\u00a0: 1\u202f; Niveau UNKNOWN\u00a0: 1");
    expect(tiers).toHaveLength(1);
    expect(screen.getByText("Consulté du 1er novembre 2026 au 13 novembre 2026")).toBeTruthy();
    expect(container.querySelector("section")?.getAttribute("lang")).toBe("fr");
    expect(container.textContent).not.toMatch(/INCONNU/);
  });
  it("shows no credit line when no record is OpenStreetMap data", () => {
    render(<DataCredits records={[{ provenance: prov({ source: "Open Data Toronto", licence: "CC0-1.0" }), tier: 0 }]} locale="en" today={TODAY} />);
    expect(screen.queryByText("© OpenStreetMap contributors")).toBeNull();
  });
  it("leaves out the credit line when the page already shows it", () => {
    render(<DataCredits records={records} locale="en" today={TODAY} showOsmCredit={false} />);
    expect(screen.queryByText("© OpenStreetMap contributors")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
  it("says there is nothing to credit with no records, without a list", () => {
    render(<DataCredits records={[]} locale="en" today={TODAY} />);
    expect(screen.getByText("No saved records on this device, so there is nothing to credit yet.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("opens links safely", () => {
    render(<DataCredits records={records} locale="en" today={TODAY} />);
    for (const a of screen.getAllByRole("link")) expect(a.getAttribute("rel")).toBe("noreferrer noopener");
  });
});
