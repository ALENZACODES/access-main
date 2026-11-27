/**
 * Words and states for a place on the map: one place for the rules the list,
 * the details panel and the dot colours all follow, so they never disagree.
 */

export type MapStatus = "yes" | "partly" | "no" | "unknown";
export type MapCategory = "washroom" | "venue" | "transit";
type Locale = "en" | "fr";

const lower = (value: unknown): string => (value === undefined || value === null ? "" : String(value).trim().toLowerCase());

/** OpenStreetMap-style values: yes, designated, limited, no. Anything else stays unknown. */
export function wheelchairStatus(value: unknown): MapStatus {
  const text = lower(value);
  if (["yes", "designated", "true", "1"].includes(text)) return "yes";
  if (["limited", "partial", "partly"].includes(text)) return "partly";
  if (["no", "false", "0"].includes(text)) return "no";
  return "unknown";
}

/** GTFS wheelchair_boarding: 1 = possible on some or all vehicles, 2 = not possible, 0 or empty = no information. */
export function boardingStatus(value: unknown): MapStatus {
  const text = lower(value);
  if (text === "1" || text === "yes") return "yes";
  if (text === "2" || text === "no") return "no";
  return "unknown";
}

/** A city's free-text washroom note, such as "Accessible=Yes" or "Accessible Stall, Entrance at Grade". */
export function publishedWashroomStatus(value: unknown): MapStatus {
  const text = lower(value);
  if (!text || text === "none" || text === "unknown") return "unknown";
  if (text.includes("accessible=no")) return "no";
  if (text.includes("accessible=yes") || text.includes("accessible stall")) return "yes";
  return "unknown";
}

/** The one fact that matters most for each kind of place: can a wheelchair user get in, use it, or board. */
export function headlineStatus(category: MapCategory, value: (field: string) => unknown): MapStatus {
  if (category === "transit") {
    const boarding = boardingStatus(value("wheelchair_boarding"));
    return boarding !== "unknown" ? boarding : wheelchairStatus(value("wheelchair"));
  }
  const wheelchair = wheelchairStatus(value("wheelchair"));
  if (wheelchair !== "unknown" || category !== "washroom") return wheelchair;
  return publishedWashroomStatus(value("published_accessibility"));
}

/** The same rule as a MapLibre expression, so a dot's colour matches what the list says. */
export function headlineExpression(): unknown[] {
  const get = (field: string) => ["downcase", ["to-string", ["coalesce", ["get", field], ""]]];
  const wheelchair = ["match", get("wheelchair"),
    ["yes", "designated", "true", "1"], "yes",
    ["limited", "partial", "partly"], "partly",
    ["no", "false", "0"], "no",
    "unknown"];
  const published = ["case",
    ["in", "accessible=no", get("published_accessibility")], "no",
    ["any", ["in", "accessible=yes", get("published_accessibility")], ["in", "accessible stall", get("published_accessibility")]], "yes",
    "unknown"];
  return ["case",
    ["==", ["get", "tranche"], "transit"],
    ["match", get("wheelchair_boarding"), ["1", "yes"], "yes", ["2", "no"], "no", wheelchair],
    ["all", ["==", ["get", "tranche"], "washroom"], ["==", wheelchair, "unknown"]], published,
    wheelchair];
}

/** "BARTLETT PARKETTE" reads as "Bartlett Parkette". Mixed-case names are left as written. */
export function displayName(name: string): string {
  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4 || letters !== letters.toUpperCase()) return name;
  const small = new Set(["and", "at", "de", "des", "du", "et", "la", "le", "les", "of", "on", "the"]);
  return name.toLowerCase().replace(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’]*/g, (word, offset: number) =>
    offset > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1));
}

