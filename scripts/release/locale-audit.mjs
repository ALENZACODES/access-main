/** Check bilingual metadata and explicit translation catalogue defects. */
import { finding, tokenizeHtml } from './site-audit.mjs';

const LANGUAGES = ['en', 'fr'];
const BANNED_OVERCLAIMS = [
  /\b(?:verified|real[ -]?time|partnership|guarantee(?:d|s)?)\b/gi,
  /(?<!\p{L})v[ée]rifi[ée](?:e|s|es)?(?!\p{L})/giu,
];
const FRENCH_STRAIGHT_APOSTROPHE = /\b(?:l|d|j|n|c|s|qu|jusqu|lorsqu|puisqu|aujourd)'(?=\p{L})/giu;
const FRENCH_COLON = /(?<!\u00a0):/gu;
const FRENCH_NARROW = /(?<!\u202f)[;!?]/gu;
const FRENCH_GUILLEMET_OPEN = /«(?!\u202f)/gu;
const FRENCH_GUILLEMET_CLOSE = /(?<!\u202f)»/gu;

export function baseLanguage(tag) {
  if (typeof tag !== 'string') return null;
  const match = /^(en|fr)(?:-[a-z]{2,8})?$/i.exec(tag.trim());
  return match ? match[1].toLowerCase() : null;
}

export function localisedPairs(value) {
  const output = [];
  const seen = new WeakSet();
  const walk = (node, pointer, depth) => {
    if (!node || typeof node !== 'object' || depth > 48 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${pointer}/${index}`, depth + 1));
      return;
    }
    const hasEn = Object.hasOwn(node, 'en');
    const hasFr = Object.hasOwn(node, 'fr');
    if (hasEn || hasFr) {
      // Do not regard random objects with en/fr flags as translations.
      const one = hasEn ? node.en : node.fr;
      if (typeof one === 'string' || typeof one === 'object' && one !== null) {
        output.push({ pointer, en: node.en, fr: node.fr, hasEn, hasFr });
      }
    }
    for (const [key, entry] of Object.entries(node)) {
      if (key === 'en' || key === 'fr') continue;
      walk(entry, `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, depth + 1);
    }
  };
  walk(value, '', 0);
  return output;
}

export function inspectTranslationPairs(json, file) {
  const issues = [];
  for (const pair of localisedPairs(json)) {
    if (!pair.hasEn || !pair.hasFr) {
      issues.push(finding('TRANSLATION_MISSING', file,
        `${pair.pointer || '/'}: paired en/fr values required`));
      continue;
    }
    if (typeof pair.en !== 'string' || typeof pair.fr !== 'string') {
      issues.push(finding('TRANSLATION_TYPE', file,
        `${pair.pointer || '/'}: both translations must be text`));
      continue;
    }
    if (!pair.en.trim() || !pair.fr.trim()) {
      issues.push(finding('TRANSLATION_EMPTY', file,
        `${pair.pointer || '/'}: empty translation`));
    }
    issues.push(...inspectUserCopy(pair.en, 'en', file, `${pair.pointer}/en`));
    issues.push(...inspectUserCopy(pair.fr, 'fr', file, `${pair.pointer}/fr`));
  }
  return issues;
}

export function inspectUserCopy(text, language, file, pointer = '') {
  const issues = [];
  if (typeof text !== 'string') return issues;
  for (const pattern of BANNED_OVERCLAIMS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      issues.push(finding('COPY_OVERCLAIM', file,
        `${pointer || '/'}: unsupported claim language`));
    }
  }
  if (language !== 'fr') return issues;
  for (const [code, expression] of [
    ['FR_APOSTROPHE', FRENCH_STRAIGHT_APOSTROPHE],
    ['FR_COLON_SPACE', FRENCH_COLON],
    ['FR_NARROW_SPACE', FRENCH_NARROW],
    ['FR_GUILLEMET_OPEN', FRENCH_GUILLEMET_OPEN],
    ['FR_GUILLEMET_CLOSE', FRENCH_GUILLEMET_CLOSE],
  ]) {
    expression.lastIndex = 0;
    if (expression.test(text)) {
      issues.push(finding(code, file,
        `${pointer || '/'}: French punctuation spacing or apostrophe`));
    }
  }
  return issues;
}

export function htmlLanguage(html) {
  const tag = tokenizeHtml(html).find((entry) => entry.name === 'html');
  return baseLanguage(tag?.attrs.lang);
}

