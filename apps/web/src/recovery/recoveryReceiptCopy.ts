import type {
  ReceiptCondition, ReceiptEventAction, ReceiptEvidenceTier, ReceiptIssue,
  ReceiptLocale, ReceiptOperation, ReceiptStage,
} from "./recoveryReceiptLedger";

export interface ReceiptCopy {
  readonly heading: string;
  readonly description: string;
  readonly caution: string;
  readonly inspect: string;
  readonly packId: string;
  readonly operation: string;
  readonly condition: string;
  readonly summary: string;
  readonly role: string;
  readonly handoffReference: string;
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: string;
  readonly reference: string;
  readonly expectedBytes: string;
  readonly observedBytes: string;
  readonly digest: string;
  readonly add: string;
  readonly empty: string;
  readonly open: string;
  readonly merge: string;
  readonly save: string;
  readonly note: string;
  readonly record: string;
  readonly review: string;
  readonly count: string;
  readonly pending: string;
  readonly staged: string;
  readonly saved: string;
  readonly failed: string;
  readonly noInspection: string;
  readonly noFile: string;
  readonly search: string;
  readonly clear: string;
  readonly status: string;
  readonly unknown: "UNKNOWN";
  readonly operations: Readonly<Record<ReceiptOperation, string>>;
  readonly conditions: Readonly<Record<ReceiptCondition, string>>;
  readonly tiers: Readonly<Record<ReceiptEvidenceTier, string>>;
  readonly stages: Readonly<Record<ReceiptStage, string>>;
  readonly actions: Readonly<Record<ReceiptEventAction, string>>;
  readonly issues: Readonly<Record<ReceiptIssue, string>>;
}

