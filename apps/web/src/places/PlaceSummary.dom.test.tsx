/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PackRecord, PackSourceEntry } from "@access/shared";

const nearby = vi.fn();
vi.mock("./packAccess.ts", () => ({ sharedPackSource: async () => ({ nearby }) }));

const { PlaceSummary } = await import("./PlaceSummary.tsx");
const { placeHintFor } = await import("./placeHints.ts");

const library: PackSourceEntry = {
  sourceId: "toronto-library-branches", name: "Toronto Public Library branches", licence: "OGL-Toronto-1.0", licenceUrl: "", attribution: "",
  retrieved: "2026-11-16", shareAlike: false, inWebPack: true, heldReason: null,
};
const parks: PackSourceEntry = { ...library, sourceId: "toronto-park-washrooms", name: "Toronto park washrooms" };
const ttc: PackSourceEntry = { ...library, sourceId: "gtfs-ttc", name: "TTC stops", licence: "OGL-Toronto-1.0" };
const l = (value: string | number) => ({ value, source_id: library.sourceId, licence: library.licence, retrieved_at: "2026-11-16", tier: 0 as const });
const p = (value: string | number) => ({ value, source_id: parks.sourceId, licence: parks.licence, retrieved_at: "2026-11-16", tier: 0 as const });
const t = (value: string | number) => ({ value, source_id: ttc.sourceId, licence: ttc.licence, retrieved_at: "2026-11-10", tier: 0 as const });

const branch: PackRecord = {
  id: "toronto-library-branches:ACD", tranche: "venue", region: "n43.5_w079.5",
  fields: {
    name: l("Albert Campbell"), category: l("library"), lat: l(43.70814), lon: l(-79.26911),
    addr_housenumber: l("496"), addr_street: l("Birchmount Road"), addr_city: l("Toronto"), addr_postcode: l("M1K 1N8"),
    opening_hours: l("Mo-Th 09:00-20:30"), website: l("https://www.tpl.ca/albertcampbell"),
    wheelchair: l("yes"), automatic_door: l("motion"), step_count: l("0"), door_width: l("0.9"),
    hearing_loop: l("yes"), braille: l("UNKNOWN"), tactile_paving: l("UNKNOWN"),
  },
};
const washroom: PackRecord = {
  id: "toronto-park-washrooms:9", tranche: "washroom", region: "n43.5_w079.5",
  fields: { name: p("Birchmount Park Washroom"), lat: p(43.7085), lon: p(-79.2695), wheelchair: p("limited") },
};
const stop: PackRecord = {
  id: "gtfs-ttc:1234", tranche: "transit", region: "n43.5_w079.5",
  fields: { name: t("Birchmount Rd at Danforth Rd"), lat: t(43.7083), lon: t(-79.2690), wheelchair_boarding: t("some_vehicles_accessible") },
};

afterEach(() => {
  cleanup();
  nearby.mockReset();
});

function show(locale: "en" | "fr", record = branch) {
  nearby.mockImplementation(async (_point: unknown, opts: { tranches: string[] }) =>
    opts.tranches[0] === "washroom" ? [{ record: washroom, distanceM: 64 }] : opts.tranches[0] === "transit" ? [{ record: stop, distanceM: 1180 }] : []);
  return render(<MemoryRouter><PlaceSummary record={record} sources={[library, parks, ttc]} locale={locale} /></MemoryRouter>);
}

