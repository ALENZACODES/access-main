/**
 * Offline release-graph analysis for locally deployed assets.
 * The graph is structural evidence only: no promise that a service worker
 * actually controls a browser or that a cached resource remains available.
 */
import { posix } from 'node:path';
import { finding, tokenizeHtml } from './site-audit.mjs';

const ASSET_TYPES = new Set(['script', 'style', 'image', 'font', 'manifest', 'fetch']);
const URL_ATTRIBUTES = new Map([
  ['script', ['src']], ['img', ['src', 'srcset']],
  ['source', ['src', 'srcset']], ['audio', ['src']],
  ['video', ['src', 'poster']], ['track', ['src']],
  ['object', ['data']], ['embed', ['src']],
  ['link', ['href']], ['use', ['href', 'xlink:href']],
]);
const OFFLINE_SHELL = new Set(['index.html', '/', './', '']);
const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const ABSOLUTE_SCHEMES = /^(?:https?:|data:|blob:|mailto:|tel:|javascript:)/i;

export function isRemoteReference(value) {
  return /^(?:https?:)?\/\//i.test(value.trim());
}

export function stripUrlFragment(value) {
  return value.split(/[?#]/, 1)[0];
}

/** Resolve a local URL without letting encoded traversal escape the site. */
export function localPath(from, reference) {
  if (typeof reference !== 'string') return { error: 'Reference must be text' };
  const trimmed = reference.trim();
  if (!trimmed || trimmed.startsWith('#')) return { ignored: true };
  if (ABSOLUTE_SCHEMES.test(trimmed) || trimmed.startsWith('//')) {
    return { external: true };
  }
  if (EXTERNAL.test(trimmed)) return { error: 'Unexpected URL scheme' };
  let decoded;
  try { decoded = decodeURIComponent(stripUrlFragment(trimmed)); } catch {
    return { error: 'Invalid percent encoding' };
  }
  if (/[\\\x00-\x1f]/.test(decoded)) return { error: 'Unsafe path characters' };
  if (decoded.startsWith('///')) return { error: 'Ambiguous absolute path' };
  const path = decoded.startsWith('/') ? decoded.slice(1) :
    posix.join(posix.dirname(from), decoded);
  const normal = posix.normalize(path);
  if (normal === '..' || normal.startsWith('../')) {
    return { error: 'Path escapes the deployment root' };
  }
  if (normal === '.' || normal === '') return { path: 'index.html' };
  return { path: normal };
}

export function parseSrcset(srcset) {
  if (typeof srcset !== 'string' || !srcset.trim()) return [];
  // Data URLs contain commas; do not parse their embedded bytes as URLs.
  return srcset.split(/,(?![^,]*\bdata:)/).map((part) => part.trim())
    .filter(Boolean).map((part) => part.split(/\s+/)[0]);
}

export function htmlOfflineReferences(html) {
  const refs = [];
  for (const tag of tokenizeHtml(html)) {
    const names = URL_ATTRIBUTES.get(tag.name) ?? [];
    for (const attribute of names) {
      if (!Object.hasOwn(tag.attrs, attribute)) continue;
      const raw = tag.attrs[attribute];
      const values = attribute === 'srcset' ? parseSrcset(raw) : [raw];
      for (const value of values) {
        if (!value) continue;
        if (tag.name === 'link') {
          const rel = (tag.attrs.rel ?? '').toLowerCase().split(/\s+/);
          if (!rel.some((name) => [
            'stylesheet', 'manifest', 'icon', 'apple-touch-icon',
            'preload', 'modulepreload', 'prefetch',
          ].includes(name))) continue;
        }
        refs.push({ tag: tag.name, attribute, value });
      }
    }
  }
  return refs;
}

export function cssReferences(css) {
  const refs = [];
  const commentsRemoved = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const urlRe = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi;
  let match;
  while ((match = urlRe.exec(commentsRemoved))) {
    refs.push({ type: 'url', value: match[1] ?? match[2] ?? match[3] });
  }
  const importRe = /@import\s+(?:"([^"]+)"|'([^']+)'|url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\))/gi;
  while ((match = importRe.exec(commentsRemoved))) {
    refs.push({ type: 'import', value: match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] });
  }
  return refs;
}

