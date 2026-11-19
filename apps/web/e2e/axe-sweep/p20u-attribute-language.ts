/**
 * P20U: WCAG 3.1.2 audit for non-text-node copy in accessible names.
 * The DOM collector is read-only. Short, ambiguous copy has no language guess.
 */
export type Locale = "en" | "fr";
export type AttributeName = "aria-label" | "aria-description" | "alt" | "title" | "placeholder";

export interface AttributeCopy {
  readonly element: string;
  readonly attribute: AttributeName;
  readonly value: string;
  readonly inheritedLanguage: string;
  readonly explicitlyMarkedLanguage: string | null;
  readonly visible: boolean;
}

export interface AttributeLanguageFinding {
  readonly rule: "attribute-language" | "invalid-attribute-language";
  readonly element: string;
  readonly attribute: AttributeName;
  readonly detail: string;
}

export interface AttributeLanguageReport {
  readonly inspected: number;
  readonly findings: readonly AttributeLanguageFinding[];
}

const ATTRIBUTE_SET: ReadonlySet<string> = new Set([
  "aria-label", "aria-description", "alt", "title", "placeholder",
]);

/** Exact two-or-more-word English constructions; no blanket dictionary guess. */
const ENGLISH_SIGNALS = [
  /\b(?:the rest are unknown|fields in this record|choose the coordinator role)\b/i,
  /\b(?:nothing is sent|saved on this device|kept on this device)\b/i,
  /\b(?:enter a number|clear these filters|start a new search)\b/i,
  /\b(?:not provided|not available|no matching results)\b/i,
  /\b(?:open the details|close the dialog|go back to)\b/i,
  /\b(?:required field|search for places|select a category)\b/i,
  /\b(?:this record|this device|this page)\b/i,
] as const;

/** Counterparts for the mirror-direction check. */
const FRENCH_SIGNALS = [
  /\b(?:sur cet appareil|aucune donnée|aucun résultat)\b/i,
  /\b(?:champ obligatoire|rechercher des lieux|choisir une catégorie)\b/i,
  /\b(?:ouvrir les détails|fermer la fenêtre|retourner à)\b/i,
  /\b(?:dans cette fiche|cette page|non disponible)\b/i,
  /(?:les autres sont inconnus|rien n[’']est envoyé)/i,
] as const;

export function primaryLanguage(language: string): Locale | null {
  const match = /^(en|fr)(?:-[a-z0-9]{2,8})*$/i.exec(language.trim());
  return (match?.[1]?.toLowerCase() as Locale | undefined) ?? null;
}

export function isLanguageTag(language: string): boolean {
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language.trim());
}

export function normalizeAccessibleCopy(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Returns null when there is no strong lexical evidence. Proper names, numbers,
 * URLs, acronyms and brief labels never become language violations by default.
 */
export function likelyCopyLanguage(value: string): Locale | null {
  const copy = normalizeAccessibleCopy(value);
  if (copy.length < 12 || /^[\d\W]+$/u.test(copy)) return null;
  const english = ENGLISH_SIGNALS.some((signal) => signal.test(copy));
  const french = FRENCH_SIGNALS.some((signal) => signal.test(copy));
  if (english === french) return null;
  return english ? "en" : "fr";
}

function finding(
  rule: AttributeLanguageFinding["rule"],
  item: AttributeCopy,
  detail: string,
): AttributeLanguageFinding {
  return { rule, element: item.element, attribute: item.attribute, detail };
}

/**
 * Check only what the DOM actually exposes. A nested lang attribute takes
 * precedence over html[lang]. A known foreign-language phrase must be marked
 * on the element or an ancestor; an unknown phrase remains unclassified.
 */
export function attributeLanguageReport(
  items: readonly AttributeCopy[],
  documentLanguage: string,
): AttributeLanguageReport {
  const findings: AttributeLanguageFinding[] = [];
  const documentLocale = primaryLanguage(documentLanguage);
  let inspected = 0;
  for (const item of items) {
    if (!ATTRIBUTE_SET.has(item.attribute) || !item.visible) continue;
    const copy = normalizeAccessibleCopy(item.value);
    if (!copy) continue;
    inspected += 1;
    const marked = item.explicitlyMarkedLanguage;
    if (marked !== null && !isLanguageTag(marked)) {
      findings.push(finding("invalid-attribute-language", item, marked));
      continue;
    }
    const effective = primaryLanguage(marked ?? item.inheritedLanguage) ?? documentLocale;
    const copyLocale = likelyCopyLanguage(copy);
    if (effective && copyLocale && effective !== copyLocale) {
      findings.push(finding("attribute-language", item, `${copyLocale} copy inherits ${effective}: ${copy.slice(0, 90)}`));
    }
  }
  return { inspected, findings };
}

export function summarizeAttributeLanguageFindings(findings: readonly AttributeLanguageFinding[]): string {
  return findings.map((item) => `${item.rule} ${item.element} [${item.attribute}]: ${item.detail}`).join("\n");
}