describe("PlaceSummary", () => {
  it("lists what the place is, its address, hours, website and point, with where the facts came from", () => {
    show("en");
    const glance = screen.getByRole("region", { name: "At a glance" });
    expect(within(glance).getByText("Library")).toBeTruthy();
    expect(within(glance).getByText("496 Birchmount Road, Toronto, M1K 1N8")).toBeTruthy();
    expect(within(glance).getByText("Mo-Th 09:00-20:30")).toBeTruthy();
    const site = within(glance).getByRole("link", { name: "www.tpl.ca/albertcampbell" });
    expect(site.getAttribute("href")).toBe("https://www.tpl.ca/albertcampbell");
    expect(site.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(glance).getByText("43.70814, -79.26911")).toBeTruthy();
    expect(within(glance).getByText(/Toronto Public Library branches \(OGL-Toronto-1\.0\), 2026-11-16, tier 0/)).toBeTruthy();
  });

  it("says getting in plainly and leaves out what is unknown", () => {
    show("en");
    const getIn = screen.getByRole("region", { name: "Getting in and around" });
    expect(within(getIn).getByText("Wheelchair access").nextSibling?.textContent).toBe("Yes");
    expect(within(getIn).getByText("Automatic door").nextSibling?.textContent).toBe("Motion");
    expect(within(getIn).getByText("Steps").nextSibling?.textContent).toBe("0");
    expect(within(getIn).getByText("Door width").nextSibling?.textContent).toBe("0.9 m");
    expect(within(getIn).queryByText("Tactile paving")).toBeNull();
    const inside = screen.getByRole("region", { name: "Inside and facilities" });
    expect(within(inside).getByText("Hearing loop").nextSibling?.textContent).toBe("Yes");
    expect(within(inside).queryByText("Braille")).toBeNull();
  });

  it("says so when nothing is known, rather than guessing", () => {
    show("en", { ...branch, fields: { name: branch.fields.name! } });
    expect(within(screen.getByRole("region", { name: "Getting in and around" })).getByText(/Nothing is recorded here yet/)).toBeTruthy();
  });

  it("lists nearby washrooms and transit stops with distance and access, and links to each", async () => {
    show("en");
    const near = screen.getByRole("region", { name: "Nearby, within 800 m" });
    const washroomLink = await within(near).findByRole("link", { name: "Birchmount Park Washroom" });
    expect(washroomLink.getAttribute("href")).toBe("/places/toronto-park-washrooms%3A9");
    expect(washroomLink.parentElement?.textContent).toContain("60 m away");
    expect(washroomLink.parentElement?.textContent).toContain("Wheelchair access: Partly");
    const stopLink = within(near).getByRole("link", { name: "Birchmount Rd at Danforth Rd" });
    expect(stopLink.parentElement?.textContent).toContain("1.2 km away");
    expect(stopLink.parentElement?.textContent).toContain("On some vehicles");
    // Where each nearby place is stays in memory, not in the link.
    expect(placeHintFor(washroom.id)).toEqual({ cells: ["n43.5_w079.5"], tranche: "washroom" });
  });

  it("names an unnamed nearby washroom plainly, never by its record id", async () => {
    nearby.mockImplementation(async (_point: unknown, opts: { tranches: string[] }) =>
      opts.tranches[0] === "washroom" ? [{ record: { ...washroom, id: "osm:toilets-at:node/1", fields: { lat: p(43.7), lon: p(-79.27), facility_type: p("toilets") } }, distanceM: 130 }] : []);
    render(<MemoryRouter><PlaceSummary record={branch} sources={[library, parks, ttc]} locale="en" /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Washroom, no name recorded" })).toBeTruthy();
    expect(screen.queryByText(/osm:toilets-at/)).toBeNull();
  });

  it("speaks French, with French spacing and the source text marked as English", async () => {
    show("fr");
    expect(screen.getByRole("heading", { name: "En bref" })).toBeTruthy();
    expect(screen.getByText("Accès en fauteuil roulant").nextSibling?.textContent).toBe("Oui");
    expect(screen.getByText("Largeur de la porte").nextSibling?.textContent).toBe("0,9 m");
    expect(screen.getByText("Library").getAttribute("lang")).toBe("en");
    const near = screen.getByRole("region", { name: "À proximité, à moins de 800 m" });
    expect((await within(near).findByRole("link", { name: "Birchmount Rd at Danforth Rd" })).parentElement?.textContent).toContain("à 1,2 km");
  });
});
