/**
 * Questions to ask a place before going, worked out from what the saved pack does and does not say.
 *
 * Every question points at a gap or a claim in the pack: a wheelchair tag that is UNKNOWN, a tag
 * that says Limited, a missing address, a source that is more than a year old. The questions are
 * for the person to put to the place. The App does not answer them, does not predict the answers
 * and does not rank places. Questions are worded the same way for every place in a given state,
 * and name nobody and no organisation.
 */
import { ageLabel, formatDate, isStale } from "./provenance";
import { message, type MessageId } from "./messages";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

/** Every kind of question, in the order they are asked. */
export const QUESTION_TOPICS = [
  "entrance",
  "inside",
  "limited-meaning",
  "other-entrance",
  "scope",
  "name",
  "address",
  "find",
  "recent",
  "source",
  "note",
  "contact",
] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

export interface VisitQuestion {
  /** Stable within a place: the place id and the topic. */
  readonly key: string;
  readonly topic: QuestionTopic;
  /** The question to put to the place. */
  readonly text: string;
  /** What the pack says that makes this worth asking. One short sentence. */
  readonly basis: string;
}

export interface PlaceQuestions {
  readonly id: string;
  readonly name: string | null;
  readonly questions: readonly VisitQuestion[];
}

export interface VisitPlan {
  readonly places: readonly PlaceQuestions[];
  /** Listed places the pack no longer holds: nothing is known about them, so no questions are made. */
  readonly missing: number;
  /** All questions over all places. */
  readonly total: number;
}

/** The longest stretch of a pack note quoted in a question. */
export const MAX_NOTE_QUOTE = 120;

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

function tagLabel(tag: PackPlaceRecord["tag"], locale: Locale): string {
  return tag === "unknown" ? "UNKNOWN" : message(`pack.tag.${tag}` as MessageId, locale);
}

/** What the pack says about the tag, in one sentence, for the "why" line. */
export function tagBasis(place: PackPlaceRecord, locale: Locale): string {
  if (place.tag === "unknown") {
    switch (place.tagUnknownReason) {
      case "unrecognised-value":
        return t(locale, "The pack holds a wheelchair value this App does not recognise, so the tag is UNKNOWN.", "Le pack contient une valeur pour fauteuil roulant que l’appli ne reconnaît pas\u00a0: l’indication est UNKNOWN.");
      case "missing-provenance":
        return t(locale, "The pack gives a wheelchair tag but no source for it, so the tag is UNKNOWN.", "Le pack donne une indication pour fauteuil roulant sans source\u00a0: elle est donc UNKNOWN.");
      default:
        return t(locale, "The pack records no wheelchair tag for this place: UNKNOWN.", "Le pack n’enregistre aucune indication pour fauteuil roulant pour ce lieu\u00a0: UNKNOWN.");
    }
  }
  const label = tagLabel(place.tag, locale);
  return t(locale, `The pack reports the wheelchair tag ${label}.`, `Le pack indique «\u202f${label}\u202f» pour fauteuil roulant.`);
}

type Draft = { readonly topic: QuestionTopic; readonly text: string; readonly basis: string };

function tagQuestions(place: PackPlaceRecord, locale: Locale): Draft[] {
  const basis = tagBasis(place, locale);
  const label = tagLabel(place.tag, locale);
  switch (place.tag) {
    case "unknown":
      return [
        {
          topic: "entrance",
          text: t(locale, "Is there a way in without steps? If so, where is it and how do I find it?", "Y a-t-il une entrée sans marches\u202f? Si oui, où se trouve-t-elle et comment la repérer\u202f?"),
          basis,
        },
        {
          topic: "inside",
          text: t(
            locale,
            "Which parts inside can be reached without stairs: the main area, the washroom, any other floor?",
            "Quelles parties de l’intérieur sont accessibles sans escalier\u00a0: la salle principale, les toilettes, un autre étage\u202f?",
          ),
          basis,
        },
      ];
    case "limited":
      return [
        {
          topic: "limited-meaning",
          text: t(
            locale,
            `The pack says ${label}. What does that mean here: which parts can be reached, and which cannot?`,
            `Le pack indique «\u202f${label}\u202f». Qu’est-ce que cela veut dire ici\u00a0: quelles parties sont accessibles, et lesquelles ne le sont pas\u202f?`,
          ),
          basis,
        },
        {
          topic: "other-entrance",
          text: t(locale, "Is there another way in that avoids those limits?", "Existe-t-il une autre entrée qui évite ces limites\u202f?"),
          basis,
        },
      ];
    case "no":
      return [
        {
          topic: "other-entrance",
          text: t(
            locale,
            "The pack says No. As things are now, what other way in or arrangement is there for people who use wheelchairs, if any?",
            "Le pack indique «\u202fNon\u202f». Dans l’état actuel des lieux, quelle autre entrée ou quel arrangement existe-t-il pour les personnes en fauteuil roulant, le cas échéant\u202f?",
          ),
          basis,
        },
      ];
    case "yes":
    case "designated":
      return [
        {
          topic: "scope",
          text: t(
            locale,
            `The pack says ${label}. Does that cover the entrance, the main area and the washroom? Which of them, if any, does it not cover?`,
            `Le pack indique «\u202f${label}\u202f». Est-ce que cela couvre l’entrée, la salle principale et les toilettes\u202f? Lesquelles, le cas échéant, ne sont pas couvertes\u202f?`,
          ),
          basis,
        },
      ];
  }
}

