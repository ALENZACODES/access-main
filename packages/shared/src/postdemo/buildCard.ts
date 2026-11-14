/**
 * Day 25 build card: one page the presenter keeps beside the device. It states
 * the build identifier, counted seed records by file and tier, the sources,
 * the verification position, the demo journeys, and fallback readiness.
 *
 * Every number on the card is a count someone took from a file. The card
 * refuses an estimate, a tier above the prototype tiers, and a source with no
 * licence or date. It does not look anything up.
 */

export type CardLanguage = "en" | "fr";

/** Tiers a prototype record may carry (canonical 0, 1, E and the two prototype labels). */
export const CARD_TIERS = ["0", "1", "E", "SEEDED-OPEN-DATA", "PROTOTYPE-UNVERIFIED"] as const;

export interface CardSeedCount {
  file: string;
  tier: string;
  records: number;
  /** "counted" means the number was counted from the file. Anything else is refused. */
  basis: "counted" | "estimate";
}

export interface CardSource {
  name: string;
  /** Licence id or name. The word UNKNOWN is allowed; a blank is not. */
  licence: string;
  retrievedOn: string;
}

export interface CardJourney {
  name: string;
  /** "in-build" only when the journey runs on this build. */
  status: "in-build" | "not-in-build";
  note?: string;
}

export interface BuildCardInput {
  buildId: string;
  /** Date the card was checked against the build, YYYY-MM-DD. */
  checkedOn: string;
  seedCounts: CardSeedCount[];
  sources: CardSource[];
  demoJourneys: CardJourney[];
  fallback: { ready: boolean; where: string };
}

