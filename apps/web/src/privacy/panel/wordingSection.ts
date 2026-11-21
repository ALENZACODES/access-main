// The part of the panel that tells a person which of their choices are off because the wording changed after they
// answered, and what changed. Changes are written out as words ("Removed", "Added"), never shown by colour alone.
// When the words the person answered under are not on record, the panel says so and shows no comparison.

import type { Locale } from "./copyLint";
import { esc } from "./html";
import type { ExportFile } from "./localData";
import { diffWords, hasChange, type DiffSegment } from "./wordDiff";
import type { WordingChange } from "./wordingHistory";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

export const WORDING_STRINGS = {
  en: {
    heading: "Choices to answer again",
    note: "The wording of these choices changed after you answered. Your earlier answer no longer counts, so each choice is off until you answer again. This shows what changed.",
    answered: (answer: "granted" | "declined", date: string): string => `You answered ${answer === "granted" ? "yes" : "no"} on ${date}.`,
    answeredEarlier: "The wording you answered under",
    wordingNow: "The wording now",
    labelEarlier: "Name then",
    labelNow: "Name now",
    removed: "Removed",
    added: "Added",
    onlySpacing: "Only spacing or punctuation changed.",
    notOnRecord: "The wording you answered under is not on record, so no comparison is shown.",
    notes: "What the change was about",
    none: "No choice needs to be answered again.",
    fileTitle: "Choices to answer again",
    stem: "the-app-choices-to-answer-again",
    quote: (text: string): string => `“${text}”`,
  },
  fr: {
    heading: "Choix à confirmer de nouveau",
    note: "Le texte de ces choix a changé après votre réponse. Votre réponse précédente ne compte plus, chaque choix est donc désactivé jusqu’à ce que vous répondiez de nouveau. Voici ce qui a changé.",
    answered: (answer: "granted" | "declined", date: string): string => `Vous avez répondu ${answer === "granted" ? "oui" : "non"} le ${date}.`,
    answeredEarlier: "Le texte sous lequel vous avez répondu",
    wordingNow: "Le texte actuel",
    labelEarlier: "Nom à l’époque",
    labelNow: "Nom actuel",
    removed: "Retiré",
    added: "Ajouté",
    onlySpacing: "Seuls les espaces ou la ponctuation ont changé.",
    notOnRecord: "Le texte sous lequel vous avez répondu n’est pas consigné, aucune comparaison n’est donc montrée.",
    notes: "Raison du changement",
    none: "Aucun choix n’est à confirmer de nouveau.",
    fileTitle: "Choix à confirmer de nouveau",
    stem: "l-app-choix-a-confirmer-de-nouveau",
    quote: (text: string): string => `«${NNBSP}${text}${NNBSP}»`,
  },
} as const;

/** The pieces of one change, in the order they are shown. Shared by the panel and the file. */
export interface WordingBlock {
  id: string;
  title: string;
  answered: string;
  earlier: string | null;
  now: string;
  labelEarlier: string | null;
  labelNow: string | null;
  /** Null when the earlier wording is not on record */
  diff: DiffSegment[] | null;
  spacingOnly: boolean;
  notes: string[];
}

export function wordingBlocks(locale: Locale, changes: readonly WordingChange[]): WordingBlock[] {
  const s = WORDING_STRINGS[locale];
  return changes.map((c): WordingBlock => {
    const before = c.before?.description[locale] ?? null;
    const now = c.after.description[locale];
    const diff = before === null ? null : diffWords(before, now);
    const labelChanged = c.before !== null && c.before.label[locale] !== c.after.label[locale];
    return {
      id: c.purposeId,
      title: c.after.label[locale],
      answered: s.answered(c.answer, c.answeredOn),
      earlier: before,
      now,
      labelEarlier: labelChanged && c.before !== null ? c.before.label[locale] : null,
      labelNow: labelChanged ? c.after.label[locale] : null,
      diff,
      spacingOnly: before !== null && before !== now && !hasChange(before, now) && !labelChanged,
      notes: c.notes.map((n) => n[locale]),
    };
  });
}

