import type { Language } from "./regionDownload";
import type { SheetCategory, SheetPriority } from "./offlineQuestionSheet";
/** Questions are suggestions only. No answer or status is attributed to a place. */
export interface QuestionTemplate {
  readonly id: string;
  readonly category: SheetCategory;
  readonly priority: SheetPriority;
  readonly en: string;
  readonly fr: string;
}
export const OFFLINE_QUESTION_TEMPLATES: readonly QuestionTemplate[] = [
  { id: "arrival-a", category: "arrival", priority: "essential", en: "Where is the safest place to arrive?", fr: "Quel est le lieu d’arrivée le plus approprié\u202f?" },
  { id: "arrival-b", category: "arrival", priority: "helpful", en: "Where can a vehicle stop briefly for drop-off?", fr: "Où un véhicule peut-il s’arrêter brièvement pour déposer quelqu’un\u202f?" },
  { id: "arrival-c", category: "arrival", priority: "helpful", en: "Is there a contact point to ask for arrival instructions?", fr: "Y a-t-il un contact pour demander les consignes d’arrivée\u202f?" },
  { id: "entrance-a", category: "entrance", priority: "essential", en: "Which entrance should I ask about for step-free access?", fr: "À quelle entrée dois-je me renseigner au sujet d’un accès sans marches\u202f?" },
  { id: "entrance-b", category: "entrance", priority: "essential", en: "Who can confirm whether the entrance is currently usable?", fr: "Qui peut confirmer que l’entrée est actuellement utilisable\u202f?" },
  { id: "entrance-c", category: "entrance", priority: "helpful", en: "What alternative entrance should I ask about?", fr: "Au sujet de quelle autre entrée devrais-je me renseigner\u202f?" },
  { id: "route-a", category: "route", priority: "essential", en: "Is there an indoor route I can discuss in advance?", fr: "Y a-t-il un parcours intérieur dont je peux discuter à l’avance\u202f?" },
  { id: "route-b", category: "route", priority: "essential", en: "Who can explain any lift, ramp, or door restrictions?", fr: "Qui peut expliquer les restrictions liées aux ascenseurs, rampes ou portes\u202f?" },
  { id: "route-c", category: "route", priority: "helpful", en: "What should I do if the planned route is unavailable?", fr: "Que dois-je faire si le parcours prévu est indisponible\u202f?" },
  { id: "washroom-a", category: "washroom", priority: "essential", en: "Who can describe the washroom layout?", fr: "Qui peut décrire l’aménagement des toilettes\u202f?" },
  { id: "washroom-b", category: "washroom", priority: "essential", en: "How can I ask about current washroom availability?", fr: "Comment puis-je demander si les toilettes sont actuellement disponibles\u202f?" },
  { id: "washroom-c", category: "washroom", priority: "helpful", en: "Is there an alternative washroom I could ask about?", fr: "Y a-t-il d’autres toilettes au sujet desquelles je pourrais me renseigner\u202f?" },
  { id: "rest-a", category: "rest", priority: "helpful", en: "Where might there be seating or places to rest?", fr: "Où pourrait-il y avoir des sièges ou des lieux de repos\u202f?" },
  { id: "rest-b", category: "rest", priority: "helpful", en: "Can I ask about quieter waiting areas?", fr: "Puis-je demander s’il y a des espaces d’attente plus calmes\u202f?" },
  { id: "rest-c", category: "rest", priority: "optional", en: "Who can explain the expected waiting process?", fr: "Qui peut expliquer le déroulement de l’attente\u202f?" },
  { id: "communication-a", category: "communication", priority: "essential", en: "What communication options can I ask for in advance?", fr: "Quelles options de communication puis-je demander à l’avance\u202f?" },
  { id: "communication-b", category: "communication", priority: "helpful", en: "Is there a number to call if plans change?", fr: "Y a-t-il un numéro à appeler si les plans changent\u202f?" },
  { id: "communication-c", category: "communication", priority: "helpful", en: "Could instructions be shared in writing?", fr: "Les consignes pourraient-elles être communiquées par écrit\u202f?" },
  { id: "departure-a", category: "departure", priority: "essential", en: "Where should I arrange pickup after the visit?", fr: "Où devrais-je organiser la prise en charge après la visite\u202f?" },
  { id: "departure-b", category: "departure", priority: "helpful", en: "Who can explain departure routes and alternatives?", fr: "Qui peut expliquer les parcours de sortie et les solutions de rechange\u202f?" },
  { id: "departure-c", category: "departure", priority: "optional", en: "How could I confirm last-minute changes before leaving?", fr: "Comment pourrais-je confirmer les changements de dernière minute avant le départ\u202f?" },
  { id: "other-a", category: "other", priority: "essential", en: "Who is the best contact for unanswered questions?", fr: "Quel est le meilleur contact pour les questions sans réponse\u202f?" },
  { id: "other-b", category: "other", priority: "helpful", en: "Which information should I reconfirm on the day of the visit?", fr: "Quelles informations devrais-je reconfirmer le jour de la visite\u202f?" },
  { id: "other-c", category: "other", priority: "optional", en: "Is there written information I can review before going?", fr: "Y a-t-il des informations écrites que je peux consulter avant de partir\u202f?" },
] as const;
export function questionTemplate(id: string, language: Language): { readonly text: string; readonly category: SheetCategory; readonly priority: SheetPriority } | null {
  const entry = OFFLINE_QUESTION_TEMPLATES.find((item) => item.id === id);
  return entry ? { text: entry[language], category: entry.category, priority: entry.priority } : null;
}
export function templateCategories(): readonly SheetCategory[] {
  return [...new Set(OFFLINE_QUESTION_TEMPLATES.map((item) => item.category))];
}
