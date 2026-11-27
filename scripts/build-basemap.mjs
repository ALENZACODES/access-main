#!/usr/bin/env node
// Build the street basemap the map draws under the places: OpenStreetMap roads,
// street names, parks and water for each pack region, served from this site so
// no outside map server sees where anyone looks.
//
//   node scripts/build-basemap.mjs --manifest <pack manifest.json> --out <dir>
//        --pmtiles <path to the pmtiles CLI> --assets <basemaps-assets checkout>
//        [--source <basemap build URL>] [--regions toronto,ottawa]
//
// Writes <out>/index.json, one <region>.pmtiles per region (cut from the
// Protomaps daily OpenStreetMap build with `pmtiles extract`), an Ontario
// overview for low zooms, and the Latin glyph ranges and sprites the style uses.
// Each file stays under GitHub Pages' 100 MB limit: a region that would be
// larger is cut at a lower top zoom (the map then enlarges the top level).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_FILE_BYTES = 95_000_000;
export const MAX_TOTAL_BYTES = 650_000_000;
export const ZOOMS = [15, 14, 13];
export const ONTARIO_BBOX = [-95.2, 41.6, -74.3, 56.9];
export const OVERVIEW_MAXZOOM = 8;
/** Latin, Latin-1, Latin Extended A and B, general punctuation: enough for English and French place names. */
export const GLYPH_RANGES = ["0-255", "256-511", "512-767", "7680-7935", "8192-8447"];
export const FONTSTACKS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
export const ATTRIBUTION = "© OpenStreetMap contributors (ODbL) · Protomaps";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

/** The regions to cut: every pack region with its own box, except the whole-province one. */
export function regionsFrom(manifest, only) {
  const wanted = only ? new Set(only.split(",").map((id) => id.trim()).filter(Boolean)) : null;
  return (manifest.regions ?? [])
    .filter((region) => region.id !== "ontario-all" && Array.isArray(region.bbox) && region.bbox.length === 4)
    .filter((region) => !wanted || wanted.has(region.id))
    .map((region) => ({ id: region.id, label: region.label, bbox: region.bbox.map(Number) }));
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function extract(pmtiles, source, output, bbox, maxzoom) {
  execFileSync(pmtiles, ["extract", source, output, `--bbox=${bbox.join(",")}`, `--maxzoom=${maxzoom}`], { stdio: "inherit" });
}

async function main() {
  const opts = args(process.argv.slice(2));
  for (const need of ["manifest", "out", "pmtiles", "source"]) {
    if (!opts[need]) throw new Error(`--${need} is required`);
  }
  const manifest = JSON.parse(await readFile(opts.manifest, "utf8"));
  const out = path.resolve(opts.out);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const files = [];
  let total = 0;
  for (const region of regionsFrom(manifest, opts.regions)) {
    const file = path.join(out, `${region.id}.pmtiles`);
    let made = null;
    for (const maxzoom of ZOOMS) {
      extract(opts.pmtiles, opts.source, file, region.bbox, maxzoom);
      const bytes = (await stat(file)).size;
      console.log(`basemap: ${region.id} at zoom ${maxzoom}: ${bytes} bytes`);
      if (bytes <= MAX_FILE_BYTES) { made = { maxzoom, bytes }; break; }
    }
    if (!made) throw new Error(`basemap: ${region.id} is over ${MAX_FILE_BYTES} bytes even at zoom ${ZOOMS.at(-1)}`);
    total += made.bytes;
    files.push({ id: region.id, label: region.label, bbox: region.bbox, path: `${region.id}.pmtiles`, bytes: made.bytes, maxzoom: made.maxzoom, sha256: await sha256(file) });
  }

  const overviewFile = path.join(out, "ontario-overview.pmtiles");
  extract(opts.pmtiles, opts.source, overviewFile, ONTARIO_BBOX, OVERVIEW_MAXZOOM);
  const overviewBytes = (await stat(overviewFile)).size;
  if (overviewBytes > MAX_FILE_BYTES) throw new Error(`basemap: overview is ${overviewBytes} bytes`);
  total += overviewBytes;
  if (total > MAX_TOTAL_BYTES) throw new Error(`basemap: ${total} bytes in all, over ${MAX_TOTAL_BYTES}`);

  if (opts.assets) {
    for (const stack of FONTSTACKS) {
      await mkdir(path.join(out, "fonts", stack), { recursive: true });
      for (const range of GLYPH_RANGES) {
        const from = path.join(opts.assets, "fonts", stack, `${range}.pbf`);
        await cp(from, path.join(out, "fonts", stack, `${range}.pbf`)).catch(() => console.warn(`basemap: no glyphs ${stack} ${range}`));
      }
    }
    const spriteDir = path.join(opts.assets, "sprites", "v4");
    await mkdir(path.join(out, "sprites"), { recursive: true });
    for (const name of await readdir(spriteDir).catch(() => [])) {
      if (/^light(@2x)?\.(json|png)$/.test(name)) await cp(path.join(spriteDir, name), path.join(out, "sprites", name));
    }
  }

  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    source: opts.source.replace(/^.*\//, ""),
    attribution: ATTRIBUTION,
    licence: "ODbL-1.0",
    overview: { path: "ontario-overview.pmtiles", bbox: ONTARIO_BBOX, bytes: overviewBytes, maxzoom: OVERVIEW_MAXZOOM, sha256: await sha256(overviewFile) },
    regions: files,
    glyphs: opts.assets ? "fonts/{fontstack}/{range}.pbf" : null,
    sprite: opts.assets ? "sprites/light" : null,
  };
  await writeFile(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`basemap: ${files.length} regions and an overview, ${total} bytes`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
