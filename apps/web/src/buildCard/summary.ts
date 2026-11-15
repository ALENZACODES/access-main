import { MODULE_IDS, type CacheEntry, type CacheKind, type ModuleId, type ModuleRegistry } from "@access/shared";

/**
 * Day 25 build card. Everything on it is read from this build or this device.
 * Nothing is typed in by hand, so the card cannot claim a count the device does not hold.
 */

export interface SourceLine {
  source_name: string;
  licence: string;
  source_date: string;
  records: number;
}

export interface CardSummary {
  total: number;
  byKind: Array<{ kind: CacheKind; count: number }>;
  byTier: Array<{ tier: string; count: number }>;
  sources: SourceLine[];
  /** Entries that carry a verified label or tier 3. The cache refuses them, so this should be 0. */
  verifiedClaims: number;
  /** Entries with no source date. Shown, not hidden. */
  undated: number;
}

export function summarizeEntries(entries: readonly CacheEntry[]): CardSummary {
  const kinds = new Map<CacheKind, number>();
  const tiers = new Map<string, number>();
  const sources = new Map<string, SourceLine>();
  let verifiedClaims = 0;
  let undated = 0;
  for (const entry of entries) {
    kinds.set(entry.kind, (kinds.get(entry.kind) ?? 0) + 1);
    const p = entry.provenance;
    const tier = p.prototype_label ? `${String(p.tier)} · ${p.prototype_label}` : String(p.tier);
    tiers.set(tier, (tiers.get(tier) ?? 0) + 1);
    if (p.prototype_label === "VERIFIED" || p.tier === 3) verifiedClaims += 1;
    const date = p.source_date?.trim() ? p.source_date.slice(0, 10) : "";
    if (!date) undated += 1;
    const key = `${p.source_name}\u0000${p.licence}\u0000${date}`;
    const line = sources.get(key) ?? { source_name: p.source_name, licence: p.licence, source_date: date, records: 0 };
    line.records += 1;
    sources.set(key, line);
  }
  return {
    total: entries.length,
    byKind: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => a.kind.localeCompare(b.kind)),
    byTier: [...tiers].map(([tier, count]) => ({ tier, count })).sort((a, b) => a.tier.localeCompare(b.tier)),
    sources: [...sources.values()].sort(
      (a, b) => a.source_name.localeCompare(b.source_name) || a.licence.localeCompare(b.licence) || a.source_date.localeCompare(b.source_date),
    ),
    verifiedClaims,
    undated,
  };
}

export type ModuleState = "connected" | "not connected" | "error";

/** Ask each route module once, with an empty request, whether it is connected in this build. */
export async function moduleStates(registry: ModuleRegistry, locale: "en" | "fr", nowIso: string): Promise<Record<ModuleId, ModuleState>> {
  const ctx = { locale, offline: false, profile: null, nowIso };
  const calls: Record<ModuleId, () => Promise<{ availability: string }>> = {
    places: () => registry.places.search({ text: "" }, ctx),
    journey: () => registry.journey.plan({ originLabel: null, destinationLabel: null, routingPreference: null, offline: false }, ctx),
    finders: () => registry.finders.search({ kind: "washroom", text: "" }, ctx),
    navigator: () => registry.navigator.list(ctx),
    games: () => registry.games.list(ctx),
    help: () => registry.help.list(ctx),
  };
  const entries = await Promise.all(
    MODULE_IDS.map(async (id): Promise<[ModuleId, ModuleState]> => {
      try {
        const result = await calls[id]();
        return [id, result.availability === "ready" ? "connected" : result.availability === "error" ? "error" : "not connected"];
      } catch {
        return [id, "error"];
      }
    }),
  );
  return Object.fromEntries(entries) as Record<ModuleId, ModuleState>;
}

export type Readiness = "ready" | "not ready" | "unknown";

/**
 * Offline fallback readiness from what the browser reports. A controlling
 * service worker means the shell can reopen without a network. It says
 * nothing about a downloaded place pack.
 */
export function offlineReadiness(worker: "active" | "inactive" | "unsupported" | "unknown"): Readiness {
  if (worker === "active") return "ready";
  if (worker === "unknown") return "unknown";
  return "not ready";
}
