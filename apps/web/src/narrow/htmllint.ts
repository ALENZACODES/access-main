import { extraHtmlRules } from './htmlextra.js';
import { clip, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Static markup checks for an HTML document or fragment. It reads the text of
 * the markup only (no scripts run, no CSS applied), so it can lint a built
 * index.html in CI without a browser. The parser is small and forgiving; it is
 * not a full HTML5 parser.
 */

export interface HtmlNode {
  readonly index: number;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly line: number;
  readonly parent: number;
  readonly children: number[];
  /** Own and descendant text, whitespace collapsed. */
  text: string;
  /** Text directly inside this element. */
  own: string;
}

export interface ParsedHtml {
  readonly doctype: boolean;
  readonly isDocument: boolean;
  readonly nodes: readonly HtmlNode[];
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);

const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/y;
const CLOSE_TAG = /<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/y;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function decode(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function parseHtml(html: string): ParsedHtml {
  const nodes: HtmlNode[] = [];
  const stack: number[] = [];
  let doctype = false;
  let line = 1;
  let i = 0;
  let buf = '';
  const addText = (raw: string): void => {
    const text = decode(raw).replace(/\s+/g, ' ');
    if (!text.trim()) return;
    const top = stack[stack.length - 1];
    if (top !== undefined) {
      const n = nodes[top];
      if (n) n.own = `${n.own} ${text}`.trim();
    }
    for (const s of stack) {
      const n = nodes[s];
      if (n) n.text = `${n.text} ${text}`.trim();
    }
  };
  const flush = (): void => {
    if (buf) addText(buf);
    buf = '';
  };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      buf += html.slice(i);
      break;
    }
    if (lt > i) {
      const chunk = html.slice(i, lt);
      buf += chunk;
      line += chunk.split('\n').length - 1;
    }
    i = lt;
    if (html.startsWith('<!--', i)) {
      flush();
      const end = html.indexOf('-->', i + 4);
      const stop = end === -1 ? html.length : end + 3;
      line += html.slice(i, stop).split('\n').length - 1;
      i = stop;
      continue;
    }
    if (/^<!doctype/i.test(html.slice(i, i + 9))) {
      flush();
      doctype = true;
      const end = html.indexOf('>', i);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    OPEN_TAG.lastIndex = i;
    const open = OPEN_TAG.exec(html);
    if (open) {
      flush();
      const tag = (open[1] ?? '').toLowerCase();
      const attrs: Record<string, string> = {};
      for (const m of (open[2] ?? '').matchAll(ATTR)) {
        const name = (m[1] ?? '').toLowerCase();
        if (name && !(name in attrs)) attrs[name] = decode(m[2] ?? m[3] ?? m[4] ?? '');
      }
      const parent = stack[stack.length - 1] ?? -1;
      const node: HtmlNode = { index: nodes.length, tag, attrs, line, parent, children: [], text: '', own: '' };
      nodes.push(node);
      if (parent >= 0) nodes[parent]?.children.push(node.index);
      line += open[0].split('\n').length - 1;
      i += open[0].length;
      if (RAW.has(tag) && !open[3]) {
        const close = html.toLowerCase().indexOf(`</${tag}`, i);
        const stop = close === -1 ? html.length : close;
        line += html.slice(i, stop).split('\n').length - 1;
        i = stop;
        continue;
      }
      if (!VOID.has(tag) && !open[3]) stack.push(node.index);
      continue;
    }
    CLOSE_TAG.lastIndex = i;
    const close = CLOSE_TAG.exec(html);
    if (close) {
      flush();
      const tag = (close[1] ?? '').toLowerCase();
      for (let k = stack.length - 1; k >= 0; k--) {
        if (nodes[stack[k] ?? -1]?.tag === tag) {
          stack.length = k;
          break;
        }
      }
      i += close[0].length;
      continue;
    }
    buf += '<';
    i += 1;
  }
  flush();
  return { doctype, isDocument: nodes.some((n) => n.tag === 'html'), nodes };
}

export type HtmlRule =
  | 'doctype'
  | 'lang'
  | 'title'
  | 'viewport'
  | 'headings'
  | 'img-alt'
  | 'name'
  | 'label'
  | 'dup-id'
  | 'aria-ref'
  | 'tabindex'
  | 'autocomplete'
  | 'main'
  | 'link-text'
  | 'target-inline'
  | 'aria-hidden-focus'
  | 'iframe-title'
  | 'autoplay'
  | 'table-headers'
  | 'table-caption'
  | 'fieldset-legend'
  | 'nested-interactive'
  | 'empty-heading'
  | 'svg-name'
  | 'media-captions'
  | 'meta-refresh'
  | 'autocomplete-token'
  | 'list-structure'
  | 'lang-part'
  | 'landmark-label'
  | 'accesskey-dup'
  | 'invalid-describedby'
  | 'autofocus'
  | 'details-summary'
  | 'dialog-name'
  | 'hreflang-code';

export const HTML_RULES: readonly HtmlRule[] = [
  'doctype', 'lang', 'title', 'viewport', 'headings', 'img-alt', 'name', 'label', 'dup-id', 'aria-ref',
  'tabindex', 'autocomplete', 'main', 'link-text', 'target-inline', 'aria-hidden-focus', 'iframe-title', 'autoplay',
  'table-headers', 'table-caption', 'fieldset-legend', 'nested-interactive', 'empty-heading', 'svg-name', 'media-captions',
  'meta-refresh', 'autocomplete-token', 'list-structure', 'lang-part', 'landmark-label', 'accesskey-dup',
  'invalid-describedby', 'autofocus', 'details-summary', 'dialog-name', 'hreflang-code',
];

const MESSAGES: Readonly<Record<HtmlRule, { en: string; fr: string }>> = {
  doctype: { en: 'The document has no doctype.', fr: 'Le document n’a pas de doctype.' },
  lang: { en: 'The html element has no valid lang attribute.', fr: 'L’élément html n’a pas d’attribut lang valide.' },
  title: { en: 'The page has no title.', fr: 'La page n’a pas de titre.' },
  viewport: {
    en: 'The viewport meta tag is missing or blocks zooming.',
    fr: 'La balise meta viewport est absente ou empêche le zoom.',
  },
  headings: { en: 'Heading levels are not in order.', fr: 'Les niveaux de titre ne sont pas dans l’ordre.' },
  'img-alt': { en: 'Image has no alt attribute.', fr: 'L’image n’a pas d’attribut alt.' },
  name: { en: 'Control has no accessible name.', fr: 'Le contrôle n’a pas de nom accessible.' },
  label: { en: 'Form field has no label.', fr: 'Le champ de formulaire n’a pas d’étiquette.' },
  'dup-id': { en: 'The id is used more than once.', fr: 'L’identifiant est utilisé plus d’une fois.' },
  'aria-ref': { en: 'The reference points to an id that does not exist.', fr: 'La référence pointe vers un identifiant inexistant.' },
  tabindex: { en: 'A positive tabindex changes the focus order.', fr: 'Un tabindex positif modifie l’ordre du focus.' },
  autocomplete: {
    en: 'The field may need an autocomplete value. Check by hand.',
    fr: 'Le champ pourrait nécessiter une valeur autocomplete. À examiner à la main.',
  },
  main: { en: 'The page needs exactly one main landmark.', fr: 'La page doit avoir exactement un repère main.' },
  'link-text': { en: 'The link text is generic. Check that it makes sense alone.', fr: 'Le texte du lien est générique. Assurez-vous qu’il se comprend seul.' },
  'target-inline': {
    en: 'The inline size of this control is under 44px.',
    fr: 'La taille en ligne de ce contrôle est inférieure à 44\u00A0px.',
  },
  'aria-hidden-focus': { en: 'A focusable control is inside aria-hidden content.', fr: 'Un contrôle focalisable se trouve dans un contenu aria-hidden.' },
  'iframe-title': { en: 'The iframe has no title.', fr: 'L’iframe n’a pas de titre.' },
  autoplay: { en: 'Media starts playing with sound.', fr: 'Le média démarre avec du son.' },
  'table-headers': { en: 'The data table has no header cells (th).', fr: 'Le tableau de données n’a pas de cellules d’en-tête (th).' },
  'table-caption': { en: 'The table has no caption or name. Check that its purpose is clear.', fr: 'Le tableau n’a ni légende ni nom. Contrôlez que son objet est clair.' },
  'fieldset-legend': { en: 'Related radio buttons are not in a named group.', fr: 'Des boutons radio liés ne sont pas dans un groupe nommé.' },
  'nested-interactive': { en: 'A control is inside another control.', fr: 'Un contrôle se trouve dans un autre contrôle.' },
  'empty-heading': { en: 'The heading is empty.', fr: 'Le titre est vide.' },
  'svg-name': { en: 'The graphic has no accessible name.', fr: 'Le graphique n’a pas de nom accessible.' },
  'media-captions': { en: 'The media may need captions. Check by hand.', fr: 'Le média pourrait nécessiter des sous-titres. À contrôler à la main.' },
  'meta-refresh': { en: 'The page reloads or redirects by itself after a delay.', fr: 'La page se recharge ou redirige d’elle-même après un délai.' },
  'autocomplete-token': { en: 'The autocomplete value is not a valid token.', fr: 'La valeur autocomplete n’est pas un jeton valide.' },
  'list-structure': { en: 'A list item is not inside a list.', fr: 'Un élément de liste n’est pas dans une liste.' },
  'lang-part': { en: 'The lang attribute is not a valid language code.', fr: 'L’attribut lang n’est pas un code de langue valide.' },
  'landmark-label': { en: 'Repeated landmarks need different names.', fr: 'Les repères répétés doivent avoir des noms différents.' },
  'accesskey-dup': { en: 'The access key is used more than once.', fr: 'La touche d’accès est utilisée plus d’une fois.' },
  'invalid-describedby': { en: 'The field is marked invalid but points to no error message.', fr: 'Le champ est marqué invalide mais ne pointe vers aucun message d’erreur.' },
  autofocus: { en: 'Focus moves by itself when the page loads. Check that this helps and does not skip content.', fr: 'Le focus se déplace seul au chargement de la page. Contrôlez que cela aide et ne fait pas sauter de contenu.' },
  'details-summary': { en: 'The details element has no summary as its first child.', fr: 'L’élément details n’a pas de summary comme premier enfant.' },
  'dialog-name': { en: 'The dialog has no accessible name.', fr: 'La boîte de dialogue n’a pas de nom accessible.' },
  'hreflang-code': { en: 'The hreflang value is not a valid language code.', fr: 'La valeur hreflang n’est pas un code de langue valide.' },
};

const REVIEW: ReadonlySet<HtmlRule> = new Set<HtmlRule>(['autocomplete', 'link-text', 'table-caption', 'media-captions', 'autofocus']);

const GENERIC_LINKS = new Set([
  'click here', 'here', 'read more', 'more', 'learn more', 'link', 'cliquez ici', 'ici', 'en savoir plus', 'lire la suite', 'plus',
]);

const AUTOCOMPLETE_NAMES = new Set(['email', 'tel', 'phone', 'first-name', 'last-name', 'given-name', 'family-name', 'address', 'postal-code', 'postal', 'city']);

const NO_LABEL_INPUT = new Set(['hidden', 'button', 'submit', 'reset', 'image']);

function nodeId(n: HtmlNode): string {
  return `${n.tag}${n.attrs['id'] ? '#' + n.attrs['id'] : ''}@L${n.line}`;
}

/** Text content plus the alt text of images inside the node. */
function textWithAlt(nodes: readonly HtmlNode[], n: HtmlNode): string {
  const parts: string[] = [n.own];
  for (const c of n.children) {
    const child = nodes[c];
    if (!child) continue;
    parts.push(child.tag === 'img' ? (child.attrs['alt'] ?? '') : textWithAlt(nodes, child));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function lintHtml(html: string, opts: { readonly fragment?: boolean } = {}): CheckResult {
  const doc = parseHtml(html);
  const { nodes } = doc;
  const isDocument = doc.isDocument && !opts.fragment;
  const entries: Entry[] = [];
  const byId = new Map<string, HtmlNode>();
  const add = (rule: HtmlRule, id: string, status: EntryStatus = REVIEW.has(rule) ? 'unknown' : 'fail', extra?: { en: string; fr: string }): void => {
    const base = MESSAGES[rule];
    entries.push({
      check: 'static-html',
      id,
      status,
      rule,
      message: extra ? { en: `${base.en} ${extra.en}`, fr: `${base.fr} ${extra.fr}` } : base,
    });
  };
  const attr = (n: HtmlNode, name: string): string => (n.attrs[name] ?? '').trim();
  const refText = (ids: string): string =>
    ids
      .split(/\s+/)
      .map((x) => (byId.get(x)?.text ?? ''))
      .join(' ')
      .trim();

  const seen = new Set<string>();
  for (const n of nodes) {
    const id = n.attrs['id'];
    if (id === undefined || id === '') continue;
    if (seen.has(id)) add('dup-id', nodeId(n));
    else {
      seen.add(id);
      byId.set(id, n);
    }
  }

  if (isDocument) {
    if (!doc.doctype) add('doctype', 'html');
    const html = nodes.find((n) => n.tag === 'html');
    if (html && !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(attr(html, 'lang'))) add('lang', nodeId(html));
    const title = nodes.find((n) => n.tag === 'title');
    if (!title || !title.text.trim()) add('title', title ? nodeId(title) : 'html');
    const vp = nodes.find((n) => n.tag === 'meta' && attr(n, 'name').toLowerCase() === 'viewport');
    if (!vp) add('viewport', 'html');
    else {
      const c = attr(vp, 'content').toLowerCase();
      const max = /maximum-scale\s*=\s*([0-9.]+)/.exec(c);
      if (/user-scalable\s*=\s*(no|0)/.test(c) || (max && Number(max[1]) < 2)) add('viewport', nodeId(vp));
    }
    const mains = nodes.filter((n) => n.tag === 'main' || attr(n, 'role') === 'main');
    if (mains.length !== 1) add('main', mains[1] ? nodeId(mains[1]) : 'html');
    if (!nodes.some((n) => n.tag === 'h1')) add('headings', 'html', 'fail', { en: 'There is no h1.', fr: 'Il n’y a pas de h1.' });
  }

  let prevLevel = 0;
  for (const n of nodes) {
    const m = /^h([1-6])$/.exec(n.tag);
    if (!m) continue;
    const level = Number(m[1]);
    if (prevLevel > 0 && level > prevLevel + 1) {
      add('headings', nodeId(n), 'fail', { en: `It jumps from h${prevLevel} to h${level}.`, fr: `Il passe de h${prevLevel} à h${level}.` });
    }
    prevLevel = level;
  }

  const isFocusable = (n: HtmlNode): boolean => {
    if (n.attrs['disabled'] !== undefined) return false;
    const ti = attr(n, 'tabindex');
    if (ti !== '') return ti !== '-1';
    if (n.tag === 'a') return n.attrs['href'] !== undefined;
    if (n.tag === 'input') return attr(n, 'type').toLowerCase() !== 'hidden';
    return ['button', 'select', 'textarea', 'summary'].includes(n.tag);
  };
  const hiddenAncestor = (n: HtmlNode): boolean => {
    for (let p: HtmlNode | undefined = n; p; p = nodes[p.parent]) if (attr(p, 'aria-hidden') === 'true') return true;
    return false;
  };
  const labelledBy = (n: HtmlNode): boolean => {
    if (attr(n, 'aria-label')) return true;
    const lb = attr(n, 'aria-labelledby');
    if (lb && refText(lb)) return true;
    return attr(n, 'title') !== '';
  };

  for (const n of nodes) {
    const id = nodeId(n);
    const type = attr(n, 'type').toLowerCase();
    const role = attr(n, 'role');
    if (n.tag === 'img' && n.attrs['alt'] === undefined && role !== 'presentation' && role !== 'none' && attr(n, 'aria-hidden') !== 'true') {
      add('img-alt', id);
    }
    const buttonLike =
      n.tag === 'button' || n.tag === 'summary' || role === 'button' || role === 'link' || (n.tag === 'a' && n.attrs['href'] !== undefined) ||
      (n.tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset'));
    if (buttonLike && !hiddenAncestor(n)) {
      const own = n.tag === 'input' ? attr(n, 'value') : textWithAlt(nodes, n);
      if (!own && !labelledBy(n)) add('name', id);
      if (n.tag === 'a' && GENERIC_LINKS.has(own.toLowerCase().replace(/[.!…]+$/, ''))) add('link-text', id);
    }
    if (n.tag === 'input' && type === 'image' && !attr(n, 'alt') && !labelledBy(n)) add('name', id);
    const field = (n.tag === 'input' && !NO_LABEL_INPUT.has(type)) || n.tag === 'select' || n.tag === 'textarea';
    if (field && !hiddenAncestor(n)) {
      let ok = labelledBy(n);
      if (!ok && n.attrs['id']) ok = nodes.some((l) => l.tag === 'label' && l.attrs['for'] === n.attrs['id'] && l.text.trim() !== '');
      for (let p: HtmlNode | undefined = nodes[n.parent]; p && !ok; p = nodes[p.parent]) if (p.tag === 'label' && p.text.trim()) ok = true;
      if (!ok) add('label', id);
      const ac = attr(n, 'autocomplete');
      const nm = attr(n, 'name').toLowerCase();
      if (!ac && (type === 'email' || type === 'tel' || type === 'password' || AUTOCOMPLETE_NAMES.has(nm))) add('autocomplete', id);
    }
    for (const a of ['aria-labelledby', 'aria-describedby']) {
      const v = attr(n, a);
      if (v && v.split(/\s+/).some((x) => !byId.has(x))) add('aria-ref', id);
    }
    if (n.tag === 'label' && attr(n, 'for') && !byId.has(attr(n, 'for'))) add('aria-ref', id);
    const ti = Number.parseInt(attr(n, 'tabindex'), 10);
    if (Number.isFinite(ti) && ti > 0) add('tabindex', id);
    if (isFocusable(n) && hiddenAncestor(n)) add('aria-hidden-focus', id);
    if (n.tag === 'iframe' && !attr(n, 'title') && !attr(n, 'aria-label')) add('iframe-title', id);
    if ((n.tag === 'video' || n.tag === 'audio') && n.attrs['autoplay'] !== undefined && n.attrs['muted'] === undefined) add('autoplay', id);
    if (isFocusable(n) || buttonLike) {
      const style = attr(n, 'style');
      if (style) {
        const v: Record<string, number> = {};
        for (const m of style.matchAll(/(?:^|;)\s*(width|height|min-width|min-height)\s*:\s*([0-9.]+)px/g)) v[m[1] ?? ''] = Number(m[2]);
        const small = (size: number | undefined, min: number | undefined): boolean => size !== undefined && size < 44 && (min === undefined || min < 44);
        if (small(v['width'], v['min-width']) || small(v['height'], v['min-height'])) add('target-inline', id);
      }
    }
  }
  for (const h of extraHtmlRules(nodes)) add(h.rule, nodeId(h.node), h.status, h.extra);
  return { checked: nodes.length, entries };
}

/** Elements with their own text, for the wording checks. */
export function htmlTextItems(html: string): Array<{ id: string; text: string }> {
  const items: Array<{ id: string; text: string }> = [];
  for (const n of parseHtml(html).nodes) {
    if (n.own && n.tag !== 'title') items.push({ id: nodeId(n), text: clip(n.own, 400) });
    else if (n.tag === 'title' && n.text) items.push({ id: nodeId(n), text: n.text });
  }
  return items;
}
