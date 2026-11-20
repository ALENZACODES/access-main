/**
 * "On this panel": a short list of links to the panel's sections, built from the section headings
 * that are actually present. A long page is easier to move through with keyboard or screen reader
 * when there is one place that lists every section. Links are plain in-page anchors.
 */
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';
import { escapeHtml } from './sourceList';

export interface TocEntry {
  id: string;
  text: string;
}

/** Fewer sections than this and a list of links is more noise than help. */
export const MIN_TOC_ENTRIES = 3;

const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function decodeBasicEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
}

/** Level-2 headings that carry an id, in page order, without repeats. */
export function buildToc(html: string): TocEntry[] {
  const out: TocEntry[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<h2\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)) {
    const id = m[1];
    const text = decodeBasicEntities((m[2] ?? '').replace(/<[^>]*>/g, ' ').replace(/[ \t\r\n]+/g, ' ').trim());
    if (id === undefined || text === '' || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, text });
  }
  return out;
}

type Key = 'toc.title' | 'toc.help' | 'toc.pick' | 'toc.go';

const MESSAGES: Messages<Key> = {
  en: { 'toc.title': 'On this panel', 'toc.help': 'Jump to a section.', 'toc.pick': 'Section', 'toc.go': 'Go to this section' },
  fr: { 'toc.title': 'Dans ce panneau', 'toc.help': 'Accéder directement à une section.', 'toc.pick': 'Section', 'toc.go': 'Aller à cette section' },
};

export const TOC_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

const LINK_STYLE = 'display:inline-flex;align-items:center;min-width:44px;min-height:44px';

export type TocMode = 'links' | 'jump';

export const TOC_GO_ACTION = 'toc-go';
export const TOC_SELECT_ID = 'ds-toc-go';

const FIELD_STYLE = 'min-height:44px;min-width:44px;font:inherit';
const BUTTON_STYLE = 'min-width:44px;min-height:44px;padding:0 16px;font:inherit';

/**
 * The way to the sections of the panel. As links, there is one link per section: right for a
 * page read without scripts. As a jump menu, there is one list and one button, so a person
 * crossing the panel with the Tab key meets two stops here and not one per section.
 */
export function renderTocHtml(entries: readonly TocEntry[], locale: Locale, mode: TocMode = 'links'): string {
  if (entries.length < MIN_TOC_ENTRIES) return '';
  const open = `<nav aria-labelledby="ds-toc-title"><h2 id="ds-toc-title">${escapeHtml(tx(locale, 'toc.title'))}</h2>`;
  if (mode === 'jump') {
    const options = entries.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.text)}</option>`).join('');
    return (
      `${open}<div><label for="${TOC_SELECT_ID}">${escapeHtml(tx(locale, 'toc.pick'))}</label> ` +
      `<select id="${TOC_SELECT_ID}" data-filter="tocTarget" style="${FIELD_STYLE}">${options}</select> ` +
      `<button type="button" data-action="${TOC_GO_ACTION}" style="${BUTTON_STYLE}">${escapeHtml(tx(locale, 'toc.go'))}</button></div></nav>`
    );
  }
  const items = entries.map((e) => `<li><a href="#${escapeHtml(e.id)}" style="${LINK_STYLE}">${escapeHtml(e.text)}</a></li>`).join('');
  return `${open}<p>${escapeHtml(tx(locale, 'toc.help'))}</p><ul>${items}</ul></nav>`;
}
