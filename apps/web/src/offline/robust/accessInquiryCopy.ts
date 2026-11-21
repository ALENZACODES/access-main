import type { Language } from "./regionDownload";
import type { InquiryChannel, InquiryFilter, InquiryImportance, InquiryProgress,
  InquirySort, InquiryTopic } from "./accessInquiry";

export const INQUIRY_COPY = {
  en: {
    title: "Access inquiry planner",
    intro: "Prepare questions to ask a venue or service before a visit. No answers are assumed.",
    open: "Open inquiry planner", close: "Close inquiry planner",
    private: "Notes stay in this page until you export them. An exported file may contain personal information.",
    condition: "Physical conditions: UNKNOWN", place: "Place or service", area: "Area or community",
    date: "Planned date (optional)", addPlace: "Add place", selectPlace: "Choose a place",
    addTemplates: "Add suggested questions", question: "Question to ask", topic: "Topic",
    importance: "Importance", addQuestion: "Add question", progress: "Question progress",
    changeProgress: "Update question progress", channel: "Contact method", note: "What was said or observed?",
    addNote: "Record note", sourceDate: "Date of source (optional)",
    filter: "Filter questions", sort: "Order questions", search: "Search questions",
    previous: "Previous page", next: "Next page", page: "Question pages",
    exportJson: "Export JSON", exportText: "Export plain text", importJson: "Import JSON",
    noPlaces: "Add a place before creating questions.", noQuestions: "No questions match this view.",
    unknown: "UNKNOWN", missing: "Information not provided", saved: "Recorded in page memory",
    imported: "Historical notes imported. Conditions remain UNKNOWN.", invalid: "The file could not be read safely.",
    invalidAction: "Review the input and try again.",
    active: "Questions", totalPlaces: "Places", outstanding: "Questions still needing a reply",
    replies: "Questions with a recorded reply", essential: "Essential questions without a recorded reply",
    lastNote: "Most recent note", source: "Source date", unknownSource: "UNKNOWN",
    reason: "The plan records questions and notes, not evidence that a place will meet an individual's needs.",
    noSelection: "Choose a question first.", selectQuestion: "Choose a question", saveChanges: "Save question change",
    noFile: "No file selected", error: "This action was not completed.",
    start: "Start with suggested questions", templateHelp: "Suggested questions do not establish conditions at any place.",
    required: "Name and area are required.", summary: "Current inquiry summary",
    hint: "Follow up with the provider directly and check information again when needed.",
  },
  fr: {
    title: "Planificateur de questions d’accessibilité",
    intro: "Préparez des questions à poser avant une visite. Aucune réponse n’est présumée.",
    open: "Ouvrir le planificateur", close: "Fermer le planificateur",
    private: "Les notes restent dans cette page jusqu’à leur exportation. Un fichier exporté peut contenir des renseignements personnels.",
    condition: "Conditions physiques\u00a0: UNKNOWN", place: "Lieu ou service", area: "Secteur ou collectivité",
    date: "Date prévue (facultative)", addPlace: "Ajouter un lieu", selectPlace: "Choisir un lieu",
    addTemplates: "Ajouter des questions suggérées", question: "Question à poser", topic: "Sujet",
    importance: "Importance", addQuestion: "Ajouter une question", progress: "Avancement de la question",
    changeProgress: "Modifier l’avancement", channel: "Moyen de communication", note: "Qu’a-t-on dit ou observé\u202f?",
    addNote: "Consigner une note", sourceDate: "Date de la source (facultative)",
    filter: "Filtrer les questions", sort: "Trier les questions", search: "Chercher des questions",
    previous: "Page précédente", next: "Page suivante", page: "Pages de questions",
    exportJson: "Exporter JSON", exportText: "Exporter le texte", importJson: "Importer JSON",
    noPlaces: "Ajoutez un lieu avant de créer des questions.", noQuestions: "Aucune question dans cette vue.",
    unknown: "UNKNOWN", missing: "Renseignement non fourni", saved: "Consigné dans la mémoire de la page",
    imported: "Notes historiques importées. Les conditions restent UNKNOWN.", invalid: "Impossible de lire ce fichier en toute sécurité.",
    invalidAction: "Examinez les données et réessayez.",
    active: "Questions", totalPlaces: "Lieux", outstanding: "Questions sans réponse consignée",
    replies: "Questions avec réponse consignée", essential: "Questions essentielles sans réponse consignée",
    lastNote: "Dernière note", source: "Date de la source", unknownSource: "UNKNOWN",
    reason: "Le plan consigne des questions et des notes, mais ne détermine pas les conditions d’un lieu pour une personne.",
    noSelection: "Choisissez d’abord une question.", selectQuestion: "Choisir une question", saveChanges: "Enregistrer le changement",
    noFile: "Aucun fichier sélectionné", error: "Cette action n’a pas abouti.",
    start: "Commencer avec les questions suggérées", templateHelp: "Les questions suggérées ne déterminent pas les conditions d’un lieu.",
    required: "Le nom et le secteur sont obligatoires.", summary: "Résumé des questions",
    hint: "Communiquez directement avec le fournisseur et consultez de nouveau les renseignements au besoin.",
  },
} as const;
export function inquiryCopy(language: Language) { return INQUIRY_COPY[language]; }
export const INQUIRY_PROGRESS_LABELS: Readonly<Record<Language, Record<InquiryProgress, string>>> = {
  en: { "to-ask": "To ask", asked: "Asked", "reply-noted": "Reply noted", "follow-up": "Follow up" },
  fr: { "to-ask": "À demander", asked: "Question posée", "reply-noted": "Réponse consignée", "follow-up": "À suivre" },
};
export const INQUIRY_IMPORTANCE_LABELS: Readonly<Record<Language, Record<InquiryImportance, string>>> = {
  en: { standard: "Standard", important: "Important", essential: "Essential" },
  fr: { standard: "Courante", important: "Importante", essential: "Essentielle" },
};
export const INQUIRY_TOPIC_LABELS: Readonly<Record<Language, Record<InquiryTopic, string>>> = {
  en: {
    entrance: "Entrance", "interior-route": "Indoor route", washroom: "Washroom", parking: "Parking",
    transit: "Transit", pickup: "Pickup", seating: "Seating", communication: "Communication",
    service: "Service", backup: "Alternate plan",
  },
  fr: {
    entrance: "Entrée", "interior-route": "Parcours intérieur", washroom: "Toilettes", parking: "Stationnement",
    transit: "Transport collectif", pickup: "Point de rencontre", seating: "Places assises", communication: "Communication",
    service: "Service", backup: "Autre solution",
  },
};
export const INQUIRY_CHANNEL_LABELS: Readonly<Record<Language, Record<InquiryChannel, string>>> = {
  en: { phone: "Telephone", email: "Email", "in-person": "In person", web: "Website", other: "Other" },
  fr: { phone: "Téléphone", email: "Courriel", "in-person": "En personne", web: "Site Web", other: "Autre" },
};
export const INQUIRY_FILTER_LABELS: Readonly<Record<Language, Record<InquiryFilter, string>>> = {
  en: { all: "All questions", outstanding: "Outstanding", "reply-noted": "Reply noted", essential: "Essential" },
  fr: { all: "Toutes les questions", outstanding: "Sans réponse consignée", "reply-noted": "Réponse consignée", essential: "Essentielles" },
};
export const INQUIRY_SORT_LABELS: Readonly<Record<Language, Record<InquirySort, string>>> = {
  en: { listed: "Added order", topic: "Topic", priority: "Importance", recent: "Recent change" },
  fr: { listed: "Ordre d’ajout", topic: "Sujet", priority: "Importance", recent: "Modification récente" },
};
export const INQUIRY_TEMPLATE_HINTS: Readonly<Record<Language, Record<InquiryTopic, string>>> = {
  en: {
    entrance: "Ask about entry route and doors", "interior-route": "Ask about internal navigation",
    washroom: "Ask about washroom access", parking: "Ask about parking and arrival",
    transit: "Ask about nearby transit", pickup: "Ask about a pickup point",
    seating: "Ask about space and seating", communication: "Ask how to contact staff",
    service: "Ask about service changes", backup: "Ask about alternatives",
  },
  fr: {
    entrance: "Questions sur l’entrée et les portes", "interior-route": "Questions sur le parcours intérieur",
    washroom: "Questions sur l’accès aux toilettes", parking: "Questions sur le stationnement",
    transit: "Questions sur le transport collectif", pickup: "Questions sur le point de rencontre",
    seating: "Questions sur les places assises", communication: "Questions pour joindre le personnel",
    service: "Questions sur les changements de service", backup: "Questions sur les autres solutions",
  },
};
export function auditInquiryCopy(): readonly string[] {
  const findings: string[] = [];
  const en = INQUIRY_COPY.en;
  const fr = INQUIRY_COPY.fr;
  if (Object.keys(en).join("|") !== Object.keys(fr).join("|")) findings.push("key mismatch");
  for (const [key, value] of Object.entries(en)) if (!value.trim()) findings.push(`en ${key}`);
  for (const [key, value] of Object.entries(fr)) {
    if (!value.trim()) findings.push(`fr ${key}`);
    if (value.includes("'")) findings.push(`straight apostrophe ${key}`);
    if (/(?<!\u00a0):/u.test(value)) findings.push(`colon spacing ${key}`);
    if (/(?<!\u202f)[;!?]/u.test(value)) findings.push(`punctuation spacing ${key}`);
  }
  for (const language of [en, fr]) {
    for (const text of Object.values(language)) {
      if (/\b(?:real-time|partnership|guarantee|verified|verify|vérifi(?:é|er))\b/iu.test(text)) findings.push("claim");
    }
  }
  return findings;
}

