/** Read-only journey contracts. Input is untrusted; issue details contain no user text. */
import { URL } from 'node:url';
export const LOCALES = Object.freeze(['en', 'fr']);
export const STATES = Object.freeze(['READY', 'HOLD', 'UNKNOWN']);
export const TIERS = Object.freeze(['PRIMARY', 'SECONDARY', 'COMMUNITY', 'UNKNOWN']);
export const ACTIONS = Object.freeze(['NEXT', 'PREVIOUS', 'SELECT', 'BACK', 'CANCEL', 'RESTART']);
export const MAX_CONTROLS = 500;
export const MAX_STEPS = 3000;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
export function hasControl(value) {
  if (typeof value !== 'string') return false;
  for (let i = 0; i < value.length; i += 1) {
    const x = value.charCodeAt(i);
    if (x < 32 || x === 127 || (x >= 128 && x <= 159)) return true;
  }
  return false;
}
export function text(value, limit = 512) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !hasControl(value);
}
export function identifier(value) {
  return typeof value === 'string' && value.length <= 96 && IDENTIFIER.test(value);
}
export function dayOrdinal(value) {
  if (typeof value !== 'string') return null;
  const m = DATE.exec(value);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (y < 1970 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== mo || date.getUTCDate() !== d) return null;
  return Math.floor(date.getTime() / 86400000);
}
export function sourceUrl(value) {
  if (!text(value, 2048) || value.trim() !== value || value.includes(' ')) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return false;
    const h = url.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost')) return false;
    if (h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]') return false;
    return true;
  } catch { return false; }
}
export function offlinePath(value) {
  if (!text(value, 1024) || !value.startsWith('/offline/') || value.includes('\\')) return false;
  if (value.includes('?') || value.includes('#') || value.includes('%')) return false;
  return value.split('/').slice(1).every((part) => part !== '' && part !== '.' && part !== '..' && /^[a-zA-Z0-9._-]+$/.test(part));
}
export function finding(code, path, severity = 'error') { return { code, path, severity }; }
export function sorted(items) { return [...items].sort((a, b) => a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en')); }
export function copyIssues(copy, path) {
  const out = [];
  if (!object(copy)) return [finding('copy.object', path)];
  for (const lang of LOCALES) if (!text(copy[lang], 2000)) out.push(finding('copy.language', `${path}.${lang}`));
  if (text(copy.fr) && /(?:'|\u2019)/.test(copy.fr)) {
    if (copy.fr.includes("'")) out.push(finding('copy.french-apostrophe', `${path}.fr`));
  }
  if (text(copy.fr)) {
    for (let i = 1; i < copy.fr.length; i += 1) {
      const ch = copy.fr[i];
      if (ch === ':' && copy.fr[i - 1] !== '\u00A0') out.push(finding('copy.french-colon', `${path}.fr`));
      if (';!?'.includes(ch) && copy.fr[i - 1] !== '\u202F') out.push(finding('copy.french-narrow', `${path}.fr`));
    }
  }
  if (text(copy.fr)) {
    for (let i = 0; i < copy.fr.length; i += 1) {
      if (copy.fr[i] === '«' && copy.fr[i + 1] !== '\u202F') out.push(finding('copy.guillemet-open', `${path}.fr`));
      if (copy.fr[i] === '»' && copy.fr[i - 1] !== '\u202F') out.push(finding('copy.guillemet-close', `${path}.fr`));
    }
  }
  return sorted(out);
}
export function evidenceIssues(evidence, path, asOf) {
  const out = [];
  if (!object(evidence)) return [finding('evidence.object', path)];
  if (!identifier(evidence.id)) out.push(finding('evidence.id', `${path}.id`));
  if (!text(evidence.publisher, 200)) out.push(finding('evidence.publisher', `${path}.publisher`));
  if (!sourceUrl(evidence.url)) out.push(finding('evidence.url', `${path}.url`));
  if (!text(evidence.licence, 120)) out.push(finding('evidence.licence', `${path}.licence`));
  if (!TIERS.includes(evidence.tier)) out.push(finding('evidence.tier', `${path}.tier`));
  const date = dayOrdinal(evidence.collectedOn);
  if (date === null) out.push(finding('evidence.date', `${path}.collectedOn`));
  else if (asOf !== null && date > asOf) out.push(finding('evidence.future', `${path}.collectedOn`));
  if (evidence.tier === 'UNKNOWN') out.push(finding('evidence.unknown', `${path}.tier`, 'review'));
  return sorted(out);
}
export function controlIssues(control, path) {
  const out = [];
  if (!object(control)) return [finding('control.object', path)];
  if (!identifier(control.id)) out.push(finding('control.id', `${path}.id`));
  if (!text(control.role, 50)) out.push(finding('control.role', `${path}.role`));
  if (!['button', 'link', 'checkbox', 'switch', 'radio', 'textbox', 'option', 'menuitem', 'tab'].includes(control.role)) out.push(finding('control.unsupported-role', `${path}.role`));
  out.push(...copyIssues(control.name, `${path}.name`));
  if (typeof control.enabled !== 'boolean') out.push(finding('control.enabled', `${path}.enabled`));
  if (typeof control.visible !== 'boolean') out.push(finding('control.visible', `${path}.visible`));
  if (control.tabIndex !== undefined && (!Number.isInteger(control.tabIndex) || control.tabIndex < -1 || control.tabIndex > 0)) out.push(finding('control.tabindex', `${path}.tabIndex`));
  if (control.focusable && control.visible === false) out.push(finding('control.hidden-focusable', path));
  if (control.focusable && control.enabled === false && control.tabIndex === 0) out.push(finding('control.disabled-tabstop', path));
  if (control.targetId !== undefined && !identifier(control.targetId)) out.push(finding('control.target', `${path}.targetId`));
  if (control.labelledBy !== undefined && (!Array.isArray(control.labelledBy) || control.labelledBy.some((id) => !identifier(id)))) out.push(finding('control.labelledby', `${path}.labelledBy`));
  if (control.describedBy !== undefined && (!Array.isArray(control.describedBy) || control.describedBy.some((id) => !identifier(id)))) out.push(finding('control.describedby', `${path}.describedBy`));
  if (control.group !== undefined && !identifier(control.group)) out.push(finding('control.group', `${path}.group`));
  if (control.targetWidth !== undefined && (!Number.isFinite(control.targetWidth) || control.targetWidth < 0)) out.push(finding('control.width', `${path}.targetWidth`));
  if (control.targetHeight !== undefined && (!Number.isFinite(control.targetHeight) || control.targetHeight < 0)) out.push(finding('control.height', `${path}.targetHeight`));
  if (control.focusable && (control.targetWidth ?? 44) < 24 && (control.targetHeight ?? 44) < 24) out.push(finding('control.small-target', path, 'review'));
  return sorted(out);
}
export function journeyIssues(input, options = {}) {
  const out = [];
  const today = dayOrdinal(options.asOf ?? '2026-11-19');
  if (today === null) throw new TypeError('asOf must be a calendar date');
  if (!object(input)) return [finding('journey.object', 'journey')];
  if (!identifier(input.id)) out.push(finding('journey.id', 'journey.id'));
  if (!Array.isArray(input.controls) || input.controls.length > MAX_CONTROLS) return [finding('journey.controls', 'journey.controls')];
  const ids = new Set();
  const groups = new Set();
  const controls = input.controls;
  for (let i = 0; i < controls.length; i += 1) {
    const control = controls[i]; const at = `controls[${i}]`;
    out.push(...controlIssues(control, at));
    if (!object(control)) continue;
    if (identifier(control.id) && ids.has(control.id)) out.push(finding('journey.duplicate-id', `${at}.id`));
    ids.add(control.id);
    if (identifier(control.group)) groups.add(control.group);
  }
  for (let i = 0; i < controls.length; i += 1) {
    const control = controls[i];
    if (!object(control)) continue;
    const at = `controls[${i}]`;
    if (control.targetId && !ids.has(control.targetId)) out.push(finding('journey.missing-target', `${at}.targetId`));
    for (const attr of ['labelledBy', 'describedBy']) {
      if (Array.isArray(control[attr])) for (const id of control[attr]) if (!ids.has(id)) out.push(finding('journey.missing-reference', `${at}.${attr}`));
    }
    if (control.group && !groups.has(control.group)) out.push(finding('journey.unknown-group', `${at}.group`));
  }
  out.push(...copyIssues(input.title, 'journey.title'));
  if (input.evidence !== undefined) out.push(...evidenceIssues(input.evidence, 'journey.evidence', today));
  if (!['READY', 'HOLD', 'UNKNOWN'].includes(input.state)) out.push(finding('journey.state', 'journey.state'));
  if (input.evidence?.tier === 'UNKNOWN' && input.state === 'READY') out.push(finding('journey.unknown-upgraded', 'journey.state'));
  if (input.cache !== undefined) {
    if (!object(input.cache)) out.push(finding('journey.cache', 'journey.cache'));
    else if (input.cache.state === 'PRESENT' && !offlinePath(input.cache.path)) out.push(finding('journey.cache-path', 'journey.cache.path'));
    else if (input.cache.state === 'UNKNOWN' && input.state === 'READY') out.push(finding('journey.cache-unknown-upgraded', 'journey.state'));
  }
  return sorted(out);
}
export function eligibleControls(controls) {
  if (!Array.isArray(controls)) return [];
  return controls.filter((c) => object(c) && identifier(c.id) && c.enabled === true && c.visible === true && c.focusable === true && c.tabIndex !== -1);
}
export function focusSequence(controls) { return eligibleControls(controls).map((c) => c.id); }
export function uniqueIssueCodes(issues) { return [...new Set(issues.map((v) => v.code))].sort(); }
export function issueSummary(issues) {
  const counts = { error: 0, review: 0 };
  for (const issue of issues) if (issue.severity in counts) counts[issue.severity] += 1;
  return { ...counts, codes: uniqueIssueCodes(issues) };
}