function gapQuestions(place: PackPlaceRecord, locale: Locale, today: string): Draft[] {
  const out: Draft[] = [];
  if (place.name === null) {
    out.push({
      topic: "name",
      text: t(locale, "What is this place called, as shown at the entrance?", "Comment ce lieu s’appelle-t-il, tel qu’il est affiché à l’entrée\u202f?"),
      basis: t(locale, "The pack gives no name for this place: UNKNOWN.", "Le pack ne donne aucun nom pour ce lieu\u00a0: UNKNOWN."),
    });
  }
  if (place.address === null) {
    out.push({
      topic: "address",
      text: t(locale, "What is the full street address, and which entrance does it refer to?", "Quelle est l’adresse complète, et de quelle entrée s’agit-il\u202f?"),
      basis: t(locale, "The pack gives no address for this place: UNKNOWN.", "Le pack ne donne aucune adresse pour ce lieu\u00a0: UNKNOWN."),
    });
  }
  if (place.location === null) {
    out.push({
      topic: "find",
      text: t(
        locale,
        "How do I find the entrance from the street or from the nearest stop?",
        "Comment repérer l’entrée depuis la rue ou depuis l’arrêt le plus proche\u202f?",
      ),
      basis: t(locale, "The pack holds no map point for this place: UNKNOWN.", "Le pack ne contient aucun point sur la carte pour ce lieu\u00a0: UNKNOWN."),
    });
  }
  const prov = place.provenance;
  if (prov === null) {
    out.push({
      topic: "source",
      text: t(
        locale,
        "Can you describe the entrance and the inside as they are now, so I can compare that with the pack?",
        "Pouvez-vous décrire l’entrée et l’intérieur tels qu’ils sont maintenant, pour que je les compare avec le pack\u202f?",
      ),
      basis: t(locale, "The pack gives no source for this place: UNKNOWN.", "Le pack ne donne aucune source pour ce lieu\u00a0: UNKNOWN."),
    });
  } else if (isStale(prov.retrievedOn, today)) {
    const date = formatDate(prov.retrievedOn, locale);
    out.push({
      topic: "recent",
      text: t(
        locale,
        `The pack's details were retrieved on ${date}. Has anything changed at the entrance or inside since then?`,
        `Les données du pack ont été consultées le ${date}. Quelque chose a-t-il changé à l’entrée ou à l’intérieur depuis\u202f?`,
      ),
      basis: ageLabel(prov.retrievedOn, today, locale),
    });
  }
  if (place.note !== null) {
    const quote = clip(place.note, MAX_NOTE_QUOTE);
    out.push({
      topic: "note",
      text: t(locale, `The pack's note says "${quote}". Is that still how it is?`, `La note du pack dit «\u202f${quote}\u202f». Est-ce toujours le cas\u202f?`),
      basis: t(locale, "The pack holds a note for this place.", "Le pack contient une note pour ce lieu."),
    });
  }
  return out;
}

/** The questions for one place, in the fixed topic order. The contact question is always last. */
export function questionsFor(place: PackPlaceRecord, locale: Locale, today: string): VisitQuestion[] {
  const drafts: Draft[] = [
    ...tagQuestions(place, locale),
    ...gapQuestions(place, locale, today),
    {
      topic: "contact",
      text: t(locale, "How can I reach someone there before I go, and at what times can I call or write?", "Comment joindre quelqu’un sur place avant d’y aller, et à quels moments puis-je téléphoner ou écrire\u202f?"),
      basis: t(locale, "The pack holds no contact details.", "Le pack ne contient aucune coordonnée."),
    },
  ];
  const rank = (topic: QuestionTopic): number => QUESTION_TOPICS.indexOf(topic);
  return drafts
    .map((draft, index) => ({ draft, index }))
    .sort((a, b) => rank(a.draft.topic) - rank(b.draft.topic) || a.index - b.index)
    .map(({ draft }, n) => ({ key: `${place.id}:${draft.topic}:${n}`, topic: draft.topic, text: draft.text, basis: draft.basis }));
}

/** The plan for the listed places that the pack holds, plus how many listed places it does not. */
export function buildVisitPlan(found: readonly PackPlaceRecord[], missing: number, locale: Locale, today: string): VisitPlan {
  const places = found.map((place) => ({ id: place.id, name: place.name, questions: questionsFor(place, locale, today) }));
  return { places, missing, total: places.reduce((n, p) => n + p.questions.length, 0) };
}

/** How many places in the plan have a question about the wheelchair tag. Every place with a pack record has one. */
export function tagQuestionCount(plan: VisitPlan): number {
  const tagTopics: readonly QuestionTopic[] = ["entrance", "inside", "limited-meaning", "other-entrance", "scope"];
  return plan.places.filter((p) => p.questions.some((q) => tagTopics.includes(q.topic))).length;
}

/** The one-line summary shown above the questions. */
export function planSummary(plan: VisitPlan, locale: Locale): string {
  const n = plan.places.length;
  if (n === 0) return t(locale, "No listed place is in the pack on this device, so there are no questions.", "Aucun lieu de la liste n’est dans le pack sur cet appareil\u00a0: il n’y a donc aucune question.");
  const placesEn = n === 1 ? "1 place" : `${n} places`;
  const placesFr = n === 1 ? "1 lieu" : `${n} lieux`;
  const questions = plan.total === 1 ? "1 question" : `${plan.total} questions`;
  return t(locale, `${questions} for ${placesEn}, made from what the pack says and leaves out.`, `${questions} pour ${placesFr}, établie${plan.total === 1 ? "" : "s"} d’après ce que le pack indique et ce qu’il omet.`);
}
