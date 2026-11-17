/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

/**
 * lane-packages.d.ts copies the journey-data package's request and result
 * types. This test reads both and fails when a pinned package interface gains
 * or loses a field, so the copy cannot drift silently.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "../../../../.lanes/access-maps/packages/journey-data/src");
const declared = readFileSync(path.join(here, "lane-packages.d.ts"), "utf8");
const block = /declare module "@access-maps\/journey-data" \{([\s\S]*?)\n\}/.exec(declared)?.[1] ?? "";

function fields(source: string, name: string): string[] {
  const body = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\s*\\}`).exec(source)?.[1];
  if (body === undefined) throw new Error(`interface ${name} not found`);
  // One-line interfaces list their fields separated by ";".
  return [...body.matchAll(/(?:^|[;{\n])\s*([A-Za-z_]+)\??\s*[:(]/g)].map((match) => match[1]!).sort();
}

function oneLine(source: string, name: string): string[] {
  const body = new RegExp(`export interface ${name} \\{([^\\n]*)\\}`).exec(source)?.[1];
  if (body === undefined) return fields(source, name);
  return body.split(";").map((part) => /([A-Za-z_]+)\??\s*:/.exec(part)?.[1]).filter((key): key is string => Boolean(key)).sort();
}

const pinned = existsSync(pkg);

describe.skipIf(!pinned)("journey-data declarations match the pinned package", () => {
  const read = (file: string) => readFileSync(path.join(pkg, file), "utf8");
  const cases: Array<[string, string]> = [
    ["JourneyRequest", "index.ts"],
    ["JourneyResult", "index.ts"],
    ["JourneyModule", "index.ts"],
    ["Evidence", "route.ts"],
    ["RollRoute", "route.ts"],
    ["RollProfile", "route.ts"],
    ["StopWithAccess", "transit.ts"],
    ["TransitOption", "transit.ts"],
    ["Point", "geometry.ts"],
    ["PackSourceEntry", "pack-types.ts"],
  ];
  it.each(cases)("%s", (name, file) => {
    expect(oneLine(block, name)).toEqual(oneLine(read(file), name));
  });

  it("the messages the adapter reads exist in both languages", async () => {
    const { messages } = await import("@access-maps/journey-data");
    for (const locale of ["en", "fr"] as const) {
      for (const key of ["roll", "far", "noRoute", "barrier", "unverified"] as const) expect(typeof messages[locale][key]).toBe("string");
    }
  });
});

describe("journey route without the pinned package", () => {
  it("is unavailable, not ready, when the build's stand-in planner is bound", async () => {
    vi.resetModules();
    vi.doMock("@access-maps/journey-data", () => import("./lane-fallbacks.ts"));
    const { createJourneyModule } = await import("./lane-adapters.ts");
    const { createFixtureSource } = await import("@access-main/data-client");
    const module = createJourneyModule(createFixtureSource([], []));
    const ctx = { locale: "en" as const, offline: false, profile: null, nowIso: "2026-11-16T12:00:00Z" };
    expect(await module.plan({ originLabel: null, destinationLabel: null, routingPreference: null, offline: false }, ctx))
      .toMatchObject({ availability: "stub", items: [], messageKey: "modules.unavailable" });
    vi.doUnmock("@access-maps/journey-data");
  });
});