/** French wording for the complete optional question catalogue. */
export const INQUIRY_TEMPLATE_FR: Readonly<Record<string, string>> = {
  "entrance-step-free": "Quelle entrée peut-on atteindre sans marche\u202f?",
  "entrance-door": "Y a-t-il des seuils ou des portes lourdes à prévoir\u202f?",
  "entrance-width": "La largeur libre de la porte est-elle connue\u202f?",
  "entrance-temporary": "Certaines entrées sont-elles temporairement fermées\u202f?",
  "route-lift": "Quel parcours évite les escaliers jusqu’à la destination\u202f?",
  "route-elevator": "Un ascenseur est-il nécessaire et quel autre parcours existe\u202f?",
  "route-surface": "Y a-t-il des virages serrés, des pentes ou des obstacles temporaires\u202f?",
  "route-rest": "Où se trouvent les endroits pour se reposer sur le parcours\u202f?",
  "washroom-location": "Où sont les toilettes accessibles sans marche\u202f?",
  "washroom-door": "Quelles sont les dimensions libres de l’entrée et de l’intérieur\u202f?",
  "washroom-hours": "Les toilettes restent-elles accessibles pendant la visite prévue\u202f?",
  "washroom-alternative": "Quelle autre solution existe si les toilettes prévues ferment\u202f?",
  "parking-location": "Où est le stationnement accessible désigné le plus proche\u202f?",
  "parking-path": "Existe-t-il un parcours sans marche entre le stationnement et l’entrée\u202f?",
  "parking-dropoff": "Y a-t-il un endroit sûr pour déposer une personne en voiture\u202f?",
  "transit-stop": "Quels arrêts ou stations de transport collectif ont des parcours adaptés\u202f?",
  "transit-disruption": "Où consulter les changements de service le jour même\u202f?",
  "transit-transfer": "Faut-il faire une correspondance et quelle autre option existe\u202f?",
  "pickup-spot": "Où un conducteur peut-il rencontrer une personne après la visite\u202f?",
  "pickup-contact": "Comment signaler un retard ou un changement de point de rencontre\u202f?",
  "seating-space": "Quels espaces peuvent accueillir différents appareils de mobilité\u202f?",
  "seating-route": "Peut-on atteindre les places assises sans marche\u202f?",
  "seating-companion": "Les personnes accompagnantes peuvent-elles rester ensemble\u202f?",
  "communication-method": "Quel moyen de communication convient pour les questions préalables\u202f?",
  "communication-format": "Peut-on obtenir les indications importantes par écrit\u202f?",
  "communication-person": "Qui joindre si le parcours prévu change\u202f?",
  "service-hours": "Quels horaires s’appliquent au service ou à l’entrée concernée\u202f?",
  "service-booking": "Un avis préalable est-il demandé pour le service concerné\u202f?",
  "service-change": "Où sont publiés les changements de service du jour même\u202f?",
  "backup-arrival": "Quelle autre entrée utiliser si le parcours principal est bloqué\u202f?",
  "backup-contact": "Qui pourrait préciser un changement de situation pendant la visite\u202f?",
  "backup-return": "Quelles options existent si le retour prévu ne peut pas être utilisé\u202f?",
};