const colonOf = (locale: Locale): string => (locale === "fr" ? `${NBSP}:` : ":");

const list = (locale: Locale, cls: string, label: string, text: string): string => `<li data-change="${cls}"><strong>${esc(label)}${colonOf(locale)}</strong> ${esc(text)}</li>`;

function changeHtml(locale: Locale, b: WordingBlock): string {
  const s = WORDING_STRINGS[locale];
  const parts: string[] = [`<p>${esc(b.answered)}</p>`];
  if (b.earlier === null) parts.push(`<p>${esc(s.notOnRecord)}</p>`);
  else parts.push(`<p><strong>${esc(s.answeredEarlier)}${colonOf(locale)}</strong> ${esc(s.quote(b.earlier))}</p>`);
  parts.push(`<p><strong>${esc(s.wordingNow)}${colonOf(locale)}</strong> ${esc(s.quote(b.now))}</p>`);
  const items: string[] = [];
  if (b.labelEarlier !== null && b.labelNow !== null) {
    items.push(list(locale, "label-earlier", s.labelEarlier, s.quote(b.labelEarlier)), list(locale, "label-now", s.labelNow, s.quote(b.labelNow)));
  }
  for (const seg of b.diff ?? []) {
    if (seg.kind === "removed") items.push(list(locale, "removed", s.removed, s.quote(seg.text.trim())));
    if (seg.kind === "added") items.push(list(locale, "added", s.added, s.quote(seg.text.trim())));
  }
  if (items.length > 0) parts.push(`<ul>${items.join("")}</ul>`);
  if (b.spacingOnly) parts.push(`<p>${esc(s.onlySpacing)}</p>`);
  if (b.notes.length > 0) parts.push(`<p><strong>${esc(s.notes)}${colonOf(locale)}</strong></p><ul>${b.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`);
  return `<div role="group" aria-labelledby="privacy-wording-${esc(b.id)}"><h4 id="privacy-wording-${esc(b.id)}">${esc(b.title)}</h4>${parts.join("")}</div>`;
}

/** Empty when no choice needs answering again, so the section only appears when it has something to say. */
export function renderWordingChangesHtml(locale: Locale, changes: readonly WordingChange[]): string {
  if (changes.length === 0) return "";
  const s = WORDING_STRINGS[locale];
  return `<div data-privacy-wording-changes role="group" aria-labelledby="privacy-wording-title"><h3 id="privacy-wording-title">${esc(s.heading)}</h3><p>${esc(s.note)}</p>${wordingBlocks(locale, changes).map((b) => changeHtml(locale, b)).join("")}</div>`;
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function wordingChangesAsText(locale: Locale, changes: readonly WordingChange[], now: Date): ExportFile {
  const s = WORDING_STRINGS[locale];
  const colon = colonOf(locale);
  const out: string[] = [s.fileTitle, "", changes.length === 0 ? s.none : s.note, ""];
  for (const b of wordingBlocks(locale, changes)) {
    out.push(b.title, `  ${b.answered}`);
    out.push(b.earlier === null ? `  ${s.notOnRecord}` : `  ${s.answeredEarlier}${colon} ${s.quote(b.earlier)}`);
    out.push(`  ${s.wordingNow}${colon} ${s.quote(b.now)}`);
    if (b.labelEarlier !== null && b.labelNow !== null) out.push(`  ${s.labelEarlier}${colon} ${s.quote(b.labelEarlier)}`, `  ${s.labelNow}${colon} ${s.quote(b.labelNow)}`);
    for (const seg of b.diff ?? []) {
      if (seg.kind === "removed") out.push(`  ${s.removed}${colon} ${s.quote(seg.text.trim())}`);
      if (seg.kind === "added") out.push(`  ${s.added}${colon} ${s.quote(seg.text.trim())}`);
    }
    if (b.spacingOnly) out.push(`  ${s.onlySpacing}`);
    for (const n of b.notes) out.push(`  ${s.notes}${colon} ${n}`);
    out.push("");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: changes.length };
}