const WORDS: Record<Locale, Record<string, string>> = {
  en: {
    "kind.washroom": "Washroom",
    "kind.venue": "Place",
    "kind.transit": "Transit stop",
    "headline.washroom": "Accessible washroom",
    "headline.venue": "Wheelchair access",
    "headline.transit": "Wheelchair boarding",
    "state.yes": "Yes",
    "state.partly": "Partly",
    "state.no": "No",
    "state.unknown": "Not recorded",
    "field.wheelchair": "Wheelchair access",
    "field.wheelchair_boarding": "Wheelchair boarding",
    "field.step_free_entrance": "Step-free entrance",
    "field.entrance": "Entrance",
    "field.entrance_wheelchair": "Entrance for wheelchairs",
    "field.door": "Door",
    "field.automatic_door": "Automatic door",
    "field.surface": "Ground surface",
    "field.tactile_paving": "Tactile paving",
    "field.capacity_disabled": "Accessible parking spaces",
    "field.speech_output": "Audible signal",
    "field.published_accessibility": "What the city publishes",
    "field.accessible_washroom": "Accessible washroom",
    "field.toilets_wheelchair": "Wheelchair-accessible toilet",
    "field.changing_table": "Changing table",
    "field.AODA_TYPE": "AODA type",
    "field.NOTES": "Notes",
    "field.SOURCE": "Source",
    "value.yes": "Yes",
    "value.no": "No",
    "value.limited": "Partly",
    "value.designated": "Yes, designated",
    "value.automatic": "Automatic",
    "value.hinged": "Hinged",
    "value.revolving": "Revolving",
    "value.sliding": "Sliding",
    "value.main": "Main entrance",
    "value.staircase": "Stairs",
    "value.exit": "Exit only",
    "value.asphalt": "Asphalt",
    "value.concrete": "Concrete",
    "value.paving_stones": "Paving stones",
    "value.gravel": "Gravel",
    "value.grass": "Grass",
    "value.wood": "Wood",
    "value.metal": "Metal",
    "value.1": "Yes, on some or all vehicles",
    "value.2": "No",
    "value.0": "Not recorded",
  },
  fr: {
    "kind.washroom": "Toilettes",
    "kind.venue": "Lieu",
    "kind.transit": "Arrêt de transport en commun",
    "headline.washroom": "Toilettes accessibles",
    "headline.venue": "Accès en fauteuil roulant",
    "headline.transit": "Embarquement en fauteuil roulant",
    "state.yes": "Oui",
    "state.partly": "En partie",
    "state.no": "Non",
    "state.unknown": "Non consigné",
    "field.wheelchair": "Accès en fauteuil roulant",
    "field.wheelchair_boarding": "Embarquement en fauteuil roulant",
    "field.step_free_entrance": "Entrée sans marche",
    "field.entrance": "Entrée",
    "field.entrance_wheelchair": "Entrée pour fauteuil roulant",
    "field.door": "Porte",
    "field.automatic_door": "Porte automatique",
    "field.surface": "Revêtement du sol",
    "field.tactile_paving": "Bandes podotactiles",
    "field.capacity_disabled": "Places de stationnement accessibles",
    "field.speech_output": "Signal sonore",
    "field.published_accessibility": "Ce que la ville publie",
    "field.accessible_washroom": "Toilettes accessibles",
    "field.toilets_wheelchair": "Toilette accessible en fauteuil",
    "field.changing_table": "Table à langer",
    "field.AODA_TYPE": "Type LAPHO",
    "field.NOTES": "Remarques",
    "field.SOURCE": "Source",
    "value.yes": "Oui",
    "value.no": "Non",
    "value.limited": "En partie",
    "value.designated": "Oui, désigné",
    "value.automatic": "Automatique",
    "value.hinged": "À charnières",
    "value.revolving": "Tournante",
    "value.sliding": "Coulissante",
    "value.main": "Entrée principale",
    "value.staircase": "Escalier",
    "value.exit": "Sortie seulement",
    "value.asphalt": "Asphalte",
    "value.concrete": "Béton",
    "value.paving_stones": "Pavés",
    "value.gravel": "Gravier",
    "value.grass": "Gazon",
    "value.wood": "Bois",
    "value.metal": "Métal",
    "value.1": "Oui, dans certains ou tous les véhicules",
    "value.2": "Non",
    "value.0": "Non consigné",
  },
};

export function mapWord(locale: Locale, key: string): string {
  return WORDS[locale][key] ?? WORDS.en[key] ?? key;
}

/** A field name for a reader: a known label, or "capacity_disabled" as "Capacity disabled". */
export function fieldLabel(locale: Locale, field: string): string {
  const known = WORDS[locale][`field.${field}`];
  if (known) return known;
  const words = field.replace(/[_:]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A recorded value for a reader. Wheelchair boarding codes are spelled out; other free text is kept as written. */
export function valueLabel(locale: Locale, field: string, value: unknown): string {
  const text = String(value ?? "").trim();
  const key = text.toLowerCase().replace(/\s+/g, "_");
  if (field === "wheelchair_boarding" || !/^\d+$/.test(text)) {
    const known = WORDS[locale][`value.${key}`];
    if (known) return known;
  }
  if (text.includes(";") && /^[a-z]+(;[a-z]+)+$/i.test(text)) return text.split(";").map((part) => valueLabel(locale, field, part)).join(", ");
  return text;
}

/** "AODA_TYPE=B; NOTES=Diagonal Street" becomes two readable lines. Plain text stays one line. */
export function noteLines(locale: Locale, text: string): Array<{ label: string | null; text: string }> {
  const parts = text.split(/;\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => /^[A-Z][A-Z0-9_ ]*=/.test(part))) {
    return parts.map((part) => {
      const at = part.indexOf("=");
      return { label: fieldLabel(locale, part.slice(0, at).trim()), text: part.slice(at + 1).trim() };
    });
  }
  return [{ label: null, text }];
}

/** Fields shown in the details panel's own sections, so "other details" does not repeat them. */
export const SHOWN_ELSEWHERE = new Set([
  "id", "place_id", "name", "tranche", "category", "kind", "fields", "lat", "lon",
  "source_id", "licence", "retrieved_at", "tier", "wheelchair_description",
]);
