import { describe, expect, it } from "vitest";
import { boardingStatus, displayName, fieldLabel, headlineStatus, noteLines, publishedWashroomStatus, valueLabel, wheelchairStatus } from "./placeText.ts";

describe("map place text", () => {
  it("reads OpenStreetMap wheelchair values, with limited as partly", () => {
    expect(wheelchairStatus("designated")).toBe("yes");
    expect(wheelchairStatus("limited")).toBe("partly");
    expect(wheelchairStatus("NO")).toBe("no");
    expect(wheelchairStatus("UNKNOWN")).toBe("unknown");
  });

  it("reads GTFS boarding codes: 0 is no information, not no", () => {
    expect(boardingStatus("1")).toBe("yes");
    expect(boardingStatus("2")).toBe("no");
    expect(boardingStatus("0")).toBe("unknown");
  });

  it("reads a city's washroom note", () => {
    expect(publishedWashroomStatus("Accessible=Yes")).toBe("yes");
    expect(publishedWashroomStatus("Accessible Stall, Entrance at Grade")).toBe("yes");
    expect(publishedWashroomStatus("None")).toBe("unknown");
  });

  it("picks the headline fact by kind", () => {
    const facts: Record<string, string> = { wheelchair_boarding: "2", wheelchair: "yes" };
    expect(headlineStatus("transit", (field) => facts[field])).toBe("no");
    expect(headlineStatus("washroom", (field) => ({ published_accessibility: "Accessible=Yes" } as Record<string, string>)[field])).toBe("yes");
    expect(headlineStatus("venue", () => undefined)).toBe("unknown");
  });

  it("softens all-capital names and keeps mixed case", () => {
    expect(displayName("BARTLETT PARKETTE")).toBe("Bartlett Parkette");
    expect(displayName("BEAVER - LIGHTBOURN PARKETTE")).toBe("Beaver - Lightbourn Parkette");
    expect(displayName("Aunty Em's Deli & Coffee")).toBe("Aunty Em's Deli & Coffee");
    expect(displayName("TTC")).toBe("TTC");
  });

  it("labels fields and values for readers in both languages", () => {
    expect(fieldLabel("en", "capacity_disabled")).toBe("Accessible parking spaces");
    expect(fieldLabel("en", "some_new_field")).toBe("Some new field");
    expect(valueLabel("fr", "wheelchair", "limited")).toBe("En partie");
    expect(valueLabel("en", "wheelchair_boarding", "1")).toBe("Yes, on some or all vehicles");
    expect(valueLabel("en", "capacity_disabled", "2")).toBe("2");
    expect(valueLabel("en", "wheelchair", "yes;no")).toBe("Yes, No");
  });

  it("splits key=value notes into lines", () => {
    expect(noteLines("en", "AODA_TYPE=B; NOTES=Diagonal Street")).toEqual([
      { label: "AODA type", text: "B" }, { label: "Notes", text: "Diagonal Street" },
    ]);
    expect(noteLines("en", "There are elevators inside")).toEqual([{ label: null, text: "There are elevators inside" }]);
  });
});
