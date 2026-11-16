/** Privacy-preserving release inspection for HTML, JavaScript and headers. */
import { finding, tokenizeHtml } from './site-audit.mjs';

const TRACKER_HOSTS = [
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)facebook\.net$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)hotjar\.com$/i,
  /(^|\.)segment\.io$/i,
  /(^|\.)amplitude\.com$/i,
  /(^|\.)mixpanel\.com$/i,
  /(^|\.)fullstory\.com$/i,
  /(^|\.)clarity\.ms$/i,
];
const FORBIDDEN_META = new Set(['refresh', 'set-cookie']);
const UNSAFE_CSP = [
  { expression: /(?:^|;)\s*script-src\s+[^;]*'unsafe-eval'/i,
    code: 'PRIVACY_UNSAFE_EVAL' },
  { expression: /(?:^|;)\s*object-src\s+(?:\*|https?:)/i,
    code: 'PRIVACY_OBJECT_SOURCE' },
  { expression: /(?:^|;)\s*base-uri\s+\*/i,
    code: 'PRIVACY_WILDCARD_BASE' },
];
const SHARED_STORAGE = /\b(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(/g;
const CREDENTIALS = /\bcredentials\s*:\s*['"]include['"]/g;
const SCRIPT_URLS = /(?:https?:)?\/\/[^\s"'`<>\\)]+/g;
const JS_LOCATION = /\b(?:window\.)?location\s*\.\s*(?:assign|replace)\s*\(/g;
const DYNAMIC_HTML = /\b(?:innerHTML|outerHTML)\s*=(?!=)/g;
const DANGEROUS_EVAL = /\b(?:eval|new\s+Function)\s*\(/g;
const REMOTE_URL = /^(?:https?:)?\/\//i;

export function parseAbsoluteUrl(raw) {
  if (typeof raw !== 'string' || !REMOTE_URL.test(raw)) return null;
  try {
    return new URL(raw.startsWith('//') ? `https:${raw}` : raw);
  } catch {
    return null;
  }
}

export function trackerHost(host) {
  return TRACKER_HOSTS.some((pattern) => pattern.test(host));
}

export function inspectRemoteUrls(text, file) {
  const issues = [];
  const seen = new Set();
  for (const match of text.matchAll(SCRIPT_URLS)) {
    const url = parseAbsoluteUrl(match[0].replace(/[.,;]+$/, ''));
    if (!url || !trackerHost(url.hostname) || seen.has(url.hostname)) continue;
    issues.push(finding('PRIVACY_TRACKING_HOST', file,
      `Unnecessary tracking endpoint: ${url.hostname}`));
    seen.add(url.hostname);
  }
  return issues;
}

export function inspectPrivacyHtml(html, file) {
  const issues = [];
  for (const tag of tokenizeHtml(html)) {
    const attrs = tag.attrs;
    if (tag.name === 'script' && attrs.src && REMOTE_URL.test(attrs.src)) {
      issues.push(finding('PRIVACY_REMOTE_SCRIPT', file,
        'Remote scripts cannot be relied on for offline operation'));
    }
    if (tag.name === 'iframe' && attrs.src && REMOTE_URL.test(attrs.src)) {
      issues.push(finding('PRIVACY_REMOTE_FRAME', file,
        'Remote frames cannot be relied on for offline operation'));
    }
    if (tag.name === 'form' && attrs.action && REMOTE_URL.test(attrs.action)) {
      issues.push(finding('PRIVACY_REMOTE_FORM', file,
        'Form sends information to an external origin'));
    }
    if (tag.name === 'link') {
      const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('preconnect') || rel.includes('dns-prefetch')) {
        if (attrs.href && REMOTE_URL.test(attrs.href)) {
          issues.push(finding('PRIVACY_REMOTE_HINT', file,
            'Remote connection hints must not run automatically'));
        }
      }
    }
    if (tag.name === 'meta' &&
      FORBIDDEN_META.has((attrs['http-equiv'] ?? '').toLowerCase())) {
      if ((attrs['http-equiv'] ?? '').toLowerCase() === 'set-cookie') {
        issues.push(finding('PRIVACY_META_COOKIE', file,
          'HTML must not set cookies through meta elements'));
      }
    }
    if (tag.name === 'meta' &&
      (attrs['http-equiv'] ?? '').toLowerCase() === 'content-security-policy') {
      issues.push(...inspectCsp(attrs.content ?? '', file));
    }
    if (tag.name === 'input' &&
      /^(?:password|email|tel)$/i.test(attrs.type ?? '') &&
      attrs.autocomplete === 'on') {
      // This is not prohibited: browsers may help people enter information.
      // Do not confuse autofill with sharing information off-device.
    }
  }
  issues.push(...inspectRemoteUrls(html, file));
  return issues;
}

export function cspDirectives(value) {
  const result = new Map();
  for (const raw of value.split(';')) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const [name, ...sources] = tokens;
    const key = name.toLowerCase();
    if (!result.has(key)) result.set(key, sources);
  }
  return result;
}

export function inspectCsp(value, file) {
  const issues = [];
  for (const rule of UNSAFE_CSP) {
    if (rule.expression.test(value)) {
      issues.push(finding(rule.code, file,
        'Content security policy contains an unsafe declaration'));
    }
  }
  const directives = cspDirectives(value);
  if (directives.has('object-src') &&
      !directives.get('object-src').includes("'none'")) {
    issues.push(finding('PRIVACY_OBJECT_POLICY', file,
      "object-src should be restricted to 'none'"));
  }
  if (directives.has('frame-ancestors') &&
      directives.get('frame-ancestors').includes('*')) {
    issues.push(finding('PRIVACY_FRAME_POLICY', file,
      'Wildcard frame ancestors allow embedding from any origin'));
  }
  return issues;
}

/**
 * Only high-confidence unsafe JavaScript patterns block a release. A storage
 * API or a dynamically generated HTML fragment is not intrinsically unsafe;
 * those are returned as observations for manual browser scenario coverage.
 */
export function inspectPrivacyScript(source, file) {
  const issues = [];
  for (const match of source.matchAll(DANGEROUS_EVAL)) {
    issues.push(finding('PRIVACY_DYNAMIC_EVAL', file,
      `Dynamic code execution at offset ${match.index}`));
  }
  for (const match of source.matchAll(/\bdocument\.write\s*\(/g)) {
    issues.push(finding('PRIVACY_DOCUMENT_WRITE', file,
      `Document stream mutation at offset ${match.index}`));
  }
  for (const match of source.matchAll(/\bdocument\.cookie\s*=/g)) {
    issues.push(finding('PRIVACY_SCRIPT_COOKIE', file,
      `Client cookie assignment at offset ${match.index}`));
  }
  issues.push(...inspectRemoteUrls(source, file));
  return issues;
}

export function scriptPrivacyObservations(source) {
  const storage = [...source.matchAll(SHARED_STORAGE)].length;
  const credentialedRequests = [...source.matchAll(CREDENTIALS)].length;
  const navigation = [...source.matchAll(JS_LOCATION)].length;
  const generatedMarkup = [...source.matchAll(DYNAMIC_HTML)].length;
  return { storage, credentialedRequests, navigation, generatedMarkup };
}

export function inspectHttpHeaders(text, file) {
  const issues = [];
  const headers = new Map();
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('/*')) continue;
    const match = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (headers.has(key)) {
      issues.push(finding('PRIVACY_DUPLICATE_HEADER', file,
        `Repeated security header: ${key}`));
    }
    headers.set(key, match[2]);
  }
  const csp = headers.get('content-security-policy');
  if (csp) issues.push(...inspectCsp(csp, file));
  const referrer = headers.get('referrer-policy');
  if (referrer && !['no-referrer', 'same-origin', 'strict-origin',
    'strict-origin-when-cross-origin'].includes(referrer.toLowerCase())) {
    issues.push(finding('PRIVACY_REFERRER', file,
      'Referrer policy may expose browsing details'));
  }
  const permissions = headers.get('permissions-policy');
  if (permissions && /\b(?:camera|microphone|geolocation)=\*/i.test(permissions)) {
    issues.push(finding('PRIVACY_PERMISSIONS', file,
      'Broad device permissions are not appropriate'));
  }
  return issues;
}
