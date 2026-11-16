import type { HtmlNode, HtmlRule } from './htmllint.js';

/**
 * More static markup rules, kept apart from htmllint.ts so that file stays
 * readable. A rule that needs a person to judge returns status "unknown".
 */

export interface ExtraHit {
  readonly rule: HtmlRule;
  readonly node: HtmlNode;
  readonly status?: 'fail' | 'unknown';
  readonly extra?: { readonly en: string; readonly fr: string };
}

/** Values the HTML standard allows in autocomplete for the fields these rules know about. */
export const AUTOCOMPLETE_TOKENS: ReadonlySet<string> = new Set([
  'off', 'on', 'name', 'honorific-prefix', 'given-name', 'additional-name', 'family-name', 'honorific-suffix', 'nickname',
  'email', 'username', 'new-password', 'current-password', 'one-time-code', 'organization-title', 'organization',
  'street-address', 'address-line1', 'address-line2', 'address-line3', 'address-level4', 'address-level3', 'address-level2',
  'address-level1', 'country', 'country-name', 'postal-code', 'cc-name', 'cc-given-name', 'cc-additional-name',
  'cc-family-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type', 'transaction-currency',
  'transaction-amount', 'language', 'bday', 'bday-day', 'bday-month', 'bday-year', 'sex', 'url', 'photo', 'tel',
  'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-local-prefix', 'tel-local-suffix', 'tel-extension',
  'impp', 'webauthn',
]);

const SECTION_OR_HINT = /^(section-\S+|shipping|billing|home|work|mobile|fax|pager)$/;

/** True when every token of an autocomplete value is allowed. */
export function validAutocomplete(value: string): boolean {
  const tokens = value.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let i = 0;
  while (i < tokens.length - 1 && SECTION_OR_HINT.test(tokens[i] ?? '')) i++;
  const rest = tokens.slice(i);
  if (rest.length !== 1) return false;
  const last = rest[0] ?? '';
  return AUTOCOMPLETE_TOKENS.has(last);
}

const INTERACTIVE_TAGS = new Set(['a', 'button', 'select', 'textarea', 'input', 'summary']);
const LANDMARKS: Readonly<Record<string, string>> = { nav: 'navigation', aside: 'complementary' };
const GROUP_ROLES = new Set(['group', 'radiogroup']);

const attr = (n: HtmlNode, name: string): string => (n.attrs[name] ?? '').trim();

function ancestors(nodes: readonly HtmlNode[], n: HtmlNode): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (let p = nodes[n.parent]; p; p = nodes[p.parent]) out.push(p);
  return out;
}

function descendants(nodes: readonly HtmlNode[], n: HtmlNode): HtmlNode[] {
  const out: HtmlNode[] = [];
  const walk = (x: HtmlNode): void => {
    for (const c of x.children) {
      const child = nodes[c];
      if (child) {
        out.push(child);
        walk(child);
      }
    }
  };
  walk(n);
  return out;
}

function isInteractive(n: HtmlNode): boolean {
  if (n.tag === 'a') return n.attrs['href'] !== undefined;
  if (n.tag === 'input') return attr(n, 'type').toLowerCase() !== 'hidden';
  return INTERACTIVE_TAGS.has(n.tag);
}

/** Text a heading or label would be read as: own text, image alt, aria-label. */
function readable(nodes: readonly HtmlNode[], n: HtmlNode): string {
  if (attr(n, 'aria-label') || attr(n, 'aria-labelledby')) return 'x';
  const parts = [n.text];
  for (const d of descendants(nodes, n)) {
    if (d.tag === 'img') parts.push(d.attrs['alt'] ?? '');
    if (attr(d, 'aria-label')) parts.push(attr(d, 'aria-label'));
  }
  return parts.join(' ').trim();
}

