import { blankQuestion, type Question, type Topic, type TwoLanguages } from './model.ts';
export interface PromptTemplate { readonly id: string; readonly topic: Topic; readonly prompt: TwoLanguages; readonly detail: TwoLanguages }
/** Generic prompts are questions, never assertions about any real building or service. */
export const QUESTION_TEMPLATES: readonly PromptTemplate[] = [
 {id:'arrival-route',topic:'arrival',prompt:{en:'What is the route from arrival to the entrance?',fr:'Quel est le trajet entre le point d’arrivée et l’entrée ?'},detail:{en:'Ask about the route and any obstacles.',fr:'Demander le trajet et les éventuels obstacles.'}},
 {id:'arrival-dropoff',topic:'arrival',prompt:{en:'Where is a suitable drop-off point?',fr:'Où se trouve une zone de débarquement appropriée ?'},detail:{en:'Do not assume a designated area exists.',fr:'Ne pas présumer qu’une zone désignée existe.'}},
 {id:'arrival-parking',topic:'arrival',prompt:{en:'What parking options are documented?',fr:'Quelles options de stationnement sont documentées ?'},detail:{en:'Ask for a current source and date.',fr:'Demander une source et une date récentes.'}},
 {id:'entrance-steps',topic:'entrance',prompt:{en:'Are steps present at the entrance?',fr:'Y a-t-il des marches à l’entrée ?'},detail:{en:'Ask about every entrance intended for use.',fr:'Demander des précisions sur chaque entrée envisagée.'}},
 {id:'entrance-door',topic:'entrance',prompt:{en:'How does the entrance door open?',fr:'Comment la porte d’entrée s’ouvre-t-elle ?'},detail:{en:'Ask whether assistance is needed.',fr:'Demander si une aide est nécessaire.'}},
 {id:'entrance-width',topic:'entrance',prompt:{en:'Is a doorway width measurement available?',fr:'Une mesure de la largeur de la porte est-elle disponible ?'},detail:{en:'Record the source rather than guessing a measurement.',fr:'Noter la source au lieu de deviner une mesure.'}},
 {id:'circulation-surface',topic:'circulation',prompt:{en:'What surfaces are on the intended route?',fr:'Quels revêtements se trouvent sur le trajet prévu ?'},detail:{en:'Record unknown sections explicitly.',fr:'Indiquer clairement les sections inconnues.'}},
 {id:'circulation-turn',topic:'circulation',prompt:{en:'Are turning spaces documented?',fr:'Les espaces de manœuvre sont-ils documentés ?'},detail:{en:'Ask for dimensions if the source provides them.',fr:'Demander les dimensions si la source les fournit.'}},
 {id:'circulation-obstacles',topic:'circulation',prompt:{en:'Are temporary obstacles expected?',fr:'Des obstacles temporaires sont-ils prévus ?'},detail:{en:'Recheck close to the visit.',fr:'Effectuer un nouveau contrôle peu avant la visite.'}},
 {id:'lift-operation',topic:'lift',prompt:{en:'Is the lift currently operating?',fr:'L’ascenseur fonctionne-t-il actuellement ?'},detail:{en:'A previous report cannot establish current operation.',fr:'Un ancien signalement ne démontre pas le fonctionnement actuel.'}},
 {id:'lift-levels',topic:'lift',prompt:{en:'Which levels does the lift serve?',fr:'Quels étages sont desservis par l’ascenseur ?'},detail:{en:'Ask for the actual level connections.',fr:'Demander les liaisons réelles entre les étages.'}},
 {id:'lift-controls',topic:'lift',prompt:{en:'How can a visitor operate the lift controls?',fr:'Comment une personne peut-elle utiliser les commandes de l’ascenseur ?'},detail:{en:'Record any alternative instructions with source.',fr:'Consigner toute autre instruction avec sa source.'}},
 {id:'washroom-location',topic:'washroom',prompt:{en:'Where is the washroom located?',fr:'Où se trouvent les toilettes ?'},detail:{en:'Ask about the route from the intended service.',fr:'Demander le trajet depuis le service prévu.'}},
 {id:'washroom-layout',topic:'washroom',prompt:{en:'What is documented about the washroom layout?',fr:'Quelles données décrivent l’aménagement des toilettes ?'},detail:{en:'Do not infer dimensions or features.',fr:'Ne pas déduire des dimensions ou des aménagements.'}},
 {id:'washroom-status',topic:'washroom',prompt:{en:'Is the intended washroom available for the visit?',fr:'Les toilettes prévues seront-elles disponibles pendant la visite ?'},detail:{en:'Ask about closures and temporary changes.',fr:'Demander les fermetures et les changements temporaires.'}},
 {id:'service-queue',topic:'service',prompt:{en:'How does queuing or check-in work?',fr:'Comment fonctionnent la file d’attente et l’accueil ?'},detail:{en:'Ask about the actual process.',fr:'Demander le fonctionnement réel.'}},
 {id:'service-communication',topic:'service',prompt:{en:'Which communication options are offered?',fr:'Quelles options de communication sont proposées ?'},detail:{en:'Record available information without assuming assistance.',fr:'Noter les renseignements disponibles sans présumer d’une aide.'}},
 {id:'service-breaks',topic:'service',prompt:{en:'What options exist for taking a break?',fr:'Quelles possibilités de pause existent ?'},detail:{en:'Ask about seating and quiet spaces if relevant.',fr:'Demander les places assises et les espaces calmes au besoin.'}},
 {id:'departure-exit',topic:'departure',prompt:{en:'Is the departure route the same as the arrival route?',fr:'Le trajet de départ est-il le même que celui de l’arrivée ?'},detail:{en:'A different exit may have different unknowns.',fr:'Une autre sortie peut présenter des éléments inconnus différents.'}},
 {id:'departure-transfer',topic:'departure',prompt:{en:'What is known about the onward transfer?',fr:'Que sait-on du transfert vers la prochaine étape ?'},detail:{en:'Avoid assuming a vehicle or route is available.',fr:'Ne pas présumer de la disponibilité d’un véhicule ou d’un trajet.'}},
 {id:'custom-contact',topic:'custom',prompt:{en:'Who can answer an unresolved accessibility question?',fr:'Qui peut répondre à une question d’accessibilité non résolue ?'},detail:{en:'Record a publicly supplied contact, if any.',fr:'Noter une personne-ressource publique, le cas échéant.'}},
] as const;
export function templateById(id:string): PromptTemplate | undefined {return QUESTION_TEMPLATES.find(item=>item.id===id);}
export function questionsForTopic(topic:Topic): readonly PromptTemplate[] {return QUESTION_TEMPLATES.filter(item=>item.topic===topic);}
export function templateQuestion(id:string,questionId:string,order=0):Question|null {
 const template=templateById(id);
 if(!template)return null;
 return {...blankQuestion(questionId,order),topic:template.topic,prompt:{...template.prompt},details:{...template.detail}};
}
export function templateCatalogueCounts():Record<Topic,number> {
 const out:Record<Topic,number>={arrival:0,entrance:0,circulation:0,lift:0,washroom:0,service:0,departure:0,custom:0};
 for(const template of QUESTION_TEMPLATES)out[template.topic]+=1;
 return out;
}
