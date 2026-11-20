// The part of the panel that says what the App asks of the browser. The rows come from featureRegister.ts,
// which the CI scan keeps in step with the source. After the person presses the check button the table also
// shows what the browser says it has allowed. A browser that does not answer is shown as unknown. Before the
// check the answers are shown as not checked, never as a guess.

import type { Locale } from "./copyLint";
import { type FeatureRow, unusedFeatures, usedFeatures } from "./featureRegister";
import type { FeatureStates, PermissionAnswer } from "./permissions";
import { button, esc } from "./html";

export interface FeatureView {
  register: readonly FeatureRow[];
  /** null before the check */
  states: FeatureStates | null;
}

export const FEATURE_STRINGS = {
  en: {
    heading: "What the App asks of your browser",
    note: "The first table lists what the App uses. The second lists powerful features it does not use. Both were read from the App’s source, not from your device. Your browser’s answers appear only after you check.",
    usedHeading: "Used by the App",
    unusedHeading: "Not used by the App",
    columns: { feature: "Feature", why: "Why", asks: "Does your browser ask you first?", answer: "Your browser’s answer", headers: "App header settings" },
    asks: { yes: "Yes", no: "No", UNKNOWN: "Unknown" },
    answer: { granted: "Allowed", denied: "Blocked", prompt: "Will ask you", unknown: "Unknown", notChecked: "Not checked", none: "Not applicable" },
    headers: { off: "Listed as off", none: "No setting", note: "Read from the App’s source. Whether the site you use sends it was not checked." },
    checkButton: "Check what my browser allows",
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    checked: (date: string): string => `Checked on ${date}.`,
    caption: { used: "Features the App uses", unused: "Powerful features the App does not use" },
  },
  fr: {
    heading: "Ce que l’App demande à votre navigateur",
    note: "Le premier tableau liste ce que l’App utilise. Le second liste des fonctions puissantes qu’elle n’utilise pas. Les deux ont été lus dans le code source de l’App, pas sur votre appareil. Les réponses de votre navigateur n’apparaissent qu’après un contrôle.",
    usedHeading: "Utilisé par l’App",
    unusedHeading: "Non utilisé par l’App",
    columns: { feature: "Fonction", why: "Pourquoi", asks: "Votre navigateur vous le demande-t-il d’abord ?", answer: "Réponse de votre navigateur", headers: "Réglages d’en-tête de l’App" },
    asks: { yes: "Oui", no: "Non", UNKNOWN: "Inconnu" },
    answer: { granted: "Autorisé", denied: "Bloqué", prompt: "Vous le demandera", unknown: "Inconnu", notChecked: "Non contrôlé", none: "Sans objet" },
    headers: { off: "Indiqué comme désactivé", none: "Aucun réglage", note: "Lu dans le code source de l’App. Nous n’avons pas contrôlé si le site que vous utilisez l’envoie." },
    checkButton: "Contrôler ce que mon navigateur autorise",
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    checked: (date: string): string => `Contrôlé le ${date}.`,
    caption: { used: "Fonctions que l’App utilise", unused: "Fonctions puissantes que l’App n’utilise pas" },
  },
} as const;

type Strings = (typeof FEATURE_STRINGS)[Locale];

function answerCell(s: Strings, row: FeatureRow, states: FeatureStates | null): string {
  if (row.permission === undefined) return s.answer.none;
  if (states === null) return s.answer.notChecked;
  const a: PermissionAnswer = states.answers[row.id] ?? "unknown";
  return s.answer[a];
}

function cell(label: string, text: string): string {
  return `<span data-label="${esc(label)}">${esc(text)}</span>`;
}

function table(locale: Locale, caption: string, head: readonly string[], rows: readonly (readonly [string, string[]])[]): string {
  const th = head.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const tr = rows
    .map(([first, rest]) => `<tr><th scope="row">${cell(head[0] ?? "", first)}</th>${rest.map((t, i) => `<td>${cell(head[i + 1] ?? "", t)}</td>`).join("")}</tr>`)
    .join("");
  void locale;
  return `<table><caption>${esc(caption)}</caption><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/** Empty when the register has no rows, so the section only appears when it has something to say. */
export function renderFeaturesHtml(locale: Locale, v: FeatureView): string {
  if (v.register.length === 0) return "";
  const s = FEATURE_STRINGS[locale];
  const used = usedFeatures(v.register);
  const unused = unusedFeatures(v.register);
  const usedTable =
    used.length === 0
      ? ""
      : `<h4>${esc(s.usedHeading)}</h4>` +
        table(locale, s.caption.used, [s.columns.feature, s.columns.why, s.columns.asks, s.columns.answer], used.map((r) => [r.holds[locale], [r.why?.[locale] ?? "", s.asks[r.asks], answerCell(s, r, v.states)]]));
  const unusedTable =
    unused.length === 0
      ? ""
      : `<h4>${esc(s.unusedHeading)}</h4>` +
        table(
          locale,
          s.caption.unused,
          [s.columns.feature, s.columns.asks, s.columns.answer, s.columns.headers],
          unused.map((r) => [r.holds[locale], [s.asks[r.asks], answerCell(s, r, v.states), r.blockedBy === undefined ? s.headers.none : s.headers.off]]),
        ) +
        (unused.some((r) => r.blockedBy !== undefined) ? `<p>${esc(s.headers.note)}</p>` : "");
  const checked = v.states === null ? "" : `<p>${esc(s.checked(v.states.at.slice(0, 10)))}</p>`;
  return (
    `<div data-privacy-features role="group" aria-labelledby="privacy-features-title"><h3 id="privacy-features-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p>${usedTable}${unusedTable}${checked}<div>${button("check-features", s.checkButton)}${button("export-features-csv", s.csvButton)}${button("export-features-text", s.textButton)}</div></div>`
  );
}
