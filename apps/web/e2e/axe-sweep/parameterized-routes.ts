import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Real ids from the bundled Toronto pack. `appRoutes()` skips `places/:id` and
 * `help/:id` because they are parameter paths; this list fills those routes
 * with ids that actually ship in the repo, plus the title or name text the
 * page must show so a not-found screen cannot pass.
 */
const PACK_PATH = resolve(import.meta.dirname, "../../public/packs/toronto/content.json");

interface PackRecord {
  id?: unknown;
  name?: unknown;
}

interface TorontoPack {
  places?: PackRecord[];
  help_numbers?: PackRecord[];
}

export interface ParameterizedRoute {
  route: string;
  title: { en: string; fr: string };
}

function firstRecord(records: PackRecord[] | undefined, kind: string): PackRecord {
  const record = records?.find((entry) => typeof entry.id === "string" && entry.id.trim().length > 0);
  if (!record || typeof record.id !== "string") {
    throw new Error(`bundled Toronto pack has no ${kind} id at ${PACK_PATH}`);
  }
  return record;
}

function titleOf(name: unknown, kind: string): { en: string; fr: string } {
  if (typeof name === "string" && name.trim()) return { en: name, fr: name };
  if (name && typeof name === "object") {
    const record = name as { en?: unknown; fr?: unknown };
    const en = typeof record.en === "string" ? record.en.trim() : "";
    const fr = typeof record.fr === "string" ? record.fr.trim() : "";
    if (en && fr) return { en, fr };
  }
  throw new Error(`bundled Toronto pack ${kind} is missing a name`);
}

export function parameterizedRouteCases(): ParameterizedRoute[] {
  if (!existsSync(PACK_PATH)) {
    throw new Error(`bundled Toronto pack is missing at ${PACK_PATH}`);
  }
  const pack = JSON.parse(readFileSync(PACK_PATH, "utf8")) as TorontoPack;
  const place = firstRecord(pack.places, "place");
  const help = firstRecord(pack.help_numbers, "help");
  return [
    { route: `/places/${encodeURIComponent(place.id as string)}`, title: titleOf(place.name, "place") },
    { route: `/help/${encodeURIComponent(help.id as string)}`, title: titleOf(help.name, "help") },
  ];
}
