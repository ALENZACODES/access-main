import { LOCALES, add, object, safeText, sorted } from "./core.mjs";

/** French publication typography is enforced on final copy, not source URLs. */
export const FR_NBSP = "\u00A0";
export const FR_NARROW = "\u202F";
export const FR_APOSTROPHE = "\u2019";
export const FR_OPEN = "\u00AB";
export const FR_CLOSE = "\u00BB";
const STRAIGHT_QUOTE = String.fromCharCode(39);

/**
 * This checks punctuation context without normalizing or rewording records.
 * It never silently changes an owner's copy, including quoted source titles.
 */
/** @param {unknown} input @param {string} [path] */
export function auditFrenchText(input, path = "copy.fr") {
  /** @type {import('./core.mjs').Finding[]} */
  const findings = [];
  if (typeof input !== "string" || !safeText(input, 10000)) {
    add(findings, "fr.text", path);
    return findings;
  }
  const text = input;
  if (text.includes(STRAIGHT_QUOTE)) add(findings, "fr.apostrophe", path, "review");
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === ":" && i > 0 && !/\d/.test(text[i - 1] ?? "")) {
      if (text[i - 1] !== FR_NBSP) add(findings, "fr.colon-space", path);
    }
    if (char === ";" || char === "!" || char === "?") {
      if (i > 0 && text[i - 1] !== FR_NARROW) add(findings, "fr.narrow-before", path);
    }
    if (char === FR_OPEN && i + 1 < text.length && text[i + 1] !== FR_NARROW) {
      add(findings, "fr.guillemet-open", path);
    }
    if (char === FR_CLOSE && i > 0 && text[i - 1] !== FR_NARROW) {
      add(findings, "fr.guillemet-close", path);
    }
  }
  return sorted(findings);
}

/**
 * Explicit typography helper for author-provided copy. This is opt-in, not
 * executed during evidence processing or used to rewrite source material.
 */
/** @param {string} input */
export function formatFrenchCopy(input) {
  if (!safeText(input, 10000)) throw new TypeError("copy must be nonempty safe text");
  let output = input.replaceAll(STRAIGHT_QUOTE, FR_APOSTROPHE);
  output = output.replace(/[ \t\u00A0\u202F]*:/g, `${FR_NBSP}:`);
  output = output.replace(/[ \t\u00A0\u202F]*([;!?])/g, `${FR_NARROW}$1`);
  output = output.replace(/\u00AB[ \t\u00A0\u202F]*/g, `${FR_OPEN}${FR_NARROW}`);
  output = output.replace(/[ \t\u00A0\u202F]*\u00BB/g, `${FR_NARROW}${FR_CLOSE}`);
  return output;
}

/** @param {unknown} text @param {string} field */
export function auditLocalizedPair(text, field) {
  /** @type {import('./core.mjs').Finding[]} */
  const findings = [];
  if (!object(text)) {
    add(findings, "locale.object", field);
    return findings;
  }
  for (const locale of LOCALES) {
    if (!safeText(text[locale], 3000)) add(findings, "locale.missing", `${field}.${locale}`);
  }
  if (safeText(text.fr, 3000)) findings.push(...auditFrenchText(text.fr, `${field}.fr`));
  if (safeText(text.en, 3000) && safeText(text.fr, 3000) && text.en.trim() === text.fr.trim()) {
    add(findings, "locale.same-copy", field, "review");
  }
  return sorted(findings);
}

/** @param {unknown} record @param {string} [path] */
export function auditRecordTypography(record, path = "record") {
  /** @type {import('./core.mjs').Finding[]} */
  const findings = [];
  if (!object(record)) {
    add(findings, "record.object", path);
    return findings;
  }
  findings.push(...auditLocalizedPair(record.title, `${path}.title`));
  findings.push(...auditLocalizedPair(record.summary, `${path}.summary`));
  if (object(record.notes)) findings.push(...auditLocalizedPair(record.notes, `${path}.notes`));
  return sorted(findings);
}

/** @param {unknown} records */
export function auditTypographyCollection(records) {
  /** @type {import('./core.mjs').Finding[]} */
  const findings = [];
  if (!Array.isArray(records)) return [{ code: "collection.array", path: "records", severity: "error" }];
  records.forEach((record, index) => findings.push(...auditRecordTypography(record, `records[${index}]`)));
  return sorted(findings);
}

/**
 * Produce explicit, safe user copy from status, with no assertions about what
 * a record means when its evidence is UNKNOWN.
 */
/** @param {string} status @param {'en'|'fr'} language */
export function statusCopy(status, language) {
  if (!LOCALES.includes(language)) throw new TypeError("language must be en or fr");
  const messages = {
    READY: { en: "Offline copy available", fr: "Copie hors ligne disponible" },
    HOLD: { en: "Offline copy needs attention", fr: "Copie hors ligne à examiner" },
    UNKNOWN: { en: "Offline status UNKNOWN", fr: "État hors ligne UNKNOWN" },
  };
  return messages[status]?.[language] ?? messages.UNKNOWN[language];
}

/** @param {readonly {code:string,path:string,severity:string}[]} findings */
export function typographyCounts(findings) {
  const counts = { error: 0, review: 0 };
  for (const finding of findings) {
    if (finding.severity === "error") counts.error += 1;
    if (finding.severity === "review") counts.review += 1;
  }
  return counts;
}
