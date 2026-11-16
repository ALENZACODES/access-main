/**
 * After hub:sync copies idea packages, rewrite user-facing verify/vérifier
 * wording (and runtime identifiers that would leak those tokens into the
 * release bundle). PROTOTYPE-UNVERIFIED is left untouched.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".css"]);

/** The same family of tokens as scripts/release/check.mjs, plus bare vérif* forms such as « Vérifiez ». */
export const HUB_VERIF_PATTERN =
  /unverified|verif(?:y|ied|iable|ication|ying|ies)?|vérif[a-zà-ÿ]*/giu;

const ALLOWLISTED = "PROTOTYPE-UNVERIFIED";

export const HUB_WORDING_REPLACEMENTS = Object.freeze([
  // Identifiers first (longer keys before shorter ones).
  ["verificationTier", "provenanceTier"],
  ["verifierType", "observerType"],

  // Employment
  ["These are not verified vacancies or programme referrals.", "These are not recorded vacancies or programme referrals."],
  ["Demonstration data — not a verified listing", "Demonstration data — not a recorded listing"],
  ["Ni offres d’emploi vérifiées ni recommandations transmises.", "Ni offres d’emploi enregistrées ni recommandations transmises."],
  ["Données de démonstration — fiche non vérifiée", "Données de démonstration — ceci n’est pas une fiche enregistrée"],
  ["Vérification du trajet", "Contrôle du trajet"],

  // Housing
  ["sans adresses réelles ni mesures vérifiées.", "sans adresses réelles ni mesures enregistrées."],

  // Safety (check-in uses « contrôle », not vérification)
  ["Vérification de déplacement", "Contrôle de déplacement"],
  ["Démarrer la fenêtre de vérification", "Démarrer la fenêtre de contrôle"],
  ["Fermer la vérification", "Fermer le contrôle"],
  ["Aucune vérification n'est en cours.", "Aucun contrôle n’est en cours."],
  ["Fenêtre de vérification ouverte", "Fenêtre de contrôle ouverte"],
  ["Votre fenêtre de vérification a pris fin", "Votre fenêtre de contrôle a pris fin"],
  ["Résumé de vérification de déplacement", "Résumé de contrôle de déplacement"],
  ["Vérification démarrée", "Contrôle démarré"],
  ["Vérifier un partage", "Contrôler un partage"],
  ["fr: \"Vérifier\"", "fr: \"Contrôler\""],
  ["Vérifiez auprès de l'exploitant avant de partir.", "Renseignez-vous auprès de l’exploitant avant de partir."],
  ["Verification tier: {tier}.", "Tier: {tier}."],
  ["Niveau de vérification${NB}: {tier}.", "Niveau${NB}: {tier}."],

  // Diary
  ["Vérifiez le stockage de votre appareil.", "Contrôlez le stockage de votre appareil."],

  // Auditors
  ["No real ownership, login, moderation, verification or service delivery.", "No real ownership, login, moderation or service delivery."],
  ["Canonical tiers: 0 unverified, 1 reported, 2 corroborated, 3 field-surveyed with evidence, 4 time-limited live observation, E official-page desk check. This slice stores only tier 0 and PROTOTYPE-UNVERIFIED. No VERIFIED status is granted.", "Canonical tiers: 0 not independently checked, 1 reported, 2 corroborated, 3 field-surveyed with evidence, 4 time-limited live observation, E official-page desk check. This slice stores only tier 0 and PROTOTYPE-UNVERIFIED. The refused confirmation label is not used."],
  ["modération, vérification ou prestation de service réelle.", "modération ou prestation de service réelle."],
  ["Aucune vérification indépendante.", "Aucun contrôle indépendant."],
  ["Niveaux canoniques : 0 non vérifié, 1 signalé, 2 corroboré, 3 relevé sur place avec preuves, 4 observation en direct temporaire, E examen d’une page officielle. Cette version ne conserve que le niveau 0 et PROTOTYPE-UNVERIFIED. Aucun statut VERIFIED n’est accordé.", "Niveaux canoniques : 0 non contrôlé, 1 signalé, 2 corroboré, 3 relevé sur place avec preuves, 4 observation en direct temporaire, E examen d’une page officielle. Cette version ne conserve que le niveau 0 et PROTOTYPE-UNVERIFIED. L’étiquette de confirmation refusée n’est pas utilisée."],
  ["Revérifier les mesures modifiées ou contestées", "Contrôler de nouveau les mesures modifiées ou contestées"],

  // Handoff
  ['checked: "Vérifié le"', 'checked: "Contrôlé le"'],
  ["À revérifier", "À contrôler de nouveau"],
  ["Date de vérification manquante", "Date de contrôle manquante"],
  ["une nouvelle vérification datée de sa source", "un nouveau contrôle daté de sa source"],
  ["Consigner une nouvelle vérification", "Consigner un nouveau contrôle"],
  ["Date de vérification manuelle", "Date de contrôle manuel"],
  ["La vérification d’une fiche ne renouvelle pas la date de la source d’un chiffre.", "Le contrôle d’une fiche ne renouvelle pas la date de la source d’un chiffre."],
  ["Nouvelle vérification consignée", "Nouveau contrôle consigné"],

  // Event access and peers
  ['proto_PROTOTYPE_UNVERIFIED: "Prototype, unverified"', 'protoSample: "Prototype sample"'],
  ['proto_PROTOTYPE_UNVERIFIED: "Prototype, non vérifié"', 'protoSample: "Prototype, non contrôlé"'],
  ['m[`proto_${fact.prototypeLabel.replace(/-/g, "_")}` as MessageKey]', 'm[(fact.prototypeLabel === "PROTOTYPE-UNVERIFIED" ? "protoSample" : `proto_${fact.prototypeLabel.replace(/-/g, "_")}`) as MessageKey]'],
  ["Aucun trajet n'a été vérifié.", "Aucun trajet n’a été contrôlé."],
  ["Prototype label. VERIFIED is not storable here.", "Prototype label. The refused confirmation label is not storable here."],
  ['invalidTitle: "Vérifiez le formulaire"', 'invalidTitle: "Contrôlez le formulaire"'],
  ["Vérifié le {date}.", "Contrôlé le {date}."],

  // Shared labels
  ['tier: "Verification tier"', 'tier: "Tier"'],
  ['"Verification tier"', '"Tier"'],
  ["Niveau de vérification", "Niveau"],

  // Comments that would otherwise leak if a bundler kept them
  ["Never VERIFIED, never tier 3.", "The refused confirmation label is not storable here, and neither is tier 3."],
  ["VERIFIED or tier 3, because it produces no evidence block for them.", "the refused confirmation label or tier 3, because it produces no evidence block for them."],
  ["This prototype may only store these tiers. VERIFIED and tier 3 need an evidence block it does not produce.", "This prototype may only store these tiers. The refused confirmation label and tier 3 need an evidence block it does not produce."],
  ["tier 0 means no verification.", "tier 0 means no independent check."],
  ["or verified in these fixtures.", "or independently checked in these fixtures."],
  ["Health811 was not re-verified in this build, so no 811 number is published here.", "Health811 was not re-checked in this build, so no 811 number is published here."],
]);

