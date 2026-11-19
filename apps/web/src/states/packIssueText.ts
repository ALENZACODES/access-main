/**
 * Words for the problems the pack audit finds, and a grouped view of them.
 *
 * The audit (`packAudit.ts`) reports codes with an array position. This turns them into short
 * sentences in English and French, groups repeats so a long list stays readable, and keeps the
 * order stable: errors first, then warnings, each by code. It describes the data; it does not
 * correct it and it does not say what the person should do about a place.
 */
import { type PackAuditResult, type PackIssue, type PackIssueCode, type PackIssueSeverity } from "./packAudit";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

/** The most record ids listed for one kind of problem. The count is always the full count. */
export const MAX_SAMPLE_IDS = 5;

const MESSAGES: Readonly<Record<PackIssueCode, { en: string; fr: string }>> = {
  "not-an-object": { en: "An entry is not a place record and was left out.", fr: "Une entrée n’est pas une fiche de lieu et a été omise." },
  "bad-id": { en: "A record has no usable identifier and was left out.", fr: "Une fiche n’a pas d’identifiant utilisable et a été omise." },
  "duplicate-id": { en: "A record repeats an identifier already used.", fr: "Une fiche reprend un identifiant déjà utilisé." },
  "missing-name": { en: "A record has no name, so it is shown with the name UNKNOWN.", fr: "Une fiche n’a pas de nom : le nom affiché est UNKNOWN." },
  "bad-coordinates": { en: "A record has no usable position, so its distance is UNKNOWN.", fr: "Une fiche n’a pas de position utilisable : la distance est UNKNOWN." },
  "tag-unrecognised": { en: "A wheelchair tag has a value the App does not recognise, so it is shown as UNKNOWN.", fr: "Une indication pour fauteuil roulant a une valeur non reconnue : elle est affichée comme UNKNOWN." },
  "tag-without-source": { en: "A wheelchair tag is given without a usable source, so it is not shown as reported.", fr: "Une indication pour fauteuil roulant n’a pas de source utilisable : elle n’est pas présentée comme signalée." },
  "provenance-missing": { en: "A record names no source.", fr: "Une fiche n’indique aucune source." },
  "provenance-no-source": { en: "A record's source has no name.", fr: "La source d’une fiche n’a pas de nom." },
  "provenance-licence-not-open": { en: "A record's licence is not one of the open licences the App accepts.", fr: "La licence d’une fiche ne fait pas partie des licences ouvertes acceptées." },
  "provenance-bad-date": { en: "A record's retrieval date is not a valid date.", fr: "La date de consultation d’une fiche n’est pas une date valide." },
  "provenance-bad-url": { en: "A record's source link is not a safe web address.", fr: "Le lien vers la source d’une fiche n’est pas une adresse web sûre." },
  "provenance-future-date": { en: "A record's retrieval date is in the future.", fr: "La date de consultation d’une fiche est dans le futur." },
};

/** All codes, in the order they are listed within a severity. */
export const PACK_ISSUE_CODES: readonly PackIssueCode[] = Object.keys(MESSAGES) as PackIssueCode[];

/** One sentence for a code. Singular: "A record …". Pair it with the count from the group. */
export function issueMessage(code: PackIssueCode, locale: Locale): string {
  return t(locale, MESSAGES[code].en, MESSAGES[code].fr);
}

export interface IssueGroup {
  readonly code: PackIssueCode;
  readonly severity: PackIssueSeverity;
  readonly count: number;
  /** Up to MAX_SAMPLE_IDS record ids, in array order. Records with no usable id are not listed. */
  readonly sampleIds: readonly string[];
  /** Positions in the array of the first MAX_SAMPLE_IDS records, so a record without an id can be found. */
  readonly sampleIndexes: readonly number[];
}

/** Group issues by code. Errors come first, then warnings; inside a severity the order follows PACK_ISSUE_CODES. */
export function groupIssues(issues: readonly PackIssue[]): IssueGroup[] {
  const by = new Map<PackIssueCode, PackIssue[]>();
  for (const issue of issues) by.set(issue.code, [...(by.get(issue.code) ?? []), issue]);
  const groups: IssueGroup[] = [];
  for (const code of PACK_ISSUE_CODES) {
    const list = by.get(code);
    if (!list) continue;
    const first = list.slice(0, MAX_SAMPLE_IDS);
    groups.push({
      code,
      severity: list[0]!.severity,
      count: list.length,
      sampleIds: first.map((i) => i.id).filter((id): id is string => id !== null),
      sampleIndexes: first.map((i) => i.index),
    });
  }
  return [...groups.filter((g) => g.severity === "error"), ...groups.filter((g) => g.severity === "warning")];
}

/** "3 × A record has no name, …" in a form that reads on its own, in each language. */
export function groupLine(g: IssueGroup, locale: Locale): string {
  return `${g.count} × ${issueMessage(g.code, locale)}`;
}

export function severityLabel(severity: PackIssueSeverity, locale: Locale): string {
  return severity === "error" ? t(locale, "Needs attention", "À corriger") : t(locale, "Gap", "Lacune");
}

/** One line for the whole result. A clean audit says only that no problem was found, not that the data is right. */
export function auditSummary(result: PackAuditResult, locale: Locale): string {
  if (result.checked === 0) return t(locale, "No entries to check.", "Aucune entrée à contrôler.");
  if (result.clean) return t(locale, `No problem found in ${result.checked} entries. That says nothing about whether what they report is right.`, `Aucun problème repéré dans ${result.checked} entrées. Cela ne dit rien de l’exactitude de ce qu’elles indiquent.`);
  const e = result.errors;
  const w = result.warnings;
  return t(
    locale,
    `${e} ${e === 1 ? "problem" : "problems"} and ${w} ${w === 1 ? "gap" : "gaps"} found in ${result.checked} entries.`,
    `${e} ${e === 1 ? "problème" : "problèmes"} et ${w} ${w === 1 ? "lacune" : "lacunes"} repérés dans ${result.checked} entrées.`,
  );
}
