/**
 * The words the "Words in the notes" reader looks for, grouped under a plain label.
 *
 * A cue is a word (or a short run of words) as it is written once folded: lower case, no accents,
 * letters and digits only, single spaces. Finding a cue only shows that a note USES that word. It says
 * nothing about whether the feature is there, in use or in good order, and the page says so.
 * Every cue belongs to exactly one topic, so a word is never counted twice.
 */
import type { Locale } from "./stateCopy";

export const TOPIC_IDS = ["steps", "ramp", "lift", "door", "washroom", "parking", "floor", "width", "surface", "seating", "help"] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

export interface TopicDef {
  readonly id: TopicId;
  readonly en: string;
  readonly fr: string;
  /** Folded cues, English and French together. */
  readonly cues: readonly string[];
}

export const TOPICS: readonly TopicDef[] = [
  { id: "steps", en: "Steps and stairs", fr: "Marches et escaliers", cues: ["step", "steps", "stair", "stairs", "staircase", "curb", "curbs", "kerb", "kerbs", "threshold", "marche", "marches", "escalier", "escaliers", "bordure", "seuil"] },
  { id: "ramp", en: "Ramps and slopes", fr: "Rampes et pentes", cues: ["ramp", "ramps", "slope", "sloped", "incline", "rampe", "rampes", "pente", "pentes"] },
  { id: "lift", en: "Lifts and elevators", fr: "Ascenseurs", cues: ["elevator", "elevators", "lift", "lifts", "ascenseur", "ascenseurs", "monte charge"] },
  { id: "door", en: "Doors and entrances", fr: "Portes et entrées", cues: ["door", "doors", "doorway", "doorways", "entrance", "entrances", "entry", "gate", "porte", "portes", "entree", "entrees", "portail"] },
  { id: "washroom", en: "Washrooms", fr: "Toilettes", cues: ["washroom", "washrooms", "restroom", "restrooms", "toilet", "toilets", "bathroom", "bathrooms", "wc", "toilette", "toilettes", "salle de bain", "salle de bains", "salle de toilette", "salles de toilette", "sanitaire", "sanitaires"] },
  { id: "parking", en: "Parking", fr: "Stationnement", cues: ["parking", "stationnement", "stationnements"] },
  { id: "floor", en: "Floors and levels", fr: "Étages", cues: ["floor", "floors", "upstairs", "downstairs", "basement", "storey", "storeys", "etage", "etages", "sous sol", "rez de chaussee"] },
  { id: "width", en: "Width and space", fr: "Largeur et espace", cues: ["narrow", "wide", "width", "widths", "tight", "etroit", "etroite", "etroits", "etroites", "largeur"] },
  { id: "surface", en: "Ground and surface", fr: "Sol et surface", cues: ["gravel", "cobblestone", "cobblestones", "cobbles", "uneven", "bumpy", "cracked", "snow", "ice", "icy", "mud", "muddy", "gravier", "pave", "paves", "inegal", "inegale", "inegaux", "neige", "glace", "boue"] },
  { id: "seating", en: "Seating and tables", fr: "Places assises et tables", cues: ["seat", "seats", "seating", "table", "tables", "stool", "stools", "booth", "booths", "counter", "siege", "sieges", "tabouret", "tabourets", "banquette", "comptoir"] },
  { id: "help", en: "Staff and help", fr: "Personnel et aide", cues: ["staff", "help", "assist", "assistance", "ring", "bell", "buzzer", "ask", "personnel", "aide", "aider", "sonner", "sonnette", "interphone", "demander"] },
];

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === "string" && (TOPIC_IDS as readonly string[]).includes(value);
}

export function topicLabel(id: TopicId, locale: Locale): string {
  const def = TOPICS.find((x) => x.id === id);
  if (def === undefined) return id;
  return locale === "fr" ? def.fr : def.en;
}

/** Each folded cue and the one topic it belongs to. */
export const CUE_TO_TOPIC: ReadonlyMap<string, TopicId> = new Map(TOPICS.flatMap((d) => d.cues.map((c): [string, TopicId] => [c, d.id])));

/** The most words any one cue has. */
export const TOPIC_MAX_CUE_WORDS = Math.max(...TOPICS.flatMap((d) => d.cues.map((c) => c.split(" ").length)));

/** Words that, just before a cue, make the note speak of its absence. They are only looked at, never acted on. */
export const TOPIC_NEGATORS: ReadonlySet<string> = new Set(["no", "not", "without", "none", "never", "non", "sans", "pas", "aucun", "aucune", "jamais"]);

/** How many words back from a cue a negator is looked for, inside the same sentence. */
export const TOPIC_NEGATION_REACH = 2;