const en: ReceiptCopy = {
  heading: "Recovery handoff receipts",
  description: "Keep local records of a handoff, its source and manual acknowledgements or disputes.",
  caution: "A receipt is documentation only. It does not confirm that a pack, route or place is usable.",
  inspect: "Inspect local packs",
  packId: "Pack identifier",
  operation: "Operation",
  condition: "Observed condition",
  summary: "Observation note",
  role: "Receiving role (not a person's name)",
  handoffReference: "Handoff reference",
  source: "Source name",
  licence: "Source licence",
  retrievedOn: "Source retrieval date",
  tier: "Evidence tier",
  reference: "Source reference",
  expectedBytes: "Expected bytes, if known",
  observedBytes: "Observed bytes, if known",
  digest: "SHA-256 digest, if known",
  add: "Add receipt",
  empty: "No receipt has been recorded. UNKNOWN means no fact has been established.",
  open: "Choose a local JSON file",
  merge: "Merge staged file",
  save: "Save local JSON",
  note: "Event note",
  record: "Record manual event",
  review: "Review findings",
  count: "Recorded receipts",
  pending: "Checking local evidence…",
  staged: "File inspected. Review the merge preview before accepting it.",
  saved: "File saved with the selected local save operation.",
  failed: "The operation could not be completed. No pack was changed.",
  noInspection: "Inspect the local pack list before recording a new receipt.",
  noFile: "Choose a file first.",
  search: "Filter by pack or note",
  clear: "Clear filter",
  status: "Local status",
  unknown: "UNKNOWN",
  operations: { pack: "Pack", download: "Download", export: "Export", handoff: "Handoff" },
  conditions: { UNKNOWN: "UNKNOWN", interrupted: "Interrupted", incomplete: "Incomplete", unavailable: "Unavailable", "needs-review": "Needs review" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed" },
  stages: { draft: "Draft", sent: "Sent", acknowledged: "Acknowledged", disputed: "Disputed", closed: "Closed" },
  actions: { created: "Created", sent: "Sent", acknowledged: "Acknowledged", disputed: "Disputed", reopened: "Reopened", closed: "Closed", note: "Note" },
  issues: {
    format: "The file format is not supported.", limit: "The record limit was exceeded.",
    identity: "An identifier is missing or invalid.", duplicate: "That identifier is already recorded.",
    source: "Provide source, licence, retrieval date, tier and reference.",
    date: "The date is invalid.", timestamp: "An event cannot predate its record.",
    reference: "The entry reference is missing.", transition: "That event cannot follow the current stage.",
    conflict: "Conflicting records cannot be merged automatically.", text: "The note contains unsupported characters.",
  },
};

const fr: ReceiptCopy = {
  heading: "Accusés de réception pour la récupération",
  description: "Consignez localement la remise, sa source et les accusés de réception ou contestations d’un registre local.",
  caution: "Un accusé de réception documente seulement une étape ; il ne confirme pas qu’un ensemble, un trajet ou un lieu peut être utilisé.",
  inspect: "Examiner les ensembles locaux",
  packId: "Identifiant de l’ensemble",
  operation: "Opération",
  condition: "État observé",
  summary: "Note d’observation",
  role: "Rôle destinataire (sans nom personnel)",
  handoffReference: "Référence de remise",
  source: "Nom de la source",
  licence: "Licence de la source",
  retrievedOn: "Date de récupération de la source",
  tier: "Niveau de preuve",
  reference: "Référence de la source",
  expectedBytes: "Octets attendus, si connus",
  observedBytes: "Octets observés, si connus",
  digest: "Empreinte SHA-256, si connue",
  add: "Ajouter un accusé",
  empty: "Aucun accusé enregistré. UNKNOWN signifie que l’information demeure UNKNOWN.",
  open: "Choisir un fichier JSON local",
  merge: "Fusionner le fichier en attente",
  save: "Enregistrer le JSON local",
  note: "Note de l’évènement",
  record: "Consigner l’évènement manuel",
  review: "Examiner les points d’attention",
  count: "Accusés enregistrés",
  pending: "Contrôle des preuves locales…",
  staged: "Fichier examiné. Consultez l’aperçu avant de confirmer la fusion.",
  saved: "Fichier enregistré par l’action locale choisie.",
  failed: "L’opération n’a pas abouti. Aucun ensemble n’a été modifié.",
  noInspection: "Examinez les ensembles locaux avant de créer un accusé.",
  noFile: "Choisissez d’abord un fichier.",
  search: "Filtrer par ensemble ou note",
  clear: "Effacer le filtre",
  status: "État local",
  unknown: "UNKNOWN",
  operations: { pack: "Ensemble", download: "Téléchargement", export: "Exportation", handoff: "Remise" },
  conditions: { UNKNOWN: "UNKNOWN", interrupted: "Interrompu", incomplete: "Incomplet", unavailable: "Indisponible", "needs-review": "À examiner" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Autodéclaré", documented: "Documenté", reviewed: "Examiné" },
  stages: { draft: "Brouillon", sent: "Envoyé", acknowledged: "Accusé reçu", disputed: "Contesté", closed: "Clos" },
  actions: { created: "Créé", sent: "Envoyé", acknowledged: "Réception confirmée", disputed: "Contesté", reopened: "Réouvert", closed: "Clos", note: "Note" },
  issues: {
    format: "Le format du fichier n’est pas pris en charge.", limit: "La limite de fiches est dépassée.",
    identity: "L’identifiant est manquant ou invalide.", duplicate: "Cet identifiant existe déjà.",
    source: "Indiquez la source, la licence, la date, le niveau et la référence.",
    date: "La date est invalide.", timestamp: "Un évènement ne peut précéder son dossier.",
    reference: "La référence du dossier est manquante.", transition: "Cet évènement ne peut suivre l’étape actuelle.",
    conflict: "Les dossiers contradictoires ne peuvent être fusionnés automatiquement.",
    text: "La note contient des caractères non pris en charge.",
  },
};
export function recoveryReceiptCopy(locale: ReceiptLocale): ReceiptCopy { return locale === "fr" ? fr : en; }
