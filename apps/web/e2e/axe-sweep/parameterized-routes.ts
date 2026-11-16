import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Real ids from the bundled Toronto pack. `appRoutes()` skips `places/:id` and
 * `help/:id` because they are parameter paths; this list fills those routes
 * with ids that actually ship in the repo.
 */
const PACK_PATH = resolve(import.meta.dirname, "../../public/packs/toronto/content.json");

interface PackRecord {
  id?: unknown;
}

interface TorontoPack {
  places?: PackRecord[];
  help_numbers?: PackRecord[];
}

function firstId(records: PackRecord[] | undefined, kind: string): string {
  const id = records?.find((record) => typeof record.id === "string" && record.id.trim().length > 0)?.id;
  if (typeof id !== "string") {
    throw new Error(`bundled Toronto pack has no ${kind} id at ${PACK_PATH}`);
  }
  return id;
}

export function bundledTorontoPackPath(): string {
  return PACK_PATH;
}

export function parameterizedRoutes(): string[] {
  if (!existsSync(PACK_PATH)) {
    throw new Error(`bundled Toronto pack is missing at ${PACK_PATH}`);
  }
  const pack = JSON.parse(readFileSync(PACK_PATH, "utf8")) as TorontoPack;
  const placeId = firstId(pack.places, "place");
  const helpId = firstId(pack.help_numbers, "help");
  return [`/places/${encodeURIComponent(placeId)}`, `/help/${encodeURIComponent(helpId)}`];
}