export function htmlTextContent(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, '\u00a0')
    .replace(/&thinsp;/gi, '\u202f')
    .replace(/&rsquo;/gi, '’').replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»').replace(/&amp;/gi, '&')
    .replace(/[ \t\r\n\f]+/g, ' ').trim();
}

export function inspectHtmlLocale(html, file) {
  const issues = [];
  const tags = tokenizeHtml(html);
  const language = htmlLanguage(html);
  const langTags = tags.filter((tag) => tag.attrs.lang !== undefined);
  for (const tag of langTags) {
    if (!baseLanguage(tag.attrs.lang)) {
      issues.push(finding('UNSUPPORTED_LANG', file,
        `Unsupported element language on ${tag.name}`));
    }
  }
  // Only assess literal rendered text. Strings constructed by JS belong in
  // the separately inspected translation catalogues.
  const literal = htmlTextContent(html);
  issues.push(...inspectUserCopy(literal, language, file, '/document'));
  const alternates = tags.filter((tag) => tag.name === 'link' &&
    (tag.attrs.rel ?? '').toLowerCase().split(/\s+/).includes('alternate') &&
    tag.attrs.hreflang !== undefined);
  const seen = new Set();
  for (const alt of alternates) {
    const lang = baseLanguage(alt.attrs.hreflang);
    if (!lang || !alt.attrs.href) {
      issues.push(finding('LOCALE_ALTERNATE', file, 'Invalid alternate language link'));
    } else if (seen.has(lang)) {
      issues.push(finding('LOCALE_DUPLICATE', file,
        `Duplicate alternate language: ${lang}`));
    } else seen.add(lang);
  }
  return issues;
}

export function translationCoverage(catalogue) {
  const pairs = localisedPairs(catalogue);
  return {
    total: pairs.length,
    complete: pairs.filter((pair) => pair.hasEn && pair.hasFr &&
      typeof pair.en === 'string' && typeof pair.fr === 'string' &&
      pair.en.trim() && pair.fr.trim()).length,
    missing: pairs.filter((pair) => !pair.hasEn || !pair.hasFr).length,
  };
}

/**
 * Optional catalogue variant: { en: { key: text }, fr: { key: text } }.
 * Call this for explicitly marked catalogue files only; ordinary locale
 * data may use en/fr as values with different semantics.
 */
export function inspectKeyedCatalogue(document, file) {
  const issues = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return [finding('CATALOGUE_SHAPE', file, 'Expected an object')];
  }
  for (const language of LANGUAGES) {
    if (!document[language] || typeof document[language] !== 'object' ||
      Array.isArray(document[language])) {
      issues.push(finding('CATALOGUE_LANG', file,
        `Missing object for ${language}`));
    }
  }
  if (issues.length) return issues;
  const en = flattenMessages(document.en);
  const fr = flattenMessages(document.fr);
  const keys = new Set([...en.keys(), ...fr.keys()]);
  for (const key of [...keys].sort()) {
    if (!en.has(key) || !fr.has(key)) {
      issues.push(finding('CATALOGUE_KEY', file, `Missing EN/FR key: ${key}`));
      continue;
    }
    const a = en.get(key);
    const b = fr.get(key);
    if (!a.trim() || !b.trim()) {
      issues.push(finding('CATALOGUE_EMPTY', file, `Empty message: ${key}`));
    }
    const aVars = placeholders(a);
    const bVars = placeholders(b);
    if (aVars.join('|') !== bVars.join('|')) {
      issues.push(finding('CATALOGUE_PLACEHOLDER', file,
        `Placeholders differ: ${key}`));
    }
    issues.push(...inspectUserCopy(a, 'en', file, `/en/${key}`));
    issues.push(...inspectUserCopy(b, 'fr', file, `/fr/${key}`));
  }
  return issues;
}

export function flattenMessages(object, prefix = '', output = new Map()) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') output.set(path, value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenMessages(value, path, output);
    }
  }
  return output;
}

export function placeholders(message) {
  return [...new Set([...message.matchAll(/\{([a-zA-Z][\w]*)\}/g)]
    .map((match) => match[1]))].sort();
}

export function isCatalogueName(name) {
  return /(?:^|\/)(?:messages|translations|catalogue|i18n)(?:\.[a-z-]+)?\.json$/i.test(name);
}
