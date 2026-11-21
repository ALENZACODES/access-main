/**
 * Which questions the person has already asked. Kept in memory only, for as long as the page is
 * open: it is a tick list, not a record, and it is never written to this device or sent anywhere.
 */
import type { VisitPlan } from "./visitQuestions";

/** A new set with the key ticked, or unticked if it was ticked. The set given is not changed. */
export function toggleDone(done: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(done);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Only the keys that are still questions in the plan, so a removed place leaves nothing behind. */
export function pruneDone(done: ReadonlySet<string>, plan: VisitPlan): Set<string> {
  const live = new Set(plan.places.flatMap((p) => p.questions.map((q) => q.key)));
  return new Set([...done].filter((key) => live.has(key)));
}

export interface Progress {
  readonly asked: number;
  readonly total: number;
}

export function progress(done: ReadonlySet<string>, plan: VisitPlan): Progress {
  return { asked: pruneDone(done, plan).size, total: plan.total };
}

/** For a screen reader: how far through the questions the person is. */
export function progressLine(p: Progress, locale: "en" | "fr"): string {
  if (p.total === 0) return locale === "fr" ? "Aucune question." : "No questions.";
  return locale === "fr" ? `${p.asked} sur ${p.total} posées.` : `${p.asked} of ${p.total} asked.`;
}
