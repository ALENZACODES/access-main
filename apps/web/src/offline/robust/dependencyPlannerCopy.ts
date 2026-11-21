import type { Language } from "./regionDownload";
import type { DataAvailability, DependencyCategory, DependencyFilter, DependencyPriority, DependencyProgress, DependencySort } from "./dependencyPlanner";
export interface DependencyCopy {
  readonly title: string; readonly intro: string; readonly caution: string; readonly outing: string;
  readonly add: string; readonly addTitle: string; readonly purpose: string; readonly category: string;
  readonly priority: string; readonly progress: string; readonly note: string; readonly cellId: string;
  readonly addCell: string; readonly removeCell: string; readonly save: string; readonly cancel: string;
  readonly remove: string; readonly edit: string; readonly list: string; readonly search: string;
  readonly filter: string; readonly sort: string; readonly previous: string; readonly next: string;
  readonly page: string; readonly noItems: string; readonly summary: string; readonly essentials: string;
  readonly saved: string; readonly unknown: string; readonly unknownPhysical: string;
  readonly followUp: string; readonly source: string; readonly licence: string; readonly date: string;
  readonly reason: string; readonly bytes: string; readonly exportJson: string; readonly exportText: string;
  readonly importJson: string; readonly imported: string; readonly savedMessage: string; readonly error: string;
  readonly invalid: string; readonly clear: string; readonly confirm: string; readonly privacy: string;
  readonly dataOnly: string; readonly unresolved: string; readonly emptyCell: string; readonly print: string;
}
export const DEPENDENCY_COPY: Record<Language, DependencyCopy> = {
  en: {
    title: "Offline dependency planner",
    intro: "List the information you would want available for an outing. Compare the listed offline files with what this device reports saved.",
    caution: "Saved information does not prove an entrance, route, transit service or facility is accessible. Physical access stays UNKNOWN.",
    outing: "Outing label", add: "Add checkpoint", addTitle: "Checkpoint name", purpose: "Why this information matters",
    category: "Topic", priority: "Importance", progress: "Contact or review progress", note: "Your note", cellId: "Offline cell ID",
    addCell: "Add cell ID", removeCell: "Remove cell ID", save: "Save changes", cancel: "Cancel", remove: "Remove checkpoint",
    edit: "Edit checkpoint", list: "Information checkpoints", search: "Search checkpoints", filter: "Show", sort: "Order",
    previous: "Previous page", next: "Next page", page: "Showing", noItems: "No checkpoints match the selection.",
    summary: "Information summary", essentials: "Essential checkpoints", saved: "Saved information", unknown: "UNKNOWN",
    unknownPhysical: "Physical accessibility: UNKNOWN", followUp: "Needs follow-up", source: "Source", licence: "Licence",
    date: "Source date", reason: "Reason", bytes: "Listed bytes", exportJson: "Export JSON", exportText: "Export text",
    importJson: "Import JSON", imported: "Local planner imported.", savedMessage: "Local planner updated.", error: "Could not complete that action.",
    invalid: "The imported file could not be read safely.", clear: "Start again", confirm: "Clear this planner? This cannot be undone.",
    privacy: "Exports may contain personal notes. Review before sharing.", dataOnly: "This checks data availability only.",
    unresolved: "Missing or inconsistent offline evidence remains UNKNOWN.", emptyCell: "No cell IDs linked", print: "Print text",
  },
  fr: {
    title: "Planificateur de dépendances hors ligne",
    intro: "Indiquez les renseignements utiles pour une sortie. Comparez les fichiers hors ligne répertoriés avec les copies enregistrées sur cet appareil.",
    caution: "Une copie enregistrée ne prouve pas l’accessibilité d’une entrée, d’un trajet, d’un service de transport ou d’une installation. L’accessibilité physique reste UNKNOWN.",
    outing: "Nom de la sortie", add: "Ajouter un point à examiner", addTitle: "Nom du point", purpose: "Pourquoi ces renseignements sont utiles",
    category: "Sujet", priority: "Importance", progress: "État du suivi", note: "Votre note", cellId: "Identifiant de cellule hors ligne",
    addCell: "Ajouter une cellule", removeCell: "Retirer la cellule", save: "Enregistrer les modifications", cancel: "Annuler", remove: "Supprimer le point",
    edit: "Modifier le point", list: "Points à examiner", search: "Rechercher des points", filter: "Afficher", sort: "Trier",
    previous: "Page précédente", next: "Page suivante", page: "Affichage", noItems: "Aucun point ne correspond à la sélection.",
    summary: "Résumé des renseignements", essentials: "Points essentiels", saved: "Renseignements enregistrés", unknown: "UNKNOWN",
    unknownPhysical: "Accessibilité physique\u00A0: UNKNOWN", followUp: "Suivi nécessaire", source: "Source", licence: "Licence",
    date: "Date de la source", reason: "Raison", bytes: "Octets répertoriés", exportJson: "Exporter en JSON", exportText: "Exporter le texte",
    importJson: "Importer le JSON", imported: "Plan local importé.", savedMessage: "Plan local mis à jour.", error: "Cette action n’a pas pu être effectuée.",
    invalid: "Le fichier importé n’a pas pu être lu de façon sûre.", clear: "Recommencer", confirm: "Effacer ce plan\u202F? Cette action est définitive.",
    privacy: "Les exports peuvent contenir des notes personnelles. Relisez-les avant de les partager.", dataOnly: "Cet outil examine uniquement la disponibilité des données.",
    unresolved: "Les données hors ligne manquantes ou incohérentes restent UNKNOWN.", emptyCell: "Aucune cellule associée", print: "Imprimer le texte",
  },
};
export const DEPENDENCY_CATEGORIES: Record<Language, Record<DependencyCategory, string>> = {
  en: { arrival: "Arrival", entrance: "Entrance", indoor: "Indoor route", washroom: "Washroom", transit: "Transport", communication: "Communication", other: "Other" },
  fr: { arrival: "Arrivée", entrance: "Entrée", indoor: "Parcours intérieur", washroom: "Toilettes", transit: "Transport", communication: "Communication", other: "Autre" },
};
export const DEPENDENCY_PRIORITIES: Record<Language, Record<DependencyPriority, string>> = {
  en: { essential: "Essential", useful: "Useful", optional: "Optional" },
  fr: { essential: "Essentiel", useful: "Utile", optional: "Facultatif" },
};
export const DEPENDENCY_PROGRESS: Record<Language, Record<DependencyProgress, string>> = {
  en: { "not-reviewed": "Not reviewed", asked: "Question asked", "response-recorded": "Reply noted", "follow-up": "Follow-up needed" },
  fr: { "not-reviewed": "Non examiné", asked: "Question posée", "response-recorded": "Réponse notée", "follow-up": "Suivi nécessaire" },
};
export const DEPENDENCY_FILTERS: Record<Language, Record<DependencyFilter, string>> = {
  en: { all: "All", essential: "Essential", UNKNOWN: "UNKNOWN", saved: "Saved information", "follow-up": "Follow-up" },
  fr: { all: "Tous", essential: "Essentiels", UNKNOWN: "UNKNOWN", saved: "Données enregistrées", "follow-up": "Suivi" },
};
export const DEPENDENCY_SORTS: Record<Language, Record<DependencySort, string>> = {
  en: { added: "Added order", priority: "Importance", name: "Name", availability: "UNKNOWN first" },
  fr: { added: "Ordre d’ajout", priority: "Importance", name: "Nom", availability: "UNKNOWN en premier" },
};
export const DEPENDENCY_AVAILABILITY: Record<Language, Record<DataAvailability, string>> = {
  en: { saved: "Saved information", UNKNOWN: "UNKNOWN" },
  fr: { saved: "Renseignements enregistrés", UNKNOWN: "UNKNOWN" },
};
export const DEPENDENCY_REASONS: Record<Language, Record<string, string>> = {
  en: { present: "Local copy recorded", "not-listed": "Not listed in this region", "inventory-unavailable": "Local inventory unavailable", "source-conflict": "Local record differs from listed source", "source-invalid": "Listed source metadata is invalid", missing: "Not downloaded", stale: "Out of date", unreadable: "Local copy could not be read", UNKNOWN: "UNKNOWN" },
  fr: { present: "Copie locale enregistrée", "not-listed": "Non répertorié dans cette région", "inventory-unavailable": "Inventaire local indisponible", "source-conflict": "Les métadonnées de la copie locale diffèrent", "source-invalid": "Les métadonnées de la source sont incorrectes", missing: "Non téléchargée", stale: "Périmée", unreadable: "Impossible de lire la copie locale", UNKNOWN: "UNKNOWN" },
};
export interface DependencyPrompt { readonly key: string; readonly category: DependencyCategory; readonly en: string; readonly fr: string; }
export const DEPENDENCY_PROMPTS: readonly DependencyPrompt[] = [
  { key: "arrival-location", category: "arrival", en: "Arrival location details", fr: "Emplacement de l’arrivée" },
  { key: "arrival-surface", category: "arrival", en: "Arrival surface details", fr: "Surface de la zone d’arrivée" },
  { key: "arrival-dropoff", category: "arrival", en: "Drop-off information", fr: "Renseignements sur la zone de débarquement" },
  { key: "arrival-construction", category: "arrival", en: "Construction and detours", fr: "Travaux et détours" },
  { key: "entrance-location", category: "entrance", en: "Entrance location information", fr: "Emplacement de l’entrée" },
  { key: "entrance-door", category: "entrance", en: "Door dimensions or operating instructions", fr: "Dimensions de la porte ou mode d’emploi" },
  { key: "entrance-steps", category: "entrance", en: "Entrance stairs or slope details", fr: "Marches ou pente à l’entrée" },
  { key: "entrance-alternative", category: "entrance", en: "Alternative entrance information", fr: "Renseignements sur une autre entrée" },
  { key: "indoor-lifts", category: "indoor", en: "Lift and elevator information", fr: "Renseignements sur les ascenseurs" },
  { key: "indoor-turn", category: "indoor", en: "Interior turning area information", fr: "Espace de manœuvre intérieur" },
  { key: "indoor-floor", category: "indoor", en: "Interior surface information", fr: "Revêtements des parcours intérieurs" },
  { key: "indoor-route", category: "indoor", en: "Interior route alternatives", fr: "Autres parcours intérieurs" },
  { key: "washroom-location", category: "washroom", en: "Washroom location information", fr: "Emplacement des toilettes" },
  { key: "washroom-door", category: "washroom", en: "Washroom doorway information", fr: "Renseignements sur la porte des toilettes" },
  { key: "washroom-layout", category: "washroom", en: "Washroom layout information", fr: "Aménagement des toilettes" },
  { key: "washroom-service", category: "washroom", en: "Washroom availability changes", fr: "Changements de disponibilité des toilettes" },
  { key: "transit-stop", category: "transit", en: "Transit stop information", fr: "Renseignements sur l’arrêt de transport" },
  { key: "transit-platform", category: "transit", en: "Platform or boarding details", fr: "Quai ou modalités d’embarquement" },
  { key: "transit-transfer", category: "transit", en: "Transfer point information", fr: "Renseignements sur la correspondance" },
  { key: "transit-alternative", category: "transit", en: "Transit alternative information", fr: "Autres options de transport" },
  { key: "communication-contact", category: "communication", en: "Contact details", fr: "Coordonnées" },
  { key: "communication-format", category: "communication", en: "Available information formats", fr: "Formats de renseignements disponibles" },
  { key: "communication-hours", category: "communication", en: "Service information hours", fr: "Heures de renseignements du service" },
  { key: "communication-changes", category: "communication", en: "Service change notices", fr: "Avis de changement de service" },
];
export function dependencyCopy(language: Language): DependencyCopy { return DEPENDENCY_COPY[language]; }
export function dependencyReason(code: string, language: Language): string {
  return DEPENDENCY_REASONS[language][code] ?? "UNKNOWN";
}
export function auditDependencyCopy(): readonly string[] {
  const errors: string[] = [];
  const english = DEPENDENCY_COPY.en;
  const french = DEPENDENCY_COPY.fr;
  for (const key of Object.keys(english) as Array<keyof DependencyCopy>) {
    if (!english[key].trim() || !french[key].trim()) errors.push(key);
  }
  for (const text of Object.values(french)) {
    if (text.includes("'")) errors.push("straight apostrophe");
    if (/(?<!\u00a0):/u.test(text)) errors.push("colon spacing");
    if (/(?<!\u202f)[;!?]/u.test(text)) errors.push("punctuation spacing");
  }
  for (const prompt of DEPENDENCY_PROMPTS) if (!prompt.en.trim() || !prompt.fr.trim()) errors.push(prompt.key);
  return errors;
}
