import { expect, test } from "@playwright/test";
import { readWaypointFile } from "./waypoints.ts";

const namespace = "http://www.topografix.com/GPX/1/1";

function file(points: string, description = "Fixture for a receiving device") {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="fixture" xmlns="' + namespace + '">',
    "<metadata><name>My list</name><desc>" + description + "</desc></metadata>",
    points,
    "</gpx>",
  ].join("\n");
}

function waypoint(lat: string, lon: string, detail = "") {
  return [
    '<wpt lat="' + lat + '" lon="' + lon + '">',
    "<name>Entrée &amp; cour</name>",
    "<desc>From the local pack</desc>",
    detail,
    "<type>UNKNOWN</type></wpt>",
  ].join("\n");
}

test("the waypoint reader decodes XML content and retains document order", async ({ page }) => {
  const link = "https://example.org/?id=1&amp;lang=fr";
  const content = file(
    waypoint("44.00000", "-78.12345", '<src>Édition A</src><link href="' + link + '"/>') +
      waypoint("0.00000", "0.00000"),
    "2 lieux &lt;choisis&gt;",
  );
  const result = await page.evaluate(readWaypointFile, content);
  expect(result.title).toBe("My list");
  expect(result.description).toBe("2 lieux <choisis>");
  expect(result.points).toEqual([
    {
      name: "Entrée & cour",
      latitude: 44,
      longitude: -78.12345,
      description: "From the local pack",
      category: "UNKNOWN",
      source: "Édition A",
      link: "https://example.org/?id=1&lang=fr",
    },
    {
      name: "Entrée & cour",
      latitude: 0,
      longitude: 0,
      description: "From the local pack",
      category: "UNKNOWN",
      source: null,
      link: null,
    },
  ]);
});

test("a coordinate-free document describes omissions without inventing a waypoint", async ({ page }) => {
  const result = await page.evaluate(readWaypointFile, file("", "0 of 2 places have a map point."));
  expect(result.points).toEqual([]);
  expect(result.description).toBe("0 of 2 places have a map point.");
});

test("namespace prefixes are independent of the GPX element names", async ({ page }) => {
  const content = file(waypoint("-90", "180"))
    .replace('xmlns="', 'xmlns:g="')
    .replace(/<(\/?)(gpx|metadata|desc|name|wpt|type)(?=[ >])/g, "<$1g:$2");
  const result = await page.evaluate(readWaypointFile, content);
  expect(result.points[0]).toMatchObject({ latitude: -90, longitude: 180 });
});

test("a foreign extension cannot masquerade as a coordinate or source", async ({ page }) => {
  const content = file(
    '<wpt xmlns="urn:other" lat="0" lon="0"/>' +
    waypoint("46", "-79", '<src xmlns="urn:other">Wrong publisher</src>'),
  );
  const result = await page.evaluate(readWaypointFile, content);
  expect(result.points).toHaveLength(1);
  expect(result.points[0]?.source).toBeNull();
});

test("missing, empty and malformed latitude never become zero", async ({ page }) => {
  const original = waypoint("0", "2");
  for (const attribute of ["", 'lat=""', 'lat=" "', 'lat="0x10"', 'lat="1e1"', 'lat="NaN"']) {
    await expect(page.evaluate(readWaypointFile, file(original.replace('lat="0"', attribute))))
      .rejects.toThrow("Invalid waypoint lat decimal");
  }
});

test("a second hemisphere cannot be silently restored by clamping", async ({ page }) => {
  for (const [latitude, longitude, invalidAxis] of [
    ["90.00001", "0", "lat"],
    ["-90.00001", "1", "lat"],
    ["0", "180.00001", "lon"],
    ["1", "-180.00001", "lon"],
  ] as const) {
    await expect(page.evaluate(readWaypointFile, file(waypoint(latitude, longitude))))
      .rejects.toThrow("Waypoint " + invalidAxis + " out of range");
  }
});

test("corrupt XML and documents from other formats are refused", async ({ page }) => {
  const sample = file(waypoint("45", "-79"));
  await expect(page.evaluate(readWaypointFile, sample.replace("</wpt>", ""))).rejects.toThrow("Malformed");
  await expect(page.evaluate(readWaypointFile, "<html><body/></html>")).rejects.toThrow("GPX 1.1 document");
  await expect(page.evaluate(readWaypointFile, sample.replace(namespace, "urn:custom"))).rejects.toThrow("GPX 1.1 document");
  await expect(page.evaluate(readWaypointFile, sample.replace('version="1.1"', 'version="1.0"')))
    .rejects.toThrow("version and creator");
  await expect(page.evaluate(readWaypointFile, sample.replace('creator="fixture"', ""))).rejects.toThrow("version and creator");
});

test("unexpected external document types and route geometry are refused", async ({ page }) => {
  const original = file("");
  await expect(page.evaluate(readWaypointFile, original.replace("<gpx ", "<!DOCTYPE gpx>\n<gpx ")))
    .rejects.toThrow("Unexpected document type");
  for (const geometry of ["<trk><trkseg/></trk>", "<rte><rtept/></rte>"]) {
    await expect(page.evaluate(readWaypointFile, file(geometry))).rejects.toThrow("only waypoints");
  }
});

test("a missing or ambiguous waypoint identity is a reading error", async ({ page }) => {
  const point = waypoint("45", "-79");
  for (const replacement of ["", "<name>A</name><name>B</name>"]) {
    const content = file(point.replace("<name>Entrée &amp; cour</name>", replacement));
    await expect(page.evaluate(readWaypointFile, content)).rejects.toThrow("number of name");
  }
  await expect(page.evaluate(readWaypointFile, file(point.replace("Entrée &amp; cour", " "))))
    .rejects.toThrow("Missing text");
  await expect(page.evaluate(readWaypointFile, file(point.replace("Entrée &amp; cour", "<b>Room</b>"))))
    .rejects.toThrow("Nested markup");
});

test("an invalid link cannot overwrite a valid first source", async ({ page }) => {
  const repeated = waypoint("45", "-79", "<src>First</src><src>Second</src>");
  await expect(page.evaluate(readWaypointFile, file(repeated))).rejects.toThrow("number of src");
  for (const link of ["<link/>", '<link href="http://example.org/place"/>']) {
    await expect(page.evaluate(readWaypointFile, file(waypoint("45", "-79", link)))).rejects.toThrow("HTTPS");
  }
});
