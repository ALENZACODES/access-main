import type { EvidenceDecision, EvidenceIssue, EvidenceTier } from "./recoveryEvidenceNotebook";
import type { RecoveryLocale } from "./index";

export interface EvidenceCopy {
  readonly title: string;
  readonly intro: string;
  readonly packId: string;
  readonly field: string;
  readonly value: string;
  readonly unknownValue: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: string;
  readonly note: string;
  readonly add: string;
  readonly inspect: string;
  readonly save: string;
  readonly load: string;
  readonly merge: string;
  readonly reset: string;
  readonly empty: string;
  readonly pending: string;
  readonly imported: string;
  readonly exported: string;
  readonly stopped: string;
  readonly unsupported: string;
  readonly details: string;
  readonly created: string;
  readonly changed: string;
  readonly status: string;
  readonly review: string;
  readonly summary: string;
  readonly all: string;
  readonly known: string;
  readonly unknown: string;
  readonly conflicts: string;
  readonly duplicates: string;
  readonly additions: string;
  readonly cancel: string;
  readonly state: Readonly<Record<EvidenceDecision, string>>;
  readonly tiers: Readonly<Record<EvidenceTier, string>>;
  readonly issues: Readonly<Record<EvidenceIssue, string>>;
}

const EN: EvidenceCopy = {
  title: "Recovery evidence notebook",
  intro: "Keep local notes about pack files. A note does not change pack readiness or describe physical accessibility. UNKNOWN remains UNKNOWN.",
  packId: "Pack ID", field: "File field", value: "Recorded value", unknownValue: "Leave UNKNOWN",
  source: "Source", licence: "Open licence", date: "Source date", tier: "Evidence tier", note: "Note",
  add: "Add local note", inspect: "Review notes", save: "Save JSON file", load: "Choose local JSON file",
  merge: "Add non-conflicting notes", reset: "Clear local notes", empty: "No local notes in this session.",
  pending: "Reading the selected file…", imported: "Local notes added.", exported: "JSON file saved.",
  stopped: "The requested action did not finish.", unsupported: "This file cannot be used.",
  details: "Local file comparison", created: "Created", changed: "Last changed", status: "Review state",
  review: "Review entry", summary: "Summary", all: "All", known: "With a value", unknown: "UNKNOWN",
  conflicts: "Conflicting notes", duplicates: "Already present", additions: "New notes", cancel: "Dismiss preview",
  state: { open: "To review", accepted: "Reviewed", superseded: "Superseded", dismissed: "Dismissed" },
  tiers: { official: "Public source", community: "Community", "self-reported": "Personal observation", unknown: "UNKNOWN" },
  issues: {
    "invalid-shape": "The document structure is not supported.",
    "invalid-version": "The document format is not supported.",
    "too-large": "The selected file is too large.",
    "too-many": "Too many entries are present.",
    "invalid-date": "The date is not valid.",
    "future-date": "The source date is after the entry date.",
    "invalid-id": "The entry or pack ID is invalid.",
    "duplicate-id": "The entry ID appears more than once.",
    "invalid-key": "Use a short lower-case field key.",
    "invalid-value": "The value is not supported.",
    "invalid-source": "A source name is required.",
    "closed-licence": "Choose one of the supported open licences.",
    "invalid-tier": "Choose an evidence tier.",
    "invalid-note": "The note contains unsupported characters or is too long.",
    "invalid-decision": "The review state is not supported.",
    "invalid-timestamp": "The entry timestamps are inconsistent.",
    "invalid-history": "A closed review state cannot be changed.",
    "unexpected-key": "The document contains an unsupported field.",
    "unsafe-text": "The document contains unsupported text.",
    conflict: "Conflicting notes must be resolved outside this import.",
  },
};

const FR: EvidenceCopy = {
  title: "Carnet de renseignements de récupération",
  intro: "Consignez des notes locales sur les fichiers. Une note ne change pas l’état de l’ensemble et ne décrit pas l’accessibilité physique. UNKNOWN reste UNKNOWN.",
  packId: "Identifiant de l’ensemble", field: "Champ du fichier", value: "Valeur consignée", unknownValue: "Garder UNKNOWN",
  source: "Source", licence: "Licence ouverte", date: "Date de la source", tier: "Niveau de preuve", note: "Note",
  add: "Ajouter une note locale", inspect: "Examiner les notes", save: "Enregistrer le fichier JSON",
  load: "Choisir un fichier JSON local", merge: "Ajouter les notes sans conflit", reset: "Effacer les notes locales",
  empty: "Aucune note locale dans cette session.", pending: "Lecture du fichier sélectionné…",
  imported: "Notes locales ajoutées.", exported: "Fichier JSON enregistré.",
  stopped: "L’action demandée ne s’est pas terminée.", unsupported: "Ce fichier ne peut pas être utilisé.",
  details: "Comparaison du fichier local", created: "Créé le", changed: "Dernière modification", status: "État de la revue",
  review: "Examiner l’entrée", summary: "Résumé", all: "Total", known: "Avec une valeur", unknown: "UNKNOWN",
  conflicts: "Notes en conflit", duplicates: "Déjà présentes", additions: "Nouvelles notes", cancel: "Fermer l’aperçu",
  state: { open: "À examiner", accepted: "Examinée", superseded: "Remplacée", dismissed: "Écartée" },
  tiers: { official: "Source publique", community: "Communauté", "self-reported": "Observation personnelle", unknown: "UNKNOWN" },
  issues: {
    "invalid-shape": "La structure du document n’est pas prise en charge.",
    "invalid-version": "Le format du document n’est pas pris en charge.",
    "too-large": "Le fichier sélectionné est trop volumineux.",
    "too-many": "Le document contient trop d’entrées.",
    "invalid-date": "La date n’est pas valide.",
    "future-date": "La date de la source suit la date de l’entrée.",
    "invalid-id": "L’identifiant de l’entrée ou de l’ensemble est invalide.",
    "duplicate-id": "Un identifiant d’entrée apparaît plusieurs fois.",
    "invalid-key": "Utilisez une clé de champ courte, en minuscules.",
    "invalid-value": "La valeur n’est pas prise en charge.",
    "invalid-source": "Le nom de la source est obligatoire.",
    "closed-licence": "Choisissez une licence ouverte prise en charge.",
    "invalid-tier": "Choisissez un niveau de preuve.",
    "invalid-note": "La note contient des caractères non pris en charge ou est trop longue.",
    "invalid-decision": "L’état de la revue n’est pas pris en charge.",
    "invalid-timestamp": "Les dates des entrées sont incohérentes.",
    "invalid-history": "L’état d’une revue terminée ne peut pas être modifié.",
    "unexpected-key": "Le document contient un champ non pris en charge.",
    "unsafe-text": "Le document contient du texte non pris en charge.",
    conflict: "Les notes en conflit doivent être résolues en dehors de cet import.",
  },
};

export function evidenceCopy(locale: RecoveryLocale): EvidenceCopy {
  return locale === "fr" ? FR : EN;
}
