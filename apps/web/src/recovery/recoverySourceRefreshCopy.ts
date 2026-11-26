import type {
  RefreshCondition, RefreshDecision, RefreshIssue, RefreshTier, RefreshTopic,
} from "./recoverySourceRefresh";
import type { RefreshFindingCode } from "./recoverySourceRefreshAnalysis";
export interface RefreshCopy {
  readonly title: string;
  readonly description: string;
  readonly caution: string;
  readonly unknown: "UNKNOWN";
  readonly inspect: string;
  readonly waiting: string;
  readonly item: string;
  readonly pack: string;
  readonly topic: string;
  readonly name: string;
  readonly add: string;
  readonly observation: string;
  readonly observationId: string;
  readonly condition: string;
  readonly note: string;
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: string;
  readonly reference: string;
  readonly choose: string;
  readonly record: string;
  readonly review: string;
  readonly decision: string;
  readonly search: string;
  readonly clear: string;
  readonly items: string;
  readonly findings: string;
  readonly age: string;
  readonly days: string;
  readonly window: string;
  readonly asOf: string;
  readonly withinWindow: string;
  readonly queue: string;
  readonly manual: string;
  readonly state: string;
  readonly reviewed: string;
  readonly notReviewed: string;
  readonly empty: string;
  readonly status: string;
  readonly open: string;
  readonly staged: string;
  readonly merge: string;
  readonly export: string;
  readonly exportText: string;
  readonly saved: string;
  readonly failed: string;
  readonly invalid: string;
  readonly conflict: string;
  readonly noFile: string;
  readonly pending: string;
  readonly issues: Readonly<Record<RefreshIssue, string>>;
  readonly topics: Readonly<Record<RefreshTopic, string>>;
  readonly conditions: Readonly<Record<RefreshCondition, string>>;
  readonly tiers: Readonly<Record<RefreshTier, string>>;
  readonly decisions: Readonly<Record<RefreshDecision, string>>;
  readonly findingsCopy: Readonly<Record<RefreshFindingCode, string>>;
}
const en: RefreshCopy = {
  title: "Source refresh review",
  description: "Record the dates and provenance of local recovery evidence. Review changes manually, without network access.",
  caution: "UNKNOWN means there is not enough information to establish the condition. A recent source date does not show that a pack is usable.",
  unknown: "UNKNOWN", inspect: "Inspect local packs", waiting: "Inspect local packs before adding a source subject.",
  item: "Source item", pack: "Pack", topic: "Evidence topic", name: "Short description", add: "Add source item",
  observation: "Record an observation", observationId: "Source item", condition: "Observed condition", note: "Observation note",
  source: "Source name", licence: "Licence", retrievedOn: "Retrieved on", tier: "Evidence tier", reference: "Source reference",
  choose: "Choose an item", record: "Save observation", review: "Record manual review", decision: "Review decision",
  search: "Search local entries", clear: "Clear search", items: "Source items", findings: "Review findings",
  withinWindow: "Within the selected review window",
  age: "Age of source", days: "days", window: "Manual review window", asOf: "Review reference day",
  queue: "Manual review queue", manual: "Manual review", state: "Status", reviewed: "Reviewed record", notReviewed: "Needs manual review",
  empty: "No local source items match this filter.", status: "Review message", open: "Choose local JSON file",
  staged: "Import preview", merge: "Merge local records", export: "Export JSON", exportText: "Export summary",
  saved: "Local file saved.", failed: "The file could not be saved or read.", invalid: "File format not accepted.",
  conflict: "Conflicting identifiers cannot be imported automatically.", noFile: "No file was selected.", pending: "Reading local file…",
  issues: {
    format: "The document has an invalid format.", limit: "The document exceeds a local size limit.",
    identity: "The selected identifier or field is invalid.", text: "A text field is invalid or too long.",
    date: "Use a valid calendar day or UTC timestamp.", source: "Supply a source, licence, date, tier and reference.",
    reference: "The referenced item does not exist.", duplicate: "An identifier is already used.",
    order: "An event must follow the recorded item and preceding events.", conflict: "A manual merge is needed for conflicting records.",
    transition: "That manual review transition is not available.",
  },
  topics: { pack: "Pack", content: "Content", licence: "Licence", integrity: "Integrity", handoff: "Handoff", other: "Other" },
  conditions: { UNKNOWN: "UNKNOWN", available: "Reported available", unavailable: "Reported unavailable", "needs-review": "Needs review" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed source" },
  decisions: { "review-needed": "Review requested", reviewed: "Review completed", reopened: "Reopen review" },
  findingsCopy: {
    "no-observation": "No observation", "unknown-condition": "Condition UNKNOWN", unavailable: "Reported unavailable",
    "needs-review": "Needs review", "unknown-tier": "Evidence tier UNKNOWN", "age-unknown": "Source age UNKNOWN",
    "older-than-window": "Older than selected review window", "conflicting-observations": "Conflicting references",
    unreviewed: "Not reviewed", "future-source-date": "Retrieval later than reference day", "review-reopened": "Review reopened",
  },
};
const fr: RefreshCopy = {
  title: "Examen de l’actualité des sources",
  description: "Consignez les dates et la provenance d’observations locales. Examinez les changements manuellement, sans connexion réseau.",
  caution: "UNKNOWN indique que les renseignements ne suffisent pas pour déterminer l’état. Une date récente ne confirme pas qu’un ensemble est utilisable.",
  unknown: "UNKNOWN", inspect: "Examiner les ensembles locaux", waiting: "Examinez les ensembles locaux avant d’ajouter un dossier de source.",
  item: "Dossier de source", pack: "Ensemble", topic: "Sujet de la preuve", name: "Description brève", add: "Ajouter un dossier de source",
  observation: "Consigner une observation", observationId: "Dossier de source", condition: "État observé", note: "Note d’observation",
  source: "Nom de la source", licence: "Licence", retrievedOn: "Date de récupération", tier: "Niveau de preuve", reference: "Référence de la source",
  choose: "Choisir un dossier", record: "Enregistrer l’observation", review: "Consigner l’examen manuel", decision: "Décision d’examen",
  search: "Rechercher des dossiers locaux", clear: "Effacer la recherche", items: "Dossiers de source", findings: "Points à examiner",
  withinWindow: "Dans la fenêtre d’examen choisie",
  age: "Âge de la source", days: "jours", window: "Fenêtre d’examen manuel", asOf: "Date de référence de l’examen",
  queue: "Liste d’examen manuel", manual: "Examen manuel", state: "État", reviewed: "Dossier examiné", notReviewed: "Examen manuel requis",
  empty: "Aucun dossier local ne correspond à ce filtre.", status: "Message d’examen", open: "Choisir un fichier JSON local",
  staged: "Aperçu de l’importation", merge: "Fusionner les dossiers locaux", export: "Exporter le JSON", exportText: "Exporter le résumé",
  saved: "Fichier local enregistré.", failed: "Le fichier ne peut pas être lu ou enregistré.", invalid: "Format du fichier non accepté.",
  conflict: "Les identifiants contradictoires ne peuvent pas être importés automatiquement.", noFile: "Aucun fichier sélectionné.",
  pending: "Lecture du fichier local…",
  issues: {
    format: "Le document ne respecte pas le format attendu.", limit: "Le document dépasse une limite de taille locale.",
    identity: "Un identifiant ou un champ sélectionné n’est pas valide.", text: "Un champ de texte est invalide ou trop long.",
    date: "Utilisez une date civile ou un horodatage UTC valide.", source: "Indiquez la source, la licence, la date, le niveau et la référence.",
    reference: "Le dossier référencé est introuvable.", duplicate: "Cet identifiant est déjà utilisé.",
    order: "L’évènement doit suivre le dossier et les évènements antérieurs.", conflict: "Une fusion manuelle est nécessaire pour les données contradictoires.",
    transition: "Cette transition d’examen manuel est indisponible.",
  },
  topics: { pack: "Ensemble", content: "Contenu", licence: "Licence", integrity: "Intégrité", handoff: "Transfert", other: "Autre" },
  conditions: { UNKNOWN: "UNKNOWN", available: "Déclaré disponible", unavailable: "Déclaré indisponible", "needs-review": "À examiner" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Déclaré", documented: "Documenté", reviewed: "Source examinée" },
  decisions: { "review-needed": "Examen demandé", reviewed: "Examen terminé", reopened: "Rouvrir l’examen" },
  findingsCopy: {
    "no-observation": "Aucune observation", "unknown-condition": "État UNKNOWN", unavailable: "Déclaré indisponible",
    "needs-review": "À examiner", "unknown-tier": "Niveau de preuve UNKNOWN", "age-unknown": "Âge de source UNKNOWN",
    "older-than-window": "Plus ancien que la fenêtre choisie", "conflicting-observations": "Références contradictoires",
    unreviewed: "Non examiné", "future-source-date": "Récupération après la date de référence", "review-reopened": "Examen rouvert",
  },
};
export function recoverySourceRefreshCopy(locale: "en" | "fr"): RefreshCopy { return locale === "fr" ? fr : en; }