export interface CardProblem {
  ref: string;
  rule: string;
  detail: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDER_BUILDS = /^(?:dev|e2e|unknown|unidentified|)$/i;

function blank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

export function validateBuildCard(input: BuildCardInput): CardProblem[] {
  const problems: CardProblem[] = [];
  const add = (ref: string, rule: string, detail: string) => problems.push({ ref, rule, detail });
  if (blank(input.buildId) || PLACEHOLDER_BUILDS.test(input.buildId.trim())) {
    add("buildId", "build-id", "Use the identifier the final build shows, not a placeholder.");
  }
  if (!DATE.test(input.checkedOn ?? "")) add("checkedOn", "checked-on", "Give the date the card was checked, as YYYY-MM-DD.");
  if (!Array.isArray(input.seedCounts) || input.seedCounts.length === 0) add("seedCounts", "no-counts", "List the counted seed files.");
  for (const [index, count] of (input.seedCounts ?? []).entries()) {
    const ref = `seedCounts[${index}]`;
    if (blank(count.file)) add(ref, "file", "Name the seed file.");
    if (count.basis !== "counted") add(ref, "not-counted", `${count.file || "This row"} is an estimate. The card shows counted actuals only.`);
    if (!Number.isInteger(count.records) || count.records < 0) add(ref, "records", "Records must be a whole number counted from the file.");
    if (!(CARD_TIERS as readonly string[]).includes(String(count.tier))) {
      add(ref, "tier", `Tier ${String(count.tier)} is not a prototype tier. No prototype record is VERIFIED or COMMUNITY-REPORTED.`);
    }
  }
  if (!Array.isArray(input.sources) || input.sources.length === 0) add("sources", "no-sources", "List the data sources.");
  for (const [index, source] of (input.sources ?? []).entries()) {
    const ref = `sources[${index}]`;
    if (blank(source.name)) add(ref, "source-name", "Name the source.");
    if (blank(source.licence)) add(ref, "licence", "Write the licence, or UNKNOWN when it is not known.");
    if (!DATE.test(source.retrievedOn ?? "")) add(ref, "retrieved-on", "Give the retrieval date as YYYY-MM-DD.");
  }
  for (const [index, journey] of (input.demoJourneys ?? []).entries()) {
    if (blank(journey.name)) add(`demoJourneys[${index}]`, "journey-name", "Name the demo journey.");
    if (journey.status === "not-in-build" && blank(journey.note)) {
      add(`demoJourneys[${index}]`, "journey-note", "Say why the journey is not in this build.");
    }
  }
  if (!input.fallback?.ready) add("fallback", "fallback-not-ready", "The fallback materials are not ready.");
  if (blank(input.fallback?.where)) add("fallback", "fallback-where", "Say where the fallback materials are.");
  return problems;
}

const COPY = {
  en: {
    title: "Build card",
    build: "Build identifier",
    checked: "Checked against the build on",
    counts: "Seed records, counted from the files",
    file: "File",
    tier: "Tier",
    records: "Records",
    total: "Total",
    sources: "Sources",
    licence: "licence",
    retrieved: "retrieved",
    verification:
      "Verification position: no record in this build is verified. Open-data records are SEEDED-OPEN-DATA. Hand-entered demonstration records are PROTOTYPE-UNVERIFIED. Unknown stays Unknown.",
    journeys: "Demo journeys",
    inBuild: "in this build",
    notInBuild: "not in this build",
    noJourneys: "No demo journey is listed for this build.",
    fallback: "Fallback",
    ready: "ready",
    notReady: "NOT READY",
    honesty:
      "Say at the start: this is a prototype for evaluation, no data shown is verified, outage data is demonstration data, no organisation has endorsed the App, the App gives no medical advice, and only the shell is in French.",
  },
  fr: {
    title: "Fiche de version",
    build: "Identifiant de version",
    checked: "Vérifiée par rapport à la version le",
    counts: "Fiches de départ, comptées dans les fichiers",
    file: "Fichier",
    tier: "Niveau",
    records: "Fiches",
    total: "Total",
    sources: "Sources",
    licence: "licence",
    retrieved: "consultée le",
    verification:
      "Position sur la vérification : aucune fiche de cette version n'est vérifiée. Les fiches de données ouvertes sont SEEDED-OPEN-DATA. Les fiches de démonstration saisies à la main sont PROTOTYPE-UNVERIFIED. Inconnu reste Inconnu.",
    journeys: "Trajets de démonstration",
    inBuild: "dans cette version",
    notInBuild: "pas dans cette version",
    noJourneys: "Aucun trajet de démonstration n'est inscrit pour cette version.",
    fallback: "Solution de repli",
    ready: "prête",
    notReady: "PAS PRÊTE",
    honesty:
      "À dire au début : c'est un prototype à évaluer, aucune donnée montrée n'est vérifiée, les données de pannes sont des données de démonstration, aucune organisation n'a approuvé l'application, l'application ne donne aucun conseil médical et seule l'interface de base est en français.",
  },
} as const;

/** Plain Markdown, one page. Problems are listed at the top so a card with gaps cannot pass as complete. */
export function renderBuildCard(input: BuildCardInput, language: CardLanguage = "en"): string {
  const c = COPY[language];
  const colon = language === "fr" ? " :" : ":";
  const problems = validateBuildCard(input);
  const out: string[] = [`# ${c.title}`, ""];
  if (problems.length > 0) {
    out.push(language === "fr" ? "**Cette fiche est incomplète :**" : "**This card is incomplete:**", "");
    for (const problem of problems) out.push(`- ${problem.ref}${colon} ${problem.detail}`);
    out.push("");
  }
  out.push(`${c.build}${colon} **${input.buildId}**`, "", `${c.checked} ${input.checkedOn}`, "");
  out.push(`## ${c.counts}`, "", `| ${c.file} | ${c.tier} | ${c.records} |`, "| --- | --- | ---: |");
  let total = 0;
  for (const count of input.seedCounts) {
    total += Number.isInteger(count.records) ? count.records : 0;
    out.push(`| ${count.file} | ${count.tier} | ${count.records} |`);
  }
  out.push(`| **${c.total}** | | **${total}** |`, "");
  out.push(`## ${c.sources}`, "");
  for (const source of input.sources) out.push(`- ${source.name}${colon} ${c.licence} ${source.licence}, ${c.retrieved} ${source.retrievedOn}`);
  out.push("", c.verification, "", `## ${c.journeys}`, "");
  if (input.demoJourneys.length === 0) out.push(c.noJourneys);
  for (const journey of input.demoJourneys) {
    out.push(`- ${journey.name}${colon} ${journey.status === "in-build" ? c.inBuild : c.notInBuild}${journey.note ? `. ${journey.note}` : ""}`);
  }
  out.push("", `## ${c.fallback}`, "", `${input.fallback.ready ? c.ready : c.notReady}${colon} ${input.fallback.where}`, "", c.honesty, "");
  return out.join("\n");
}
