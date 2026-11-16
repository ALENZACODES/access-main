/**
 * Structural navigation checks for packaged, locally navigable site artifacts.
 * Checks do not simulate browser routing, redirects or JavaScript-driven links.
 */
import { posix } from 'node:path';
import { finding, tokenizeHtml } from './site-audit.mjs';
import { localPath } from './offline-audit.mjs';

const HTML = /\.html?$/i;
const UNSAFE_SCHEME = /^(?:javascript|vbscript|data):/i;
const DOWNLOAD_SCHEME = /^(?:mailto|tel|sms):/i;
const REMOTE = /^(?:https?:)?\/\//i;
const LANGUAGE = /^(en|fr)(?:-[a-z]{2,8})?$/i;
const FRAGMENT = /#([^#]*)$/;
const VALID_ID = /^[^\s]+$/;
function validId(value) {
  return VALID_ID.test(value) && [...value].every((char) => (char.codePointAt(0) ?? 0) > 31);
}
const URL_ATTRS = new Map([
  ['a', 'href'], ['area', 'href'], ['form', 'action'],
]);

export function decodeFragment(fragment) {
  try { return decodeURIComponent(fragment.replace(/\+/g, '%20')); } catch {
    return null;
  }
}

export function splitReference(reference) {
  if (typeof reference !== 'string') return { kind: 'invalid' };
  const value = reference.trim();
  if (!value) return { kind: 'empty' };
  if (UNSAFE_SCHEME.test(value)) return { kind: 'unsafe', value };
  if (DOWNLOAD_SCHEME.test(value)) return { kind: 'external', value };
  if (REMOTE.test(value)) return { kind: 'external', value };
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return { kind: 'unknown-scheme', value };
  const match = FRAGMENT.exec(value);
  const fragment = match ? decodeFragment(match[1]) : null;
  const path = match ? value.slice(0, match.index) : value;
  if (match && fragment === null) return { kind: 'malformed-fragment', value };
  return { kind: 'local', path, fragment, value };
}

export function pageIds(html) {
  const ids = new Set();
  for (const tag of tokenizeHtml(html)) {
    if (tag.attrs.id) ids.add(tag.attrs.id);
    if (tag.name === 'a' && tag.attrs.name) ids.add(tag.attrs.name);
  }
  return ids;
}

export function pageLanguage(html) {
  const tag = tokenizeHtml(html).find((item) => item.name === 'html');
  if (!tag) return null;
  const match = LANGUAGE.exec(tag.attrs.lang ?? '');
  return match ? match[1].toLowerCase() : null;
}

export function pageLinks(html, file) {
  const links = [];
  for (const tag of tokenizeHtml(html)) {
    const attr = URL_ATTRS.get(tag.name);
    if (attr && Object.hasOwn(tag.attrs, attr)) {
      links.push({ file, tag: tag.name, attribute: attr,
        value: tag.attrs[attr], attrs: tag.attrs });
    }
    if (tag.name === 'link') {
      const rel = (tag.attrs.rel ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('alternate') && tag.attrs.hreflang) {
        links.push({ file, tag: 'alternate', attribute: 'href',
          value: tag.attrs.href ?? '', attrs: tag.attrs });
      }
    }
  }
  return links;
}

