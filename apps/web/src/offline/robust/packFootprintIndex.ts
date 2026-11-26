import type { PackManifest, PackPart, PackSourceEntry } from "../../../../../packages/data-client/src/types.ts";

export interface FootprintSource {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
}

export interface FootprintPart {
  readonly hash: string;
  /** Null when a size is absent, invalid, or disagrees with another declaration. */
  readonly bytes: number | null;
  readonly sources: readonly FootprintSource[];
}

export interface FootprintCell {
  readonly id: string;
  readonly hashes: readonly string[];
  readonly complete: boolean;
}

export interface FootprintRegion {
  readonly id: string;
  readonly label: { readonly en: string; readonly fr: string };
  readonly cellIds: readonly string[];
  readonly complete: boolean;
  readonly withheldCount: number;
}

export interface FootprintIndex {
  readonly builtAt: string;
  readonly regions: ReadonlyMap<string, FootprintRegion>;
  readonly cells: ReadonlyMap<string, FootprintCell>;
  readonly parts: ReadonlyMap<string, FootprintPart>;
}

interface IndexedPart {
  bytes: number | null;
  sources: Map<string, FootprintSource>;
}

interface SourceListing {
  web: boolean;
  held: boolean;
  credits: Map<string, FootprintSource>;
}

const hashPattern = /^[a-f0-9]{64}$/;
const stringId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function retrievedDay(value: unknown): string {
  if (typeof value !== "string") return "";
  const day = /^(\d{4}-\d{2}-\d{2})(?:T.+)?$/.exec(value)?.[1];
  if (!day || !Number.isFinite(Date.parse(value))) return "";
  const utc = new Date(day + "T00:00:00Z");
  return Number.isFinite(utc.valueOf()) && utc.toISOString().startsWith(day) ? day : "";
}

function indexSources(sources: readonly PackSourceEntry[]): Map<string, SourceListing> {
  const listings = new Map<string, SourceListing>();
  for (const source of sources) {
    if (!stringId(source?.sourceId)) continue;
    let listing = listings.get(source.sourceId);
    if (!listing) {
      listing = { web: false, held: false, credits: new Map() };
      listings.set(source.sourceId, listing);
    }
    if (source.inWebPack !== true) {
      if (source.inWebPack === false) listing.held = true;
      continue;
    }
    listing.web = true;
    const name = typeof source.name === "string" ? source.name.trim() : "";
    const licence = typeof source.licence === "string" ? source.licence.trim() : "";
    const date = retrievedDay(source.retrieved);
    if (name || licence || date) {
      listing.credits.set(JSON.stringify([name, licence, date]), { name, licence, date });
    }
  }
  return listings;
}

function addPart(
  part: PackPart,
  sources: SourceListing | undefined,
  parts: Map<string, IndexedPart>,
  hashes: Set<string>,
): boolean {
  if (typeof part?.sha256 !== "string" || !hashPattern.test(part.sha256)) return false;
  if (!stringId(part.path)) return false;
  const hash = part.sha256;
  const bytes = Number.isSafeInteger(part.bytes) && part.bytes >= 0 ? part.bytes : null;
  hashes.add(hash);
  let existing = parts.get(hash);
  if (!existing) {
    existing = { bytes, sources: new Map() };
    parts.set(hash, existing);
  } else if (existing.bytes !== bytes) {
    // A third declaration agreeing with either original must not resolve the conflict.
    existing.bytes = null;
  }
  if (sources?.web) {
    for (const [key, credit] of sources.credits) existing.sources.set(key, credit);
  }
  return true;
}

/** Count builder exclusions independently of what the current device might still hold. */
function withheldByCell(pack: PackManifest): Map<string, number> {
  const paths = new Map<string, Set<string>>();
  for (const notice of Array.isArray(pack.withheld) ? pack.withheld : []) {
    if (!stringId(notice?.cell)) continue;
    let seen = paths.get(notice.cell);
    if (!seen) {
      seen = new Set();
      paths.set(notice.cell, seen);
    }
    seen.add(JSON.stringify([notice.path, notice.tranche, notice.sourceId]));
  }
  return new Map([...paths].map(([cell, notices]) => [cell, notices.size]));
}

