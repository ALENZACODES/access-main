/**
 * Builds apps/web/public/packs/toronto/{content.json,manifest.json}.
 *
 * Inputs (nothing is typed in by hand):
 *   --venues <dir>   access-maps pull request 1 OpenStreetMap venue tiles
 *                    (data/venues/osm-ontario/n43.5_w079.5*.ndjson.gz, commit 2c01751).
 *   --alerts <file>  TTC accessibility alert snapshot
 *                    (packages/schema/fixtures/import/alerts/gtfs-rt-ttc-accessibility.ndjson).
 * Help numbers are copied from access-help packages/help/src/signposts.ts (main, 13 November 2026 check).
 *
 * Usage: node apps/web/scripts/build-toronto-pack.ts --venues /path/to/tiles --alerts packages/schema/fixtures/import/alerts/gtfs-rt-ttc-accessibility.ndjson
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const CENTRE = { lat: 43.6561, lon: -79.3802 };
const RADIUS_METRES = 300;
const PLACE_LIMIT = 24;
const BUILT_AT = "2026-11-14";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface FieldValue {
  value: unknown;
  source_id: string;
  licence: string;
  retrieved_at: string;
  tier: number;
}

type Venue = { id: string; fields: Record<string, FieldValue | undefined> };

function str(venue: Venue, key: string): string {
  const value = venue.fields[key]?.value;
  if (typeof value === "number") return String(value);
  if (typeof value !== "string" || value.trim() === "") return "UNKNOWN";
  return value.trim();
}

const venueDir = arg("--venues");
const venues: Array<{ distance: number; venue: Venue }> = [];
for (const file of readdirSync(venueDir).filter((name) => name.endsWith(".ndjson.gz")).sort()) {
  const lines = gunzipSync(readFileSync(path.join(venueDir, file))).toString("utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    const venue = JSON.parse(line) as Venue;
    const lat = venue.fields.lat?.value;
    const lon = venue.fields.lon?.value;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    if (str(venue, "name") === "UNKNOWN") continue;
    if (venue.fields.name?.source_id !== "osm-ontario") continue;
    const distance = metres(CENTRE, { lat, lon });
    if (distance <= RADIUS_METRES) venues.push({ distance, venue });
  }
}
venues.sort((a, b) => a.distance - b.distance || a.venue.id.localeCompare(b.venue.id));

const places = venues.slice(0, PLACE_LIMIT).map(({ venue }) => {
  const stamp = venue.fields.name!;
  const street = str(venue, "addr_street");
  const number = str(venue, "addr_housenumber");
  return {
    id: venue.id,
    name: str(venue, "name"),
    category: str(venue, "category"),
    wheelchair: str(venue, "wheelchair"),
    wheelchair_description: str(venue, "wheelchair_description"),
    address: street === "UNKNOWN" ? "UNKNOWN" : number === "UNKNOWN" ? street : `${number} ${street}`,
    lat: venue.fields.lat!.value as number,
    lon: venue.fields.lon!.value as number,
    provenance: {
      source_name: "OpenStreetMap, Geofabrik Ontario extract",
      source_url: `https://www.openstreetmap.org/${venue.id.replace(/^osm:/, "")}`,
      licence: stamp.licence,
      licence_url: "https://opendatacommons.org/licenses/odbl/1-0/",
      source_date: stamp.retrieved_at,
      retrieved_at: stamp.retrieved_at,
      tier: 0,
      prototype_label: "SEEDED-OPEN-DATA",
      freshness: "unknown",
    },
  };
});

const SIGNPOSTS = [
  {
    id: "emergency-911",
    name: { en: "Emergency services", fr: "Services d'urgence" },
    contact: "911",
    how: {
      en: "Call 911 if you or someone else is in immediate danger, is badly hurt, or needs an ambulance.",
      fr: "Composez le 911 si vous ou une autre personne êtes en danger immédiat, gravement blessé, ou avez besoin d'une ambulance.",
    },
    url: null,
  },
  {
    id: "suicide-crisis-988",
    name: { en: "9-8-8 Suicide Crisis Helpline", fr: "Ligne d'aide en cas de crise de suicide 9-8-8" },
    contact: "9-8-8",
    how: {
      en: "Call or text 9-8-8, any time, in English or French.",
      fr: "Appelez ou textez le 9-8-8, en tout temps, en français ou en anglais.",
    },
    url: "https://988.ca/",
  },
  {
    id: "health811",
    name: { en: "Health811", fr: "Health811" },
    contact: "811",
    how: {
      en: "Call 811 for non-urgent health information from a registered nurse, 24 hours a day. TTY: 711. The App does not give health advice.",
      fr: "Composez le 811 pour de l'information de santé non urgente d'une infirmière ou d'un infirmier, 24 heures sur 24. ATS : 711. L'application ne donne pas de conseil de santé.",
    },
    url: "https://health811.ontario.ca/static/guest/help-centre/calling-health811-help-centre",
  },
  {
    id: "connexontario",
    name: { en: "ConnexOntario", fr: "ConnexOntario" },
    contact: "1-866-531-2600",
    how: {
      en: "Information about mental health, addiction, and problem gambling services in Ontario, 24 hours a day.",
      fr: "Information sur les services de santé mentale, de dépendance et de jeu en Ontario, 24 heures sur 24.",
    },
    url: "https://connexontario.ca/contact-us/",
  },
  {
    id: "poison-centre",
    name: { en: "Ontario Poison Centre", fr: "Centre antipoison de l'Ontario" },
    contact: "1-800-268-9017",
    how: {
      en: "For suspected poisoning, as listed on the Health811 calling page.",
      fr: "En cas d'empoisonnement soupçonné, selon la page d'appel de Health811.",
    },
    url: "https://health811.ontario.ca/static/guest/help-centre/calling-health811-help-centre",
  },
  {
    id: "two-one-one",
    name: { en: "211 Ontario", fr: "211 Ontario" },
    contact: "211",
    how: {
      en: "A directory of community and social services. The App does not decide whether you qualify.",
      fr: "Un répertoire de services communautaires et sociaux. L'application ne décide pas si vous êtes admissible.",
    },
    url: "https://211ontario.ca/",
  },
];

const help_numbers = SIGNPOSTS.map((item) => ({
  ...item,
  provenance: {
    source_name: item.url ? "Official page, desk check" : "Ontario emergency number, desk check",
    source_url: item.url,
    licence: "UNKNOWN",
    licence_url: null,
    source_date: "2026-11-13",
    retrieved_at: "2026-11-13",
    tier: "E",
    prototype_label: null,
    freshness: "unknown",
  },
}));

interface Alert {
  id: string;
  source_id: string;
  licence: string;
  retrieved_at: string;
  feed_timestamp: number;
  equipment: string;
  header_text: string;
  header_language: string;
  stop_ids: string[];
}

const alerts = readFileSync(arg("--alerts"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Alert);
const elevator_status = alerts
  .filter((alert) => alert.equipment === "elevator" || alert.equipment === "elevator_and_escalator")
  .map((alert) => {
    const colon = alert.header_text.indexOf(":");
    return {
      id: alert.id,
      station: colon > 0 ? alert.header_text.slice(0, colon).trim() : "UNKNOWN",
      operator_text: alert.header_text,
      operator_text_language: alert.header_language,
      stop_ids: alert.stop_ids,
      checked_at: new Date(alert.feed_timestamp * 1000).toISOString(),
      label: "last-checked",
      source_name: "TTC GTFS-Realtime accessibility alerts",
      source_url: null,
      licence: alert.licence,
      retrieved_at: alert.retrieved_at,
      tier: 4,
    };
  });

const content = {
  schema_version: "offline-pack-1.0.0",
  pack_id: "toronto",
  places,
  help_numbers,
  elevator_status,
  journeys: [],
};

const body = `${JSON.stringify(content, null, 2)}\n`;
const bytes = Buffer.byteLength(body, "utf8");
const manifest = {
  schema_version: "offline-pack-1.0.0",
  pack_id: "toronto",
  title: { en: "Toronto pack", fr: "Données de Toronto" },
  built_at: BUILT_AT,
  content_path: "/packs/toronto/content.json",
  size_bytes: bytes,
  sha256: createHash("sha256").update(body, "utf8").digest("hex"),
  source_dates: [
    { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: places[0]?.provenance.retrieved_at ?? "UNKNOWN" },
    { source_name: "TTC GTFS-Realtime accessibility alerts", licence: "OGL-Toronto-1.0", retrieved_at: alerts[0]?.retrieved_at ?? "UNKNOWN" },
    { source_name: "Official help pages, desk check", licence: "UNKNOWN", retrieved_at: "2026-11-13" },
  ],
  counts: {
    places: places.length,
    help_numbers: help_numbers.length,
    elevator_status: elevator_status.length,
    journeys: 0,
  },
};

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/packs/toronto");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "content.json"), body);
writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`places ${places.length}, help ${help_numbers.length}, elevator ${elevator_status.length}, bytes ${bytes}`);
