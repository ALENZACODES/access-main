/**
 * Everyday words that point to French or to English in the name of a place ("rue", "bibliothèque", "library",
 * "school"). Words are folded: lower case, no accents, no dots. A word that is common in both languages
 * ("centre", "place", "hotel", "restaurant", "theatre") is left out of both lists on purpose, since it says
 * nothing. Names of people, brands and towns are not listed: they belong to no language.
 */

export const FRENCH_NAME_WORDS: ReadonlySet<string> = new Set([
  "le", "la", "les", "un", "une", "des", "du", "au", "aux", "et", "dans", "sur", "chez", "pour", "sans", "sous",
  "rue", "chemin", "ruelle", "impasse", "rang", "montee", "allee",
  "ecole", "bibliotheque", "eglise", "musee", "parc", "hopital", "pharmacie", "marche", "universite", "cegep",
  "mairie", "salle", "maison", "foyer", "clinique", "caisse", "poste", "gare", "boulangerie", "epicerie",
  "quincaillerie", "librairie", "fromagerie", "patisserie", "depanneur", "garderie", "chapelle", "cathedrale",
  "stade", "jardin", "lac", "mont", "riviere", "pont", "plage", "ile", "sainte", "notre",
  "nord", "sud", "est", "ouest", "nouveau", "nouvelle", "vieux", "vieille", "grande",
  "petit", "petite", "bon", "bonne", "ville", "monastere", "societe",
  "sante", "soins", "aines", "aine", "jeunesse", "loisirs", "communautaire",
  "municipale", "bienvenue", "accueil", "famille", "familles", "enfants", "secondaire",
  "primaire", "polyvalente", "pompiers", "incendie",
]);

export const ENGLISH_NAME_WORDS: ReadonlySet<string> = new Set([
  "the", "of", "and", "at", "for", "with", "in", "on", "by", "to", "from",
  "street", "road", "lane", "drive", "crescent", "trail", "way", "line", "concession", "sideroad",
  "library", "school", "church", "park", "hospital", "pharmacy", "market", "museum", "university", "clinic",
  "bakery", "grocery", "hardware", "bookstore", "bookshop", "mall", "lake", "mount", "mountain", "river", "bridge",
  "beach", "island", "north", "south", "east", "west", "city", "town", "township", "community", "public", "senior",
  "seniors", "elementary", "high", "first", "new", "old", "great", "little", "big", "grill",
  "shop", "store", "supply", "legion", "fire", "hall", "stadium", "cathedral", "chapel", "monastery", "cafeteria",
  "welcome", "family", "families", "children", "kids", "youth", "recreation", "health", "care", "county", "district",
  "office", "post", "garden", "gardens", "field", "fields", "square",
]);

/** Letters that are French and not English: é è ê ë à â ç î ï ô û ù ü ÿ œ æ. */
export const FRENCH_ACCENT_LETTERS = "éèêëàâçîïôûùüÿœæ";

/** Words in both lists, which would make a name read as both languages for no reason. Empty by construction. */
export const SHARED_NAME_WORDS: readonly string[] = [...FRENCH_NAME_WORDS].filter((w) => ENGLISH_NAME_WORDS.has(w));