export function inspectOfflineHtml(html, file, names) {
  const issues = [];
  for (const ref of htmlOfflineReferences(html)) {
    const resolved = localPath(file, ref.value);
    if (resolved.error) issues.push(finding('OFFLINE_URL', file,
      `${ref.tag}.${ref.attribute}: ${resolved.error}`));
    else if (resolved.external) {
      // Only blocking assets matter; an ordinary anchor may open a remote site.
      issues.push(finding('OFFLINE_EXTERNAL_ASSET', file,
        `${ref.tag}.${ref.attribute}: remote dependency`));
    } else if (resolved.path && !names.has(resolved.path)) {
      issues.push(finding('OFFLINE_MISSING_ASSET', file,
        `${ref.tag}.${ref.attribute}: ${resolved.path} not packaged`));
    }
  }
  return issues;
}

export function inspectOfflineCss(css, file, names) {
  const issues = [];
  for (const ref of cssReferences(css)) {
    const resolved = localPath(file, ref.value);
    if (resolved.error) issues.push(finding('CSS_URL', file, resolved.error));
    else if (resolved.external) issues.push(finding('CSS_EXTERNAL_ASSET', file,
      `Remote ${ref.type} dependency`));
    else if (resolved.path && !names.has(resolved.path)) {
      issues.push(finding('CSS_MISSING_ASSET', file,
        `${ref.type}: ${resolved.path} not packaged`));
    }
  }
  return issues;
}

export function inspectManifest(manifest, file, names) {
  const issues = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [finding('MANIFEST_SHAPE', file, 'Expected a manifest object')];
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    issues.push(finding('MANIFEST_NAME', file, 'Missing nonempty name'));
  }
  if (typeof manifest.short_name !== 'string' || !manifest.short_name.trim()) {
    issues.push(finding('MANIFEST_SHORT_NAME', file, 'Missing nonempty short_name'));
  }
  if (manifest.display !== undefined && ![
    'standalone', 'minimal-ui', 'fullscreen', 'browser', 'window-controls-overlay',
  ].includes(manifest.display)) {
    issues.push(finding('MANIFEST_DISPLAY', file, 'Unrecognised display mode'));
  }
  for (const field of ['start_url', 'scope', 'id']) {
    if (manifest[field] === undefined) continue;
    if (typeof manifest[field] !== 'string') {
      issues.push(finding('MANIFEST_URL_TYPE', file, `${field} must be text`));
      continue;
    }
    const resolved = localPath(file, manifest[field]);
    if (resolved.external || resolved.error) {
      issues.push(finding('MANIFEST_URL', file, `${field} must remain local`));
    } else if (field === 'start_url' && resolved.path &&
      !names.has(resolved.path) && !OFFLINE_SHELL.has(manifest[field])) {
      // Routes owned by a client-side router are not necessarily files.
      if (/\.[a-z\d]{2,8}$/i.test(resolved.path)) {
        issues.push(finding('MANIFEST_START', file, 'Start file is not packaged'));
      }
    }
  }
  if (manifest.icons !== undefined && !Array.isArray(manifest.icons)) {
    issues.push(finding('MANIFEST_ICONS', file, 'Icons must be an array'));
  }
  for (const [index, icon] of (Array.isArray(manifest.icons) ? manifest.icons : []).entries()) {
    if (!icon || typeof icon !== 'object' || typeof icon.src !== 'string') {
      issues.push(finding('MANIFEST_ICON', file, `Icon ${index} needs a src`));
      continue;
    }
    const resolved = localPath(file, icon.src);
    if (resolved.error || resolved.external || !resolved.path || !names.has(resolved.path)) {
      issues.push(finding('MANIFEST_ICON', file, `Icon ${index} is not locally packaged`));
    }
    if (icon.sizes !== undefined &&
      !/^\d+x\d+(?:\s+\d+x\d+)*$|^any$/i.test(icon.sizes)) {
      issues.push(finding('MANIFEST_ICON_SIZE', file, `Invalid sizes for icon ${index}`));
    }
  }
  if (manifest.shortcuts !== undefined && !Array.isArray(manifest.shortcuts)) {
    issues.push(finding('MANIFEST_SHORTCUTS', file, 'Shortcuts must be an array'));
  }
  for (const [index, shortcut] of
    (Array.isArray(manifest.shortcuts) ? manifest.shortcuts : []).entries()) {
    if (!shortcut || typeof shortcut !== 'object' ||
      typeof shortcut.name !== 'string' || !shortcut.name.trim() ||
      typeof shortcut.url !== 'string') {
      issues.push(finding('MANIFEST_SHORTCUT', file, `Invalid shortcut ${index}`));
      continue;
    }
    const resolved = localPath(file, shortcut.url);
    if (resolved.external || resolved.error) {
      issues.push(finding('MANIFEST_SHORTCUT_URL', file, `Shortcut ${index} is not local`));
    }
  }
  return issues;
}

