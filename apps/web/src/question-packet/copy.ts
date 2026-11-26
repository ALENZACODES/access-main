import type { Answer, Locale, ReviewState, SourceTier, Topic } from './model.ts';
export interface Labels {
  title: string; intro: string; safety: string; local: string; packet: string; journeyName: string; stop: string; addStop: string;
  edit: string; save: string; remove: string; up: string; down: string; cancel: string; addQuestion: string; question: string;
  promptEn: string; promptFr: string; answer: string; detailsEn: string; detailsFr: string; source: string;
  sourceUrl: string; licence: string; date: string; tier: string; review: string; topic: string;
  empty: string; noQuestions: string; required: string; exportJson: string; exportCsv: string; exportText: string;
  importJson: string; invalidImport: string; imported: string; report: string; unknown: string; answered: string;
  toContact: string; toRecheck: string; sourced: string; provenance: string; questions: string; gaps: string;
  cannotInfer: string; importHelp: string; sourceHelp: string; clear: string; confirmClear: string; confirmClearYes: string; confirmClearNo: string;
}
export const LABELS: Record<Locale, Labels> = {
  en: {
    title:'Accessibility questions packet',intro:'Prepare questions for a journey, record what was reported, and carry the evidence source with each answer.',
    safety:'UNKNOWN indicates that information is missing. A recorded answer does not establish accessibility or safety.',
    local:'This draft stays in this browser session until you export it. It is not sent to any service.',
    packet:'Journey packet', journeyName:'Journey name',stop:'Stop',addStop:'Add stop',edit:'Edit',save:'Save',remove:'Remove',
    up:'Move up',down:'Move down',cancel:'Cancel',addQuestion:'Add question',question:'Question',promptEn:'Question in English',
    promptFr:'Question in French',answer:'Answer received',detailsEn:'Answer details in English',detailsFr:'Answer details in French',
    source:'Source name',sourceUrl:'Source URL (HTTPS)',licence:'Source licence',date:'Source date',tier:'Source type',review:'Follow-up',
    topic:'Topic',empty:'Add a stop to begin your local packet.',noQuestions:'No questions for this stop.',required:'Complete both language fields and use valid source details when supplied.',
    exportJson:'Export JSON',exportCsv:'Export CSV',exportText:'Export plain text',importJson:'Import JSON',invalidImport:'Import rejected. Fix invalid fields; existing content is unchanged.',
    imported:'Packet loaded locally.',report:'Review summary',unknown:'UNKNOWN',answered:'Answered',toContact:'Contact needed',toRecheck:'Recheck needed',
    sourced:'Sources recorded',provenance:'Evidence source',questions:'Questions',gaps:'Outstanding questions',
    cannotInfer:'Do not assume a missing answer means the feature is available or unavailable.',
    importHelp:'Only local JSON packets with valid fields are accepted; importing replaces this draft.',
    sourceHelp:'If the source is not known, leave UNKNOWN rather than inventing a date, licence or URL.',clear:'Start over',confirmClear:'Clear the entire local draft?',confirmClearYes:'Clear the draft',confirmClearNo:'Keep the draft',
  },
  fr: {
    title:'Fiche de questions sur l’accessibilité',intro:'Préparez les questions d’un parcours, consignez les réponses reçues et conservez la source de chaque réponse.',
    safety:'UNKNOWN indique qu’une information manque. Une réponse consignée ne prouve ni l’accessibilité ni la sécurité.',
    local:'Cette ébauche reste dans cette session du navigateur jusqu’à son exportation. Aucune donnée n’est envoyée à un service.',
    packet:'Fiche de parcours',journeyName:'Nom du parcours',stop:'Étape',addStop:'Ajouter une étape',edit:'Modifier',save:'Enregistrer',remove:'Supprimer',
    up:'Monter',down:'Descendre',cancel:'Annuler',addQuestion:'Ajouter une question',question:'Question',promptEn:'Question en anglais',
    promptFr:'Question en français',answer:'Réponse reçue',detailsEn:'Détails en anglais',detailsFr:'Détails en français',
    source:'Nom de la source',sourceUrl:'Adresse HTTPS de la source',licence:'Licence de la source',date:'Date de la source',tier:'Type de source',review:'Suivi',
    topic:'Sujet',empty:'Ajoutez une étape pour commencer cette fiche locale.',noQuestions:'Aucune question pour cette étape.',
    required:'Remplissez les champs dans les deux langues et indiquez des données de source valides lorsqu’elles sont connues.',
    exportJson:'Exporter JSON',exportCsv:'Exporter CSV',exportText:'Exporter le texte',importJson:'Importer JSON',invalidImport:'Importation refusée. Corrigez les champs non valides. Le contenu actuel est conservé.',
    imported:'Fiche chargée localement.',report:'Résumé du suivi',unknown:'UNKNOWN',answered:'Réponses reçues',toContact:'Prise de contact nécessaire',toRecheck:'Nouveau contrôle nécessaire',
    sourced:'Sources consignées',provenance:'Source des éléments',questions:'Questions',gaps:'Questions en suspens',
    cannotInfer:'Une réponse manquante ne signifie pas que l’aménagement est disponible ou indisponible.',
    importHelp:'Seules les fiches JSON locales valides sont acceptées. L’importation remplace l’ébauche.',
    sourceHelp:'Si la source est inconnue, conservez UNKNOWN au lieu d’inventer une date, une licence ou une adresse.',
    clear:'Recommencer',confirmClear:'Effacer toute l’ébauche locale ?',confirmClearYes:'Effacer l’ébauche',confirmClearNo:'Garder l’ébauche',
  },
};
export const TOPIC_LABELS: Record<Locale,Record<Topic,string>> = {
 en:{arrival:'Arrival',entrance:'Entrance',circulation:'Movement inside',lift:'Lift',washroom:'Washroom',service:'Service',departure:'Departure',custom:'Other'},
 fr:{arrival:'Arrivée',entrance:'Entrée',circulation:'Déplacements intérieurs',lift:'Ascenseur',washroom:'Toilettes',service:'Service',departure:'Départ',custom:'Autre'},
};
export const ANSWER_LABELS: Record<Locale,Record<Answer,string>> = {
 en:{UNKNOWN:'UNKNOWN',YES_REPORTED:'Reported yes',NO_REPORTED:'Reported no',PARTIAL_REPORTED:'Reported partial',NOT_APPLICABLE:'Not applicable (reported)'},
 fr:{UNKNOWN:'UNKNOWN',YES_REPORTED:'Oui, selon la source',NO_REPORTED:'Non, selon la source',PARTIAL_REPORTED:'Partiel, selon la source',NOT_APPLICABLE:'Sans objet, selon la source'},
};
export const REVIEW_LABELS: Record<Locale,Record<ReviewState,string>> = {
 en:{UNKNOWN:'UNKNOWN',NEEDS_CONTACT:'Ask the location',NEEDS_RECHECK:'Recheck evidence',RECORDED:'Recorded for handoff'},
 fr:{UNKNOWN:'UNKNOWN',NEEDS_CONTACT:'Contacter le lieu',NEEDS_RECHECK:'Contrôler de nouveau les éléments',RECORDED:'Consigné pour la transmission'},
};
export const TIER_LABELS: Record<Locale,Record<SourceTier,string>> = {
 en:{UNKNOWN:'UNKNOWN',FIRST_HAND:'First-hand observation',OFFICIAL:'Published by place operator',COMMUNITY:'Community contribution',OTHER:'Other named source'},
 fr:{UNKNOWN:'UNKNOWN',FIRST_HAND:'Observation directe',OFFICIAL:'Publié par l’exploitant du lieu',COMMUNITY:'Contribution communautaire',OTHER:'Autre source identifiée'},
};
export function labels(locale: Locale): Labels { return LABELS[locale]; }
export function topicLabel(locale: Locale, topic: Topic): string { return TOPIC_LABELS[locale][topic]; }
export function answerLabel(locale: Locale, answer: Answer): string { return ANSWER_LABELS[locale][answer]; }
export function reviewLabel(locale: Locale, review: ReviewState): string { return REVIEW_LABELS[locale][review]; }
export function tierLabel(locale: Locale, tier: SourceTier): string { return TIER_LABELS[locale][tier]; }