export function maskAllowlistedTokens(content) {
  return content.split(ALLOWLISTED).join(" ".repeat(ALLOWLISTED.length));
}

export function findBannedVerif(content) {
  return maskAllowlistedTokens(content).match(HUB_VERIF_PATTERN) ?? [];
}

export function rewriteHubWording(content) {
  let next = content;
  for (const [from, to] of HUB_WORDING_REPLACEMENTS) {
    if (from && next.includes(from)) next = next.split(from).join(to);
  }
  return next;
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === "test" || name === "e2e" || name === "docs") continue;
      walk(full, files);
    } else if (TEXT_EXTENSIONS.has(extname(full).toLowerCase())) {
      if (/\.(?:test|spec)\./.test(name)) continue;
      files.push(full);
    }
  }
  return files;
}

/** Rewrite one copied package directory. Throws if a banned token remains. */
export function applyHubWordingBan(dir) {
  const leftovers = [];
  for (const file of walk(dir)) {
    const original = readFileSync(file, "utf8");
    const next = rewriteHubWording(original);
    if (next !== original) writeFileSync(file, next);
    const hits = findBannedVerif(next);
    if (hits.length > 0) {
      leftovers.push(`${file}: ${[...new Set(hits)].join(", ")}`);
    }
  }
  if (leftovers.length > 0) {
    throw new Error(
      `Hub package still contains banned verify/vérifier wording after rewrite:\n${leftovers.join("\n")}`,
    );
  }
}