/**
 * Check explicitly declared precache lists. Dynamic Workbox manifests may
 * be processed at runtime and are not guessed or treated as preloaded.
 */
export function precacheEntries(script) {
  const entries = [];
  const patterns = [
    /(?:addAll|precacheAndRoute)\s*\(\s*(\[[\s\S]*?\])\s*\)/g,
    /(?:PRECACHE_URLS|OFFLINE_ASSETS|CACHE_URLS)\s*=\s*(\[[\s\S]*?\])/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(script))) {
      const value = match[1];
      const strings = /(['"])((?:\\.|(?!\1)[^\\])*?)\1/g;
      let item;
      while ((item = strings.exec(value))) {
        const raw = item[2];
        if (!raw.includes('${') && !raw.includes('\\')) entries.push(raw);
      }
    }
  }
  return entries;
}

export function inspectPrecache(script, file, names) {
  const issues = [];
  for (const reference of precacheEntries(script)) {
    const resolved = localPath(file, reference);
    if (resolved.external || resolved.error) {
      issues.push(finding('PRECACHE_URL', file, `Unsafe cache reference: ${reference}`));
    } else if (resolved.path && !names.has(resolved.path)) {
      issues.push(finding('PRECACHE_MISSING', file,
        `Precache file not packaged: ${resolved.path}`));
    }
  }
  return issues;
}

export function inspectServiceWorker(script, file) {
  const issues = [];
  // An explicit skipWaiting call is fine; forced client reloads on activation
  // can disrupt an in-progress form or route.
  if (/\b(?:location|window\.location)\.reload\s*\(/.test(script)) {
    issues.push(finding('SW_FORCED_RELOAD', file, 'Forced reload may discard state'));
  }
  if (/\bcaches\.delete\s*\(\s*['"](?:\*|all)['"]\s*\)/.test(script)) {
    issues.push(finding('SW_CACHE_DELETE', file, 'Unscoped cache deletion'));
  }
  if (/\b(?:importScripts|import)\s*\(\s*['"]https?:\/\//.test(script)) {
    issues.push(finding('SW_REMOTE_IMPORT', file, 'Remote service-worker import'));
  }
  return issues;
}

export function isServiceWorkerName(file) {
  return /(?:^|\/)(?:sw|service-worker|serviceworker)(?:[.-][^/]*)?\.(?:js|mjs)$/i.test(file);
}

export function referenceType(reference) {
  const extension = posix.extname(stripUrlFragment(reference)).toLowerCase();
  if (['.js', '.mjs'].includes(extension)) return 'script';
  if (extension === '.css') return 'style';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)) return 'image';
  if (['.woff', '.woff2', '.ttf', '.otf'].includes(extension)) return 'font';
  if (extension === '.webmanifest') return 'manifest';
  return 'fetch';
}

export function offlineGraph(documents) {
  const nodes = new Map();
  for (const document of documents) {
    const links = new Set();
    if (document.kind === 'html') {
      for (const ref of htmlOfflineReferences(document.text)) {
        const resolved = localPath(document.file, ref.value);
        if (resolved.path) links.add(resolved.path);
      }
    } else if (document.kind === 'css') {
      for (const ref of cssReferences(document.text)) {
        const resolved = localPath(document.file, ref.value);
        if (resolved.path) links.add(resolved.path);
      }
    }
    nodes.set(document.file, links);
  }
  return nodes;
}

export function reachableAssets(graph, entry = 'index.html') {
  const seen = new Set();
  const pending = [entry];
  while (pending.length) {
    const next = pending.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    for (const dependency of graph.get(next) ?? []) {
      if (!seen.has(dependency)) pending.push(dependency);
    }
  }
  return seen;
}

export function classifyOfflineDependencies(documents) {
  const graph = offlineGraph(documents);
  const reachable = reachableAssets(graph);
  const counts = Object.fromEntries([...ASSET_TYPES].map((type) => [type, 0]));
  for (const file of reachable) {
    if (file !== 'index.html') counts[referenceType(file)] += 1;
  }
  return { graph, reachable, counts };
}