function escapePath(name) {
  return name.replace(/(^|\/)\.\//g, '$1');
}

export function resolveHtmlRoute(from, reference, names) {
  const parsed = splitReference(reference);
  if (parsed.kind !== 'local') return parsed;
  if (parsed.path === '' || parsed.path === '.') {
    return { kind: 'resolved', path: from, fragment: parsed.fragment };
  }
  const resolved = localPath(from, parsed.path);
  if (resolved.error) return { kind: 'bad-path', reason: resolved.error };
  if (resolved.external) return { kind: 'external' };
  const path = escapePath(resolved.path ?? from);
  if (names.has(path)) {
    return { kind: 'resolved', path, fragment: parsed.fragment };
  }
  if (path.endsWith('/') && names.has(`${path}index.html`)) {
    return { kind: 'resolved', path: `${path}index.html`, fragment: parsed.fragment };
  }
  if (names.has(`${path}/index.html`)) {
    return { kind: 'resolved', path: `${path}/index.html`, fragment: parsed.fragment };
  }
  if (names.has(`${path}.html`)) {
    return { kind: 'resolved', path: `${path}.html`, fragment: parsed.fragment };
  }
  return { kind: 'unresolved', path, fragment: parsed.fragment };
}

function anchorTarget(link, pages, names) {
  const parsed = splitReference(link.value);
  if (parsed.kind === 'empty') {
    return finding('NAV_EMPTY_HREF', link.file,
      `<${link.tag}> contains an empty ${link.attribute}`);
  }
  if (parsed.kind === 'unsafe') {
    return finding('NAV_UNSAFE_SCHEME', link.file,
      `<${link.tag}> uses an unsafe URL scheme`);
  }
  if (parsed.kind === 'unknown-scheme' || parsed.kind === 'malformed-fragment') {
    return finding('NAV_MALFORMED_URL', link.file,
      `<${link.tag}> contains an unsupported URL`);
  }
  if (parsed.kind !== 'local') return null;
  if (link.tag === 'form' && /^(?:post|dialog)$/i.test(link.attrs.method ?? '')) {
    return null;
  }
  const target = resolveHtmlRoute(link.file, link.value, names);
  if (target.kind === 'bad-path') {
    return finding('NAV_ESCAPE', link.file,
      `<${link.tag}> leaves the site root`);
  }
  // SPA navigation may be dynamically handled. Require only explicit HTML
  // destinations and fragment-only references to resolve statically.
  const explicitHtml = HTML.test(parsed.path) || parsed.path.endsWith('/') ||
    parsed.path === '' || link.tag === 'alternate';
  if (target.kind === 'unresolved' && explicitHtml) {
    return finding('NAV_MISSING_DOCUMENT', link.file,
      `Local page is missing: ${target.path}`);
  }
  if (target.kind !== 'resolved' || target.fragment === null ||
      target.fragment === '') return null;
  if (!pages.has(target.path)) return null;
  if (!pageIds(pages.get(target.path)).has(target.fragment)) {
    return finding('NAV_MISSING_FRAGMENT', link.file,
      `Fragment target is missing in ${target.path}: #${target.fragment}`);
  }
  return null;
}

export function inspectNavigationGraph(pages, names = new Set(pages.keys())) {
  const issues = [];
  const alternatePages = new Map();
  const routes = new Map();
  for (const [file, html] of pages) {
    const language = pageLanguage(html);
    const links = pageLinks(html, file);
    const alternates = new Map();
    for (const link of links) {
      const result = anchorTarget(link, pages, names);
      if (result) issues.push(result);
      if (link.tag !== 'alternate') continue;
      const locale = link.attrs.hreflang.toLowerCase();
      if (!LANGUAGE.test(locale) && locale !== 'x-default') {
        issues.push(finding('NAV_ALT_LANGUAGE', file,
          `Invalid alternate language: ${locale}`));
        continue;
      }
      if (alternates.has(locale)) {
        issues.push(finding('NAV_ALT_DUPLICATE', file,
          `Repeated alternate language: ${locale}`));
        continue;
      }
      alternates.set(locale, link.value);
      const target = resolveHtmlRoute(file, link.value, names);
      if (target.kind === 'resolved' && pages.has(target.path)) {
        const expected = locale.slice(0, 2);
        const actual = pageLanguage(pages.get(target.path));
        if (locale !== 'x-default' && actual && expected !== actual) {
          issues.push(finding('NAV_ALT_MISMATCH', file,
            `Alternate ${locale} targets a ${actual} document`));
        }
      }
    }
    alternatePages.set(file, alternates);
    const key = posix.basename(file).toLowerCase();
    if (!routes.has(key)) routes.set(key, []);
    routes.get(key).push({ file, language });
    if (links.filter((link) => link.tag === 'form' &&
      (link.attrs.method ?? 'get').toLowerCase() === 'get' &&
      /^(?:https?:)?\/\//i.test(link.value)).length) {
      issues.push(finding('NAV_REMOTE_GET_FORM', file,
        'Get form submits to a remote address'));
    }
  }
  for (const [file, alternates] of alternatePages) {
    if (!alternates.size) continue;
    for (const locale of ['en', 'fr']) {
      if (![...alternates].some(([key]) => key === locale || key.startsWith(`${locale}-`))) {
        issues.push(finding('NAV_ALT_MISSING', file,
          `Alternate links require ${locale} alongside the other language`));
      }
    }
    for (const [locale, value] of alternates) {
      if (locale === 'x-default') continue;
      const target = resolveHtmlRoute(file, value, names);
      if (target.kind !== 'resolved') continue;
      const reverse = alternatePages.get(target.path);
      if (!reverse || ![...reverse.values()].some((ref) => {
        const resolved = resolveHtmlRoute(target.path, ref, names);
        return resolved.kind === 'resolved' && resolved.path === file;
      })) {
        issues.push(finding('NAV_ALT_RECIPROCAL', file,
          `Alternate ${locale} has no reciprocal link from ${target.path}`));
      }
    }
  }
  return issues;
}

export function inspectNavigationHtml(html, file) {
  const issues = [];
  const tags = tokenizeHtml(html);
  for (const tag of tags) {
    if (tag.name === 'a' && Object.hasOwn(tag.attrs, 'href')) {
      const href = tag.attrs.href.trim();
      if (UNSAFE_SCHEME.test(href)) {
        issues.push(finding('NAV_UNSAFE_SCHEME', file,
          'Anchor uses an unsafe URL scheme'));
      }
      if (tag.attrs.download !== undefined && REMOTE.test(href)) {
        issues.push(finding('NAV_REMOTE_DOWNLOAD', file,
          'Download attribute points to an external destination'));
      }
    }
    if (tag.name === 'form') {
      const method = (tag.attrs.method ?? 'get').toLowerCase();
      if (!['get', 'post', 'dialog'].includes(method)) {
        issues.push(finding('NAV_FORM_METHOD', file, 'Unsupported form method'));
      }
      if (tag.attrs.target === '_blank') {
        issues.push(finding('NAV_NEW_WINDOW_FORM', file,
          'Form submission opens a new window'));
      }
    }
    if (tag.name === 'base' && tag.attrs.href && REMOTE.test(tag.attrs.href)) {
      issues.push(finding('NAV_REMOTE_BASE', file,
        'External base URL changes local navigation resolution'));
    }
    if (tag.name === 'a' && tag.attrs.href === '#' &&
        !tag.attrs.role && tag.attrs['aria-label'] === undefined) {
      issues.push(finding('NAV_EMPTY_FRAGMENT_ACTION', file,
        'Hash-only anchor needs a meaningful destination'));
    }
    if (tag.attrs.id && !validId(tag.attrs.id)) {
      issues.push(finding('NAV_INVALID_FRAGMENT_ID', file,
        'Fragment identifier contains invalid characters'));
    }
  }
  return issues;
}
