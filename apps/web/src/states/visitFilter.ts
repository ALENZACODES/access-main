/**
 * Narrowing the questions to one kind. The person can look only at the questions about getting in,
 * only at those about gaps in the record, or only at those not yet asked. Narrowing never changes
 * the wording or the order of a question, and a place with no question left is not shown.
 */
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import { type QuestionTopic, type VisitPlan } from "./visitQuestions";

export const VISIT_FILTERS = ["all", "way-in", "record", "not-asked"] as const;
export type VisitFilter = (typeof VISIT_FILTERS)[number];

/** Questions about getting in and finding the way in. */
export const WAY_IN_TOPICS: readonly QuestionTopic[] = ["entrance", "inside", "limited-meaning", "other-entrance", "scope", "find"];
/** Questions about what the record leaves out or may have out of date. */
export const RECORD_TOPICS: readonly QuestionTopic[] = ["name", "address", "recent", "source", "note"];

export function isVisitFilter(value: unknown): value is VisitFilter {
  return typeof value === "string" && (VISIT_FILTERS as readonly string[]).includes(value);
}

export function filterLabel(filter: VisitFilter, locale: Locale): string {
  switch (filter) {
    case "all":
      return t(locale, "All questions", "Toutes les questions");
    case "way-in":
      return t(locale, "Getting in", "Accès à l’entrée");
    case "record":
      return t(locale, "Gaps in the record", "Lacunes du dossier");
    case "not-asked":
      return t(locale, "Not asked yet", "Pas encore posées");
  }
}

function keep(filter: VisitFilter, topic: QuestionTopic, key: string, done: ReadonlySet<string>): boolean {
  switch (filter) {
    case "all":
      return true;
    case "way-in":
      return WAY_IN_TOPICS.includes(topic);
    case "record":
      return RECORD_TOPICS.includes(topic);
    case "not-asked":
      return !done.has(key);
  }
}

/** The plan with only the questions the filter keeps. Places left with no question are dropped; the missing count stays. */
export function filterPlan(plan: VisitPlan, filter: VisitFilter, done: ReadonlySet<string> = new Set()): VisitPlan {
  if (filter === "all") return plan;
  const places = plan.places
    .map((p) => ({ ...p, questions: p.questions.filter((q) => keep(filter, q.topic, q.key, done)) }))
    .filter((p) => p.questions.length > 0);
  return { places, missing: plan.missing, total: places.reduce((n, p) => n + p.questions.length, 0) };
}

/** How many questions each filter would show, so the choice can say what is behind it. */
export function filterCounts(plan: VisitPlan, done: ReadonlySet<string> = new Set()): Record<VisitFilter, number> {
  return {
    all: plan.total,
    "way-in": filterPlan(plan, "way-in", done).total,
    record: filterPlan(plan, "record", done).total,
    "not-asked": filterPlan(plan, "not-asked", done).total,
  };
}

/** A line saying what a filter hides, or nothing when it hides nothing. */
export function filterNote(plan: VisitPlan, shown: VisitPlan, locale: Locale): string {
  const hidden = plan.total - shown.total;
  if (hidden <= 0) return "";
  const en = hidden === 1 ? "1 question is hidden by this choice." : `${hidden} questions are hidden by this choice.`;
  const fr = hidden === 1 ? "1 question est masquée par ce choix." : `${hidden} questions sont masquées par ce choix.`;
  return t(locale, en, fr);
}
