import type {
  PacketAction, PacketCondition, PacketIssue, PacketLocale,
  PacketOperation, PacketStage, PacketTier,
} from "./recoveryEvidencePacket";

export interface PacketCopy {
  readonly heading: string;
  readonly description: string;
  readonly caution: string;
  readonly unknown: "UNKNOWN";
  readonly inspect: string;
  readonly add: string;
  readonly record: string;
  readonly note: string;
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly reference: string;
  readonly tier: string;
  readonly condition: string;
  readonly operation: string;
  readonly pack: string;
  readonly entries: string;
  readonly stage: string;
  readonly save: string;
  readonly open: string;
  readonly import: string;
  readonly apply: string;
  readonly reject: string;
  readonly empty: string;
  readonly pending: string;
  readonly saved: string;
  readonly failed: string;
  readonly imported: string;
  readonly export: string;
  readonly close: string;
  readonly reopen: string;
  readonly review: string;
  readonly events: string;
  readonly summaries: string;
  readonly warning: string;
  readonly action: string;
  readonly search: string;
  readonly clear: string;
  readonly findings: string;
  readonly filterAll: string;
  readonly fileLabel: string;
  readonly dateLabel: string;
  readonly noPack: string;
  readonly issues: Readonly<Record<PacketIssue, string>>;
  readonly operations: Readonly<Record<PacketOperation, string>>;
  readonly conditions: Readonly<Record<PacketCondition, string>>;
  readonly tiers: Readonly<Record<PacketTier, string>>;
  readonly stages: Readonly<Record<PacketStage, string>>;
  readonly actions: Readonly<Record<PacketAction, string>>;
}
const en: PacketCopy = {
  heading: "Local recovery evidence packet",
  description: "Document local observations manually, review changes, and export a portable packet.",
  caution: "UNKNOWN means unknown. Recorded observations do not establish that a pack is usable.",
  unknown: "UNKNOWN",
  inspect: "Inspect local packs before recording an observation.",
  add: "Add observation",
  record: "Observation",
  note: "What was observed",
  source: "Source name",
  licence: "Source licence",
  retrievedOn: "Retrieved on (YYYY-MM-DD)",
  reference: "Source reference",
  tier: "Evidence tier",
  condition: "Observed condition",
  operation: "Operation",
  pack: "Local pack",
  entries: "Recorded entries",
  stage: "Review stage",
  save: "Save evidence packet",
  open: "Choose local packet file",
  import: "Import preview",
  apply: "Merge imported entries",
  reject: "Discard import",
  empty: "No observations have been recorded.",
  pending: "Import preview is ready. Review before merging.",
  saved: "Packet export submitted to your file saver.",
  failed: "The file operation could not be completed.",
  imported: "Imported entries were merged without replacing existing records.",
  export: "Export",
  close: "Close review",
  reopen: "Reopen review",
  review: "Mark for review",
  events: "Manual activity",
  summaries: "Packet summary",
  warning: "Conflicting identifiers are rejected; existing observations are never silently overwritten.",
  action: "Review note",
  search: "Find an observation",
  clear: "Clear filters",
  findings: "Review findings",
  filterAll: "All conditions",
  fileLabel: "Local JSON file",
  dateLabel: "Observation date",
  noPack: "No local pack selected",
  issues: {
    format: "File format is not supported.",
    limit: "The file or packet exceeds a local limit.",
    identity: "Choose a valid pack and entry identifier.",
    duplicate: "An identifier is already in use.",
    reference: "An entry or event reference could not be found.",
    transition: "This review transition is not available.",
    source: "Supply valid source and licence details.",
    date: "Use a valid YYYY-MM-DD source date.",
    text: "A text field contains invalid characters or is too long.",
    timestamp: "A timestamp is not valid UTC ISO time.",
    conflict: "Conflicting identifiers require manual review. Import was not changed.",
  },
  operations: { pack: "Pack", download: "Download", export: "Export", handoff: "Handoff" },
  conditions: { UNKNOWN: "UNKNOWN", incomplete: "Incomplete", interrupted: "Interrupted", unavailable: "Unavailable", "needs-review": "Needs review" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed" },
  stages: { draft: "Draft", review: "Needs review", closed: "Closed" },
  actions: { created: "Created", noted: "Note added", "review-requested": "Review requested", reopened: "Reopened", closed: "Closed" },
};
const fr: PacketCopy = {
  heading: "Dossier local de récupération",
  description: "Consignez les observations de l’appareil localement, examinez les changements et exportez un dossier transférable.",
  caution: "UNKNOWN signifie inconnu. Une observation ne confirme pas qu’un ensemble est utilisable.",
  unknown: "UNKNOWN",
  inspect: "Examinez les ensembles locaux avant de consigner une observation.",
  add: "Ajouter une observation",
  record: "Observation",
  note: "Description de l’observation",
  source: "Nom de la source",
  licence: "Licence de la source",
  retrievedOn: "Date de récupération (AAAA-MM-JJ)",
  reference: "Référence de la source",
  tier: "Niveau de preuve",
  condition: "État observé",
  operation: "Opération",
  pack: "Ensemble local",
  entries: "Observations consignées",
  stage: "Étape de révision",
  save: "Enregistrer le dossier",
  open: "Choisir un dossier local",
  import: "Aperçu de l’importation",
  apply: "Fusionner les observations",
  reject: "Annuler l’importation",
  empty: "Aucune observation consignée.",
  pending: "L’aperçu est prêt. Examinez les données avant la fusion.",
  saved: "Le dossier a été transmis au mécanisme d’enregistrement.",
  failed: "L’opération sur le fichier a échoué.",
  imported: "Les données ont été fusionnées sans remplacer les observations existantes.",
  export: "Exporter",
  close: "Terminer la révision",
  reopen: "Rouvrir la révision",
  review: "Demander une révision",
  events: "Activité manuelle",
  summaries: "Résumé du dossier",
  warning: "Les identifiants contradictoires sont refusés\u202F; les observations existantes ne sont jamais remplacées automatiquement.",
  action: "Note de révision",
  search: "Rechercher une observation",
  clear: "Effacer les filtres",
  findings: "Points à examiner",
  filterAll: "Tous les états",
  fileLabel: "Fichier JSON local",
  dateLabel: "Date de l’observation",
  noPack: "Aucun ensemble local sélectionné",
  issues: {
    format: "Le format du fichier n’est pas pris en charge.",
    limit: "La taille du fichier ou du dossier dépasse la limite locale.",
    identity: "Choisissez un ensemble et un identifiant valides.",
    duplicate: "Cet identifiant est déjà utilisé.",
    reference: "La référence d’une observation ou d’un évènement est introuvable.",
    transition: "Cette transition de révision est indisponible.",
    source: "Indiquez une source et une licence valides.",
    date: "Utilisez une date valide au format AAAA-MM-JJ.",
    text: "Un champ contient des caractères interdits ou trop de texte.",
    timestamp: "L’horodatage UTC n’est pas valide.",
    conflict: "Un conflit d’identifiants exige une révision manuelle. L’importation est inchangée.",
  },
  operations: { pack: "Ensemble", download: "Téléchargement", export: "Exportation", handoff: "Transfert" },
  conditions: { UNKNOWN: "UNKNOWN", incomplete: "Incomplet", interrupted: "Interrompu", unavailable: "Indisponible", "needs-review": "À examiner" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Déclaré", documented: "Documenté", reviewed: "Examiné" },
  stages: { draft: "Brouillon", review: "À examiner", closed: "Terminé" },
  actions: { created: "Créé", noted: "Note ajoutée", "review-requested": "Révision demandée", reopened: "Rouvert", closed: "Terminé" },
};
export function recoveryEvidencePacketCopy(locale: PacketLocale): PacketCopy {
  return locale === "fr" ? fr : en;
}
