import i18n from "i18next";
import { initI18n } from "../i18n/index.ts";

export const messages = {
  en: {
    features: {
      title: "Settings", description: "Choose how the App works on this device.",
      controls: "Control modes", controlsDesc: "Keyboard, switch, voice and gaze controls.",
      consent: "Consent", consentDesc: "Review and change permissions for sharing and export.",
      caregiver: "Caregiver sharing", caregiverDesc: "Manage access granted to a caregiver.",
      sync: "On-device sync", syncDesc: "Compare local snapshots and resolve conflicts.",
      advocacy: "Advocacy evidence", advocacyDesc: "Prepare a privacy-checked evidence pack.",
      sources: "Data sources", sourcesDesc: "See provenance, licences and data coverage.",
      pending: "This feature is not included in this build yet.",
      unavailable: "This feature could not be loaded.", back: "Back to settings",
      permission: "Permission is required before this action.", consentLink: "Review consent",
      caregiverPurpose: "Caregiver sharing", advocacyPurpose: "Advocacy export",
      consentUnavailable: "Consent verification is unavailable; sharing and export remain blocked.",
      allowed: "Permission confirmed on this device.", blocked: "Permission not granted.",
      left: "Local snapshot A (JSON)", right: "Local snapshot B (JSON)",
      compare: "Compare snapshots", conflicts: "Conflicts", result: "Comparison result",
      invalidJson: "Enter two valid JSON snapshots.", noSnapshots: "No snapshots have been provided.",
      exportInput: "Observations (JSON)", export: "Build and export evidence pack",
      exportError: "The evidence pack could not be validated or exported.",
      noObservations: "Enter observations to build an evidence pack.",
      loading: "Loading verified source information…", noManifest: "Source information is not available.",
      records: "Records in pack", recordsCount: "Records in pack: {count}", tranche: "Records by type", sourceCounts: "Records by source",
      sourceName: "Source", licence: "Licence", retrieved: "Retrieved", included: "Included in web pack",
      held: "Held from web pack", yes: "Yes", no: "No", unknown: "Unknown",
      count: "Count", reason: "Reason", attribution: "Attribution", none: "No entries reported.",
      demo: "Demonstration data — not real evidence", exportBlocked: "Export blocked pending consent.",
    },
  },
  fr: {
    features: {
      title: "Paramètres", description: "Choisissez le fonctionnement de l’application sur cet appareil.",
      controls: "Modes de commande", controlsDesc: "Commandes au clavier, par contacteur, à la voix et par regard.",
      consent: "Consentement", consentDesc: "Consultez et modifiez les autorisations de partage et d’exportation.",
      caregiver: "Partage avec un proche aidant", caregiverDesc: "Gérez l’accès accordé à un proche aidant.",
      sync: "Synchronisation locale", syncDesc: "Comparez des instantanés locaux et résolvez les conflits.",
      advocacy: "Dossier de défense des droits", advocacyDesc: "Préparez un dossier de preuves avec contrôle de confidentialité.",
      sources: "Sources de données", sourcesDesc: "Consultez la provenance, les licences et la couverture des données.",
      pending: "Cette fonction n’est pas encore incluse dans cette version.",
      unavailable: "Impossible de charger cette fonction.", back: "Retour aux paramètres",
      permission: "Une autorisation est nécessaire avant cette action.", consentLink: "Vérifier le consentement",
      caregiverPurpose: "Partage avec un proche aidant", advocacyPurpose: "Exportation de preuves",
      consentUnavailable: "La vérification du consentement est indisponible\u202F; le partage et l’exportation restent bloqués.",
      allowed: "Autorisation confirmée sur cet appareil.", blocked: "Autorisation non accordée.",
      left: "Instantané local A (JSON)", right: "Instantané local B (JSON)",
      compare: "Comparer les instantanés", conflicts: "Conflits", result: "Résultat de la comparaison",
      invalidJson: "Saisissez deux instantanés JSON valides.", noSnapshots: "Aucun instantané fourni.",
      exportInput: "Observations (JSON)", export: "Créer et exporter le dossier de preuves",
      exportError: "Impossible de valider ou d’exporter le dossier de preuves.",
      noObservations: "Saisissez des observations pour créer un dossier de preuves.",
      loading: "Chargement des sources vérifiées…", noManifest: "Informations sur les sources indisponibles.",
      records: "Enregistrements du lot", recordsCount: "Enregistrements du lot\u00A0: {count}", tranche: "Enregistrements par catégorie", sourceCounts: "Enregistrements par source",
      sourceName: "Source", licence: "Licence", retrieved: "Récupéré le", included: "Inclus dans le lot web",
      held: "Exclu du lot web", yes: "Oui", no: "Non", unknown: "Inconnu",
      count: "Nombre", reason: "Motif", attribution: "Attribution", none: "Aucune entrée déclarée.",
      demo: "Données de démonstration — pas de preuves réelles", exportBlocked: "Exportation bloquée en attente du consentement.",
    },
  },
} as const;

export function registerFeatureTranslations(): void {
  initI18n();
  for (const locale of ["en", "fr"] as const) {
    if (!i18n.hasResourceBundle(locale, "translation")) {
      i18n.addResourceBundle(locale, "translation", {}, true, true);
    }
    i18n.addResourceBundle(locale, "translation", messages[locale], true, true);
  }
}