export function extraHtmlRules(nodes: readonly HtmlNode[]): ExtraHit[] {
  const hits: ExtraHit[] = [];

  // Tables: a data table needs header cells. A table that lays out content is allowed.
  for (const n of nodes) {
    if (n.tag !== 'table') continue;
    const role = attr(n, 'role');
    if (role === 'presentation' || role === 'none') continue;
    const inner = descendants(nodes, n);
    const hasData = inner.some((d) => d.tag === 'td');
    const hasHeader = inner.some((d) => d.tag === 'th');
    if (hasData && !hasHeader) hits.push({ rule: 'table-headers', node: n });
    const named = inner.some((d) => d.tag === 'caption' && d.text.trim() !== '') || attr(n, 'aria-label') !== '' || attr(n, 'aria-labelledby') !== '';
    if (hasData && hasHeader && !named) hits.push({ rule: 'table-caption', node: n, status: 'unknown' });
  }

  // Radio buttons with one name belong in a group with a name of its own.
  const radios = new Map<string, HtmlNode[]>();
  for (const n of nodes) {
    if (n.tag === 'input' && attr(n, 'type').toLowerCase() === 'radio' && attr(n, 'name')) {
      const k = attr(n, 'name');
      radios.set(k, [...(radios.get(k) ?? []), n]);
    }
  }
  for (const group of radios.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      const grouped = ancestors(nodes, r).some((a) => a.tag === 'fieldset' || GROUP_ROLES.has(attr(a, 'role')));
      if (!grouped) {
        hits.push({ rule: 'fieldset-legend', node: r });
        break;
      }
    }
  }
  for (const n of nodes) {
    if (n.tag !== 'fieldset') continue;
    const legend = descendants(nodes, n).find((d) => d.tag === 'legend');
    if ((!legend || !legend.text.trim()) && !attr(n, 'aria-label') && !attr(n, 'aria-labelledby')) {
      hits.push({ rule: 'fieldset-legend', node: n, extra: { en: 'The fieldset has no legend.', fr: 'Le fieldset n’a pas de legend.' } });
    }
  }

  for (const n of nodes) {
    // A control inside another control cannot be used reliably with a keyboard or a screen reader.
    if (isInteractive(n) && n.tag !== 'input') {
      const inner = descendants(nodes, n).find(isInteractive);
      if (inner) hits.push({ rule: 'nested-interactive', node: inner });
    }
    if (/^h[1-6]$/.test(n.tag) && !readable(nodes, n)) hits.push({ rule: 'empty-heading', node: n });
    if (n.tag === 'svg') {
      const hidden = ancestors(nodes, n).concat(n).some((a) => attr(a, 'aria-hidden') === 'true');
      const named = attr(n, 'aria-label') !== '' || attr(n, 'aria-labelledby') !== '' || descendants(nodes, n).some((d) => d.tag === 'title' && d.text.trim() !== '');
      if (!hidden && attr(n, 'role') === 'img' && !named) hits.push({ rule: 'svg-name', node: n });
      else if (!hidden && attr(n, 'role') !== 'img' && !named && !inInteractive(nodes, n)) {
        hits.push({ rule: 'svg-name', node: n, status: 'unknown', extra: { en: 'Is it decorative? If so, add aria-hidden.', fr: 'Est-il décoratif\u202F? Si oui, ajoutez aria-hidden.' } });
      }
    }
    if (n.tag === 'video') {
      const tracks = descendants(nodes, n).filter((d) => d.tag === 'track');
      if (!tracks.some((t) => ['captions', 'subtitles'].includes(attr(t, 'kind').toLowerCase()))) hits.push({ rule: 'media-captions', node: n, status: 'unknown' });
    }
    if (n.tag === 'audio') {
      hits.push({ rule: 'media-captions', node: n, status: 'unknown', extra: { en: 'Check that a transcript exists.', fr: 'Contrôlez qu’une transcription existe.' } });
    }
    if (n.tag === 'meta' && attr(n, 'http-equiv').toLowerCase() === 'refresh') {
      const secs = Number.parseFloat(attr(n, 'content'));
      if (Number.isFinite(secs) && secs > 0) hits.push({ rule: 'meta-refresh', node: n });
    }
    const ac = attr(n, 'autocomplete');
    if (ac && (n.tag === 'input' || n.tag === 'select' || n.tag === 'textarea') && !validAutocomplete(ac)) hits.push({ rule: 'autocomplete-token', node: n });
    if (n.tag === 'li') {
      const p = nodes[n.parent];
      if (!p || !['ul', 'ol', 'menu'].includes(p.tag)) hits.push({ rule: 'list-structure', node: n });
    }
    const lang = attr(n, 'lang');
    if (lang && n.tag !== 'html' && !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(lang)) hits.push({ rule: 'lang-part', node: n });
  }

  // The same landmark more than once needs names that tell the copies apart.
  const byRole = new Map<string, HtmlNode[]>();
  for (const n of nodes) {
    const role = attr(n, 'role') || LANDMARKS[n.tag] || '';
    if (role === 'navigation' || role === 'complementary') byRole.set(role, [...(byRole.get(role) ?? []), n]);
  }
  for (const list of byRole.values()) {
    if (list.length < 2) continue;
    const names = list.map((n) => attr(n, 'aria-label') || (attr(n, 'aria-labelledby') ? attr(n, 'aria-labelledby') : ''));
    list.forEach((n, i) => {
      const name = names[i] ?? '';
      if (name === '' || names.indexOf(name) !== i) hits.push({ rule: 'landmark-label', node: n });
    });
  }

  for (const n of nodes) {
    // An invalid field has to say what is wrong, not only turn red.
    if (attr(n, 'aria-invalid') === 'true' && !attr(n, 'aria-describedby') && !attr(n, 'aria-errormessage')) hits.push({ rule: 'invalid-describedby', node: n });
    if (n.attrs['autofocus'] !== undefined) hits.push({ rule: 'autofocus', node: n, status: 'unknown' });
    if (n.tag === 'details' && !descendants(nodes, n).some((d) => d.tag === 'summary' && n.children.includes(d.index))) hits.push({ rule: 'details-summary', node: n });
    if (n.tag === 'dialog' || attr(n, 'role') === 'dialog' || attr(n, 'role') === 'alertdialog') {
      const named = attr(n, 'aria-label') !== '' || attr(n, 'aria-labelledby') !== '';
      if (!named) hits.push({ rule: 'dialog-name', node: n });
    }
  }

  // Alternate language links, when a page has them, must use real language codes.
  const root = nodes.find((n) => n.tag === 'html');
  if (root) {
    const alternates = nodes.filter((n) => n.tag === 'link' && attr(n, 'rel').toLowerCase().split(/\s+/).includes('alternate') && n.attrs['hreflang'] !== undefined);
    for (const a of alternates) {
      const code = attr(a, 'hreflang');
      if (code !== 'x-default' && !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(code)) hits.push({ rule: 'hreflang-code', node: a });
    }
  }

  // Two controls with one access key fight over it.
  const keys = new Map<string, HtmlNode>();
  for (const n of nodes) {
    const k = attr(n, 'accesskey').toLowerCase();
    if (!k) continue;
    if (keys.has(k)) hits.push({ rule: 'accesskey-dup', node: n });
    else keys.set(k, n);
  }
  return hits;
}

function inInteractive(nodes: readonly HtmlNode[], n: HtmlNode): boolean {
  return ancestors(nodes, n).some(isInteractive);
}
