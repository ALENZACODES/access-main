import type { PackSource } from "@access-main/data-client";
import { createJourneyModule as createPlanner, messages, type Evidence, type JourneyResult, type RollProfile } from "@access-maps/journey-data";
import { emptyModuleResult, type JourneyEndpoint, type JourneyModule, type JourneyPlan, type JourneyRequest, type ModuleContext, type ModuleResult } from "@access/shared";
import { resolvePoint, resolveRecord, type ResolvedPlace, type ResolveSource, type SourcedPoint } from "./journey-resolve.ts";
import { LANE_STRINGS } from "./strings.ts";

type Locale = "en" | "fr";
type Bbox = [number, number, number, number];

/** Message keys a ready journey result can carry. Each one has a sentence under `journey` in LANE_STRINGS. */
export const JOURNEY_MESSAGES = ["awaiting", "needBoth", "notFound", "ambiguous", "noCoordinates", "noArea", "tooFar", "noRoute", "planned"] as const;
export type JourneyMessage = (typeof JOURNEY_MESSAGES)[number];

function ready(items: JourneyPlan[], message: JourneyMessage, asOf: string | null = null): ModuleResult<JourneyPlan> {
  return { moduleId: "journey", availability: "ready", items, messageKey: `journey.${message}`, asOf, liveStatus: "unavailable" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBbox(value: unknown): value is Bbox {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

/** Region boxes and the cells that carry path records, read defensively from the pack manifest. */
function manifestArea(manifest: unknown): { regions: Bbox[]; pathCells: Set<string> } {
  const regions: Bbox[] = [];
  const pathCells = new Set<string>();
  if (!isRecord(manifest)) return { regions, pathCells };
  if (Array.isArray(manifest.regions)) for (const region of manifest.regions) if (isRecord(region) && isBbox(region.bbox)) regions.push(region.bbox);
  const tranches = isRecord(manifest.tranches) ? manifest.tranches : {};
  const path = isRecord(tranches.path) && isRecord(tranches.path.cells) ? tranches.path.cells : {};
  for (const [cell, entry] of Object.entries(path)) {
    if (isRecord(entry) && Array.isArray(entry.parts) && entry.parts.length > 0) pathCells.add(cell);
  }
  return { regions, pathCells };
}

function inside(point: SourcedPoint, bbox: Bbox): boolean {
  return point.lon >= bbox[0] && point.lon <= bbox[2] && point.lat >= bbox[1] && point.lat <= bbox[3];
}

/** Step-free is always required. Grade and width limits are passed only when the person recorded them. */
export function rollProfile(ctx: ModuleContext): RollProfile {
  const width = ctx.profile?.chair_width_mm;
  return { stepFreeRequired: true, maxGradePercent: null, widthMm: typeof width === "number" && width > 0 ? width : null };
}

/** The weakest evidence on the route: the lowest tier, and its own prototype label. */
function weakest(evidence: readonly Evidence[]): Evidence | null {
  const tiered = evidence.filter((item) => typeof item.tier === "number");
  if (tiered.length === 0) return null;
  return tiered.reduce((low, item) => ((item.tier as number) < (low.tier as number) ? item : low));
}

function latest(dates: readonly string[]): string | null {
  return dates.filter((date) => /^\d{4}-\d{2}-\d{2}/.test(date)).sort().at(-1) ?? null;
}

function endpoint(role: JourneyEndpoint["role"], place: Extract<ResolvedPlace, { status: "resolved" }>, sourceNames: ReadonlyMap<string, string>): JourneyEndpoint {
  // The weaker of the two coordinate fields stands for the position.
  const field = place.point.latField.tier <= place.point.lonField.tier ? place.point.latField : place.point.lonField;
  return {
    role, id: place.id, name: place.name,
    position: { source_id: field.source_id, source_name: sourceNames.get(field.source_id) ?? field.source_id, licence: field.licence, retrieved_at: field.retrieved_at, tier: field.tier },
  };
}

/** One item for the rolling route, or null when the planner returned none or it carries no tiered evidence. */
export function rollPlan(
  result: JourneyResult,
  origin: Extract<ResolvedPlace, { status: "resolved" }>,
  destination: Extract<ResolvedPlace, { status: "resolved" }>,
  locale: Locale,
): JourneyPlan | null {
  const roll = result.roll;
  if (!roll) return null;
  const evidence = weakest(roll.evidence);
  if (!evidence) return null;
  const copy = LANE_STRINGS[locale].journey;
  const distance = copy.metres.replace("{{distance}}", new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(roll.distanceMetres)));
  const status = roll.status === "step-free" ? copy.stepFree : roll.status === "unknown" ? copy.unknownAccess : messages[locale].barrier;
  const day = evidence.retrievedAt.slice(0, 10);
  const names = new Map(result.sources.map((entry) => [entry.sourceId, entry.name]));
  return {
    id: `roll:${origin.id}:${destination.id}`,
    summary: `${messages[locale].roll}${locale === "fr" ? " :" : ":"} ${distance}. ${status}`,
    provenance: {
      source_name: evidence.sourceName,
      source_url: null,
      licence: evidence.licence,
      licence_url: null,
      source_date: day,
      retrieved_at: evidence.retrievedAt,
      tier: evidence.tier as 0 | 1 | 2 | 3 | 4,
      prototype_label: evidence.prototype_label,
      freshness: "unknown",
    },
    liveStatus: "unavailable",
    notices: result.notices,
    endpoints: [endpoint("origin", origin, names), endpoint("destination", destination, names)],
  };
}

async function place(source: ResolveSource, id: string | null | undefined, label: string | null): Promise<ResolvedPlace | null> {
  if (id) return resolveRecord(source, id, label ?? id);
  if (label && label.trim()) return resolvePoint(source, label.trim());
  return null;
}

/** True when the planner bound to this alias is the build's unlinked stand-in. */
function unlinked(planner: object): boolean {
  return "unlinked" in planner && (planner as { unlinked?: unknown }).unlinked === true;
}

/**
 * The shell's journey route over the access-maps journey-data planner. It
 * resolves each place to the record's own sourced position, asks the planner
 * for a rolling route over the downloaded path records, and maps what the
 * planner returned. It never states that a route works: the summary says what
 * the data records, the item carries the weakest evidence's tier and label,
 * and the planner's notes about Unknown fields are kept.
 */
export function createJourneyModule(source: PackSource): JourneyModule {
  const planner = createPlanner(source);
  const resolver = source as unknown as ResolveSource;
  return {
    id: "journey",
    plan: async (request: JourneyRequest, ctx: ModuleContext) => {
      if (unlinked(planner)) return emptyModuleResult("journey", "modules.unavailable");
      let manifest: unknown;
      try {
        manifest = await source.manifest();
      } catch {
        return emptyModuleResult("journey", "modules.unavailable");
      }
      try {
        const asked = [request.originId || request.originLabel?.trim(), request.destinationId || request.destinationLabel?.trim()];
        if (!asked[0] && !asked[1]) return ready([], "awaiting");
        if (!asked[0] || !asked[1]) return ready([], "needBoth");
        const origin = await place(resolver, request.originId, request.originLabel);
        const destination = await place(resolver, request.destinationId, request.destinationLabel);
        const ends = [origin, destination];
        if (ends.some((end) => !end || end.status === "not-found")) return ready([], "notFound");
        if (ends.some((end) => end?.status === "ambiguous")) return ready([], "ambiguous");
        if (origin?.status !== "resolved" || destination?.status !== "resolved") return ready([], "noCoordinates");
        // The planner is offered only where a pack region holds both places and path records cover them.
        const area = manifestArea(manifest);
        if (!area.regions.some((bbox) => inside(origin.point, bbox) && inside(destination.point, bbox))) return ready([], "noArea");
        const minLon = Math.min(origin.point.lon, destination.point.lon);
        const minLat = Math.min(origin.point.lat, destination.point.lat);
        const maxLon = Math.max(origin.point.lon, destination.point.lon);
        const maxLat = Math.max(origin.point.lat, destination.point.lat);
        // The same margin the planner uses when it reads cells (about 800 m).
        const pad = 0.009;
        const cells = await source.cellsFor({ bbox: [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad] });
        if (!cells.some((cell) => area.pathCells.has(cell))) return ready([], "noArea");
        const locale: Locale = ctx.locale;
        const result = await planner.plan({
          origin: { lat: origin.point.lat, lon: origin.point.lon },
          destination: { lat: destination.point.lat, lon: destination.point.lon },
          profile: rollProfile(ctx),
          locale,
          now: ctx.nowIso,
          offline: request.offline,
        });
        if (result.missingRegions.length > 0) return ready([], "noArea");
        const item = rollPlan(result, origin, destination, locale);
        if (!item) return ready([], result.notices.includes(messages[locale].far) ? "tooFar" : "noRoute");
        const asOf = latest(result.roll?.evidence.map((entry) => entry.retrievedAt) ?? []);
        return ready([item], "planned", asOf ? `${asOf.slice(0, 10)}T00:00:00Z` : null);
      } catch {
        return { moduleId: "journey", availability: "error", items: [], messageKey: "modules.error", asOf: null, liveStatus: "unavailable" };
      }
    },
  };
}
