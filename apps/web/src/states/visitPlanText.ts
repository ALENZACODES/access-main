/**
 * The questions as a text the person can take along, and as CSV with an empty answer column.
 *
 * The text states where the questions come from and that the pack is not a substitute for asking.
 * The CSV column names and topic names are fixed English tokens, the same in both languages, so a
 * file reads the same anywhere; the question and basis columns are in the chosen language.
 */
import { OSM_CREDIT } from "./dataCredits";
import { type CsvOptions, csvCell } from "./exportData";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import { type VisitPlan, planSummary } from "./visitQuestions";

export const VISIT_CSV_HEADER = ["place_id", "place_name", "topic", "question", "basis", "answer"] as const;
export const VISIT_CSV_FILENAMES: Readonly<Record<Locale, string>> = { en: "questions-before-you-go.csv", fr: "questions-avant-de-partir.csv" };
export const VISIT_TEXT_FILENAMES: Readonly<Record<Locale, string>> = { en: "questions-before-you-go.txt", fr: "questions-avant-de-partir.txt" };

const UNKNOWN_NAME = "UNKNOWN";

/** The cells of the CSV, one row per question; the answer cell is empty for the person to fill in. */
export function visitRows(plan: VisitPlan): string[][] {
  return plan.places.flatMap((p) => p.questions.map((q) => [p.id, p.name ?? UNKNOWN_NAME, q.topic, q.text, q.basis, ""]));
}

export function visitPlanToCsv(plan: VisitPlan, opts: CsvOptions = {}): string {
  const lines = [[...VISIT_CSV_HEADER], ...visitRows(plan)];
  return (opts.bom ? "\uFEFF" : "") + lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The ticked questions are marked [x] and the rest [ ]. Keys not in the plan are ignored. */
export function visitPlanToText(plan: VisitPlan, locale: Locale, today: string, done: ReadonlySet<string> = new Set()): string {
  const title = t(locale, "Questions to ask before you go", "Questions à poser avant d’y aller");
  const out: string[] = [
    title,
    "=".repeat(title.length),
    t(locale, `Date: ${today}`, `Date\u00a0: ${today}`),
    planSummary(plan, locale),
    t(
      locale,
      "The pack on this device is a starting point. These questions are for the place to answer; the answers are not in the pack.",
      "Le pack sur cet appareil est un point de départ. Ces questions s’adressent au lieu\u00a0; les réponses ne sont pas dans le pack.",
    ),
  ];
  for (const place of plan.places) {
    out.push("", place.name ?? t(locale, "Place with no name (UNKNOWN)", "Lieu sans nom (UNKNOWN)"));
    place.questions.forEach((q, i) => {
      out.push(`  [${done.has(q.key) ? "x" : " "}] ${i + 1}. ${q.text}`);
      out.push(`      ${t(locale, "Why", "Pourquoi")}${locale === "fr" ? "\u00a0:" : ":"} ${q.basis}`);
    });
  }
  if (plan.missing > 0) {
    out.push(
      "",
      t(
        locale,
        plan.missing === 1 ? "1 listed place is not in the pack on this device, so it has no questions." : `${plan.missing} listed places are not in the pack on this device, so they have no questions.`,
        plan.missing === 1 ? "1 lieu de la liste n’est pas dans le pack sur cet appareil\u00a0: il n’a donc aucune question." : `${plan.missing} lieux de la liste ne sont pas dans le pack sur cet appareil\u00a0: ils n’ont donc aucune question.`,
      ),
    );
  }
  out.push("", OSM_CREDIT);
  return out.join("\n") + "\n";
}