function ownValue<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

function cellFootprint(
  pack: PackManifest,
  id: string,
  sources: ReadonlyMap<string, SourceListing>,
  parts: Map<string, IndexedPart>,
): FootprintCell {
  const hashes = new Set<string>();
  let declared = false;
  let complete = true;
  const search = ownValue(pack.search, id);
  if (search !== undefined) {
    declared = true;
    // Unlike a tranche part, a search index is downloadable without a source ID.
    const listing = search?.sourceId ? sources.get(search.sourceId) : undefined;
    if (!addPart(search, listing, parts, hashes)) complete = false;
  }
  for (const tranche of Object.values(pack.tranches)) {
    if (!tranche?.cells) {
      complete = false;
      continue;
    }
    const entry = ownValue(tranche.cells, id);
    if (entry === undefined) continue;
    declared = true;
    if (!Array.isArray(entry?.parts)) {
      complete = false;
      continue;
    }
    for (const part of entry.parts) {
      const listing = part?.sourceId ? sources.get(part.sourceId) : undefined;
      if (!listing || (!listing.web && !listing.held)) {
        complete = false;
        continue;
      }
      if (!listing.web) continue;
      if (listing.held) complete = false;
      if (!addPart(part, listing, parts, hashes)) complete = false;
    }
  }
  return { id, hashes: [...hashes], complete: declared && complete };
}

/**
 * Index the parts reachable from selectable regions. Selection follows the data-client's
 * search and inWebPack tranche policy, with content identity shared across every cell.
 * Tile archives have a separate transfer path. This calculation never opens the store.
 */
export function buildFootprintIndex(pack: PackManifest): FootprintIndex {
  const sources = indexSources(pack.sources);
  const indexedParts = new Map<string, IndexedPart>();
  const cells = new Map<string, FootprintCell>();
  const regions = new Map<string, FootprintRegion>();
  const withheld = withheldByCell(pack);
  for (const region of pack.regions) {
    if (!stringId(region?.id)) continue;
    const cellIds = new Set<string>();
    let complete = Array.isArray(region.cells);
    for (const cell of complete ? region.cells : []) {
      if (!stringId(cell)) {
        complete = false;
        continue;
      }
      cellIds.add(cell);
    }
    const first = regions.get(region.id);
    if (first) {
      // downloadRegion resolves the first matching region ID. A conflicting later
      // definition makes its total uncertain and must never silently expand it.
      if (!complete || first.cellIds.length !== cellIds.size || first.cellIds.some((id) => !cellIds.has(id))) {
        regions.set(region.id, { ...first, complete: false });
      }
      continue;
    }
    let withheldCount = 0;
    for (const id of cellIds) {
      if (!cells.has(id)) cells.set(id, cellFootprint(pack, id, sources, indexedParts));
      withheldCount += withheld.get(id) ?? 0;
    }
    regions.set(region.id, {
      id: region.id,
      label: {
        en: stringId(region.label?.en) ? region.label.en : region.id,
        fr: stringId(region.label?.fr) ? region.label.fr : region.id,
      },
      cellIds: [...cellIds],
      complete,
      withheldCount,
    });
  }

  const parts = new Map<string, FootprintPart>();
  for (const [hash, part] of indexedParts) {
    parts.set(hash, { hash, bytes: part.bytes, sources: [...part.sources.values()] });
  }
  // A conflicting size can be discovered in a later region. Complete membership and
  // size are reported only after every reachable declaration has been compared.
  for (const [id, cell] of cells) {
    if (cell.complete && cell.hashes.some((hash) => parts.get(hash)?.bytes === null)) {
      cells.set(id, { ...cell, complete: false });
    }
  }
  for (const [id, region] of regions) {
    if (region.complete && region.cellIds.some((cell) => !cells.get(cell)?.complete)) {
      regions.set(id, { ...region, complete: false });
    }
  }
  return { builtAt: pack.builtAt, regions, cells, parts };
}
