import type { RecoveryLocale } from "./index";
import type {
  CheckpointCondition, CheckpointIssue, CheckpointOperation,
  CheckpointPhase, CheckpointTier,
} from "./recoveryCheckpoint";
import type { CheckpointNextStep } from "./recoveryCheckpointAnalysis";

export interface CheckpointCopy {
  readonly title: string;
  readonly intro: string;
  readonly notice: string;
  readonly add: string;
  readonly pack: string;
  readonly operation: string;
  readonly capturedAt: string;
  readonly condition: string;
  readonly bytes: string;
  readonly digest: string;
  readonly note: string;
  readonly source: string;
  readonly licence: string;
  readonly sourceDate: string;
  readonly tier: string;
  readonly reference: string;
  readonly save: string;
  readonly select: string;
  readonly apply: string;
  readonly discard: string;
  readonly review: string;
  readonly dispute: string;
  readonly empty: string;
  readonly pending: string;
  readonly saved: string;
  readonly failed: string;
  readonly imported: string;
  readonly preview: string;
  readonly conflicts: string;
  readonly changed: string;
  readonly unknown: string;
  readonly current: string;
  readonly earlier: string;
  readonly report: string;
  readonly missing: string;
  readonly actions: string;
  readonly summary: string;
  readonly conditions: Readonly<Record<CheckpointCondition, string>>;
  readonly operations: Readonly<Record<CheckpointOperation, string>>;
  readonly phases: Readonly<Record<CheckpointPhase, string>>;
  readonly tiers: Readonly<Record<CheckpointTier, string>>;
  readonly steps: Readonly<Record<CheckpointNextStep, string>>;
  readonly issues: Readonly<Record<CheckpointIssue, string>>;
}
const EN: CheckpointCopy = {
  title: "Recovery checkpoints",
  intro: "Record observations made before or after a pack, download or export problem.",
  notice: "These are manual notes. They do not change the saved pack or confirm that its contents can be used.",
  add: "Add checkpoint", pack: "Pack", operation: "Operation", capturedAt: "Recorded at",
  condition: "Reported condition", bytes: "Reported bytes", digest: "Supplied SHA-256", note: "Note",
  source: "Source", licence: "Licence", sourceDate: "Source date", tier: "Evidence tier",
  reference: "Source reference", save: "Save checkpoint file", select: "Choose checkpoint file",
  apply: "Add non-conflicting checkpoints", discard: "Discard selected file", review: "Mark reviewed",
  dispute: "Mark disputed", empty: "No checkpoints recorded", pending: "Loading file…",
  saved: "Checkpoint file saved locally.", failed: "Could not complete this local action.",
  imported: "Checkpoints were added to this session.", preview: "Review selected file",
  conflicts: "Conflicting IDs", changed: "Changes", unknown: "UNKNOWN", current: "Current note",
  earlier: "Earlier note", report: "Save comparison report", missing: "Missing information",
  actions: "Manual next steps", summary: "Checkpoint summary",
  conditions: { UNKNOWN: "UNKNOWN", missing: "Missing", interrupted: "Interrupted", damaged: "Damaged", available: "Reported present" },
  operations: { pack: "Pack", download: "Download", export: "Export" },
  phases: { draft: "Not reviewed", reviewed: "Reviewed", disputed: "Disputed" },
  tiers: { UNKNOWN: "UNKNOWN", "user-observation": "Personal observation", "file-metadata": "File information", "source-document": "Source document" },
  steps: {
    "review-source": "Review the recorded source and date",
    "read-pack": "Inspect the locally stored pack information",
    "check-storage": "Check available device storage",
    "check-connection": "Check network settings before choosing to retry",
    "review-output": "Open the output locally and inspect its contents",
    "compare-files": "Compare the saved file with a known source copy",
    "document-unknown": "Keep the condition UNKNOWN until further evidence is available",
  },
  issues: {
    shape: "The record structure is not supported.", format: "The file format is not supported.",
    limit: "The file or record count is too large.", identity: "The pack or record identifier is invalid.",
    date: "The source date is invalid.", time: "The observation time is invalid.",
    text: "Some text cannot be recorded.", source: "Source information is missing or invalid.",
    licence: "Choose a supported open licence.", tier: "The evidence tier is unsupported.",
    condition: "The reported condition is unsupported.", phase: "The review status is unsupported.",
    duplicate: "The identifier already exists.", sequence: "The observation order is invalid.",
    transition: "This record cannot be reviewed again.", conflict: "Conflicting histories cannot be merged.",
    missing: "The checkpoint is not listed.",
  },
};
const FR: CheckpointCopy = {
  title: "Points de suivi de récupération",
  intro: "Consignez les observations faites avant ou après un problème d’ensemble, de téléchargement ou d’exportation.",
  notice: "Ces notes sont manuelles. Elles ne changent pas l’ensemble enregistré et ne confirment pas que son contenu peut être utilisé.",
  add: "Ajouter un point de suivi", pack: "Ensemble", operation: "Opération", capturedAt: "Date et heure de la note",
  condition: "État déclaré", bytes: "Octets déclarés", digest: "SHA-256 fourni", note: "Note",
  source: "Source", licence: "Licence", sourceDate: "Date de la source", tier: "Niveau de preuve",
  reference: "Référence de la source", save: "Enregistrer le fichier local", select: "Choisir un fichier local",
  apply: "Ajouter les points sans conflit", discard: "Écarter le fichier sélectionné", review: "Marquer comme examiné",
  dispute: "Marquer comme contesté", empty: "Aucun point de suivi enregistré", pending: "Lecture du fichier…",
  saved: "Fichier de suivi enregistré localement.", failed: "Cette action locale n’a pas abouti.",
  imported: "Les points de suivi ont été ajoutés à cette session.", preview: "Examiner le fichier sélectionné",
  conflicts: "Identifiants contradictoires", changed: "Changements", unknown: "UNKNOWN", current: "Note récente",
  earlier: "Note précédente", report: "Enregistrer le rapport comparatif", missing: "Renseignements manquants",
  actions: "Prochaines étapes manuelles", summary: "Résumé du suivi",
  conditions: { UNKNOWN: "UNKNOWN", missing: "Manquant", interrupted: "Interrompu", damaged: "Endommagé", available: "Présence déclarée" },
  operations: { pack: "Ensemble", download: "Téléchargement", export: "Exportation" },
  phases: { draft: "Non examiné", reviewed: "Examiné", disputed: "Contesté" },
  tiers: { UNKNOWN: "UNKNOWN", "user-observation": "Observation personnelle", "file-metadata": "Données du fichier", "source-document": "Document source" },
  steps: {
    "review-source": "Examiner la source et sa date",
    "read-pack": "Examiner les renseignements de l’ensemble enregistré",
    "check-storage": "Consulter l’espace de stockage disponible",
    "check-connection": "Examiner la connexion avant de choisir de réessayer",
    "review-output": "Ouvrir le fichier produit et examiner son contenu",
    "compare-files": "Comparer le fichier enregistré avec une copie source connue",
    "document-unknown": "Conserver UNKNOWN jusqu’à la disponibilité d’autres éléments",
  },
  issues: {
    shape: "La structure du fichier n’est pas prise en charge.", format: "Le format du fichier n’est pas pris en charge.",
    limit: "Le fichier ou le nombre de notes dépasse la limite.", identity: "L’identifiant de l’ensemble ou de la note est incorrect.",
    date: "La date de la source est incorrecte.", time: "La date et l’heure de la note sont incorrectes.",
    text: "Certains caractères ne peuvent pas être enregistrés.", source: "La source est absente ou incorrecte.",
    licence: "Choisissez une licence ouverte prise en charge.", tier: "Le niveau de preuve n’est pas pris en charge.",
    condition: "L’état déclaré n’est pas pris en charge.", phase: "L’état d’examen n’est pas pris en charge.",
    duplicate: "L’identifiant existe déjà.", sequence: "L’ordre des observations est incorrect.",
    transition: "Cette note ne peut pas être examinée de nouveau.", conflict: "Les historiques contradictoires ne peuvent pas être fusionnés.",
    missing: "Ce point de suivi n’est pas répertorié.",
  },
};
export function recoveryCheckpointCopy(locale: RecoveryLocale): CheckpointCopy {
  return locale === "fr" ? FR : EN;
}
