/**
 * Local accessibility interaction snapshot contract.
 * These observations describe a captured UI, not a place or a person's ability.
 * No network, storage, scheduling, or claims of product approval.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';

export const SNAPSHOT_VERSION = 1;
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const ENVIRONMENTS = Object.freeze(['online', 'offline', 'limited', 'UNKNOWN']);
export const OUTCOMES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const ROLES = Object.freeze(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'textbox', 'combobox', 'menuitem', 'slider', 'spinbutton']);
export const KEY_ACTIONS = Object.freeze(['tab', 'shiftTab', 'enter', 'space', 'escape', 'arrowLeft', 'arrowRight', 'arrowUp', 'arrowDown']);
export const LIMITS = Object.freeze({ maxBytes: 8_000_000, maxCaptures: 120, maxControls: 300, maxAnnouncements: 250, maxText: 3000, maxIssues: 5000, maxDepth: 26 });
const ID = /^[A-Za-z][\w.:-]{0,127}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const SAFE_PATH = /^[a-z0-9][a-z0-9._/-]{0,300}$/iu;
const UNDESIRED = new Set(['email', 'phone', 'phonenumber', 'password', 'token', 'accesstoken', 'refreshtoken', 'secret', 'apikey', 'authorization', 'cookie', 'healthcard', 'diagnosis', 'medication', 'gps', 'latitude', 'longitude', 'locationhistory', 'personname', 'birthdate']);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const VALID_TIER = new Set([0, 1, 2, 3, 4, 'E']);
const OPEN_LICENCE = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0', 'OGL-Canada-2.0', 'OGL-Ontario-1.0', 'MIT', 'Apache-2.0']);
const OUTCOME = new Set(OUTCOMES);
const ROLE = new Set(ROLES);
const KEY = new Set(KEY_ACTIONS);
const LOCALE = new Set(LANGUAGES);
const ENVIRONMENT = new Set(ENVIRONMENTS);

export function isObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
export function makeIssue(code, path, severity = 'block') { return { code, path, severity }; }
export function pointer(value) { return String(value).replace(/~/gu, '~0').replace(/\//gu, '~1'); }
export function goodId(value) { return typeof value === 'string' && ID.test(value) && !RESERVED.has(value.toLowerCase()); }
export function hasControls(value) {
  if (typeof value !== 'string') return false;
  for (const char of value) {
    const n = char.codePointAt(0);
    if (n < 32 || n === 127 || n === 0xfffd) return true;
  }
  return false;
}
export function goodText(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= LIMITS.maxText && !hasControls(value); }
export function validDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function goodUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || hasControls(value)) return false;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.hash) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h === '[::1]' || /^127\./u.test(h)) return false;
    return true;
  } catch { return false; }
}
export function goodRoute(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && value.length <= 300 &&
    !value.includes('..') && !value.includes('?') && !value.includes('#') && !hasControls(value);
}
export function goodAssetPath(value) {
  return typeof value === 'string' && value.length < 300 && SAFE_PATH.test(value) &&
    !value.startsWith('/') && !value.split('/').some(part => part === '.' || part === '..' || part === '') &&
    !value.includes('\\') && !value.includes('?') && !value.includes('#');
}
export function frenchTextProblems(value, path = '/') {
  if (typeof value !== 'string') return [makeIssue('FR_TYPE', path)];
  const errors = [];
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (c === ':' && i > 0 && value[i - 1] !== '\u00a0') errors.push(makeIssue('FR_COLON', `${path}/${i}`));
    if (';!?'.includes(c) && i > 0 && value[i - 1] !== '\u202f') errors.push(makeIssue('FR_NARROW', `${path}/${i}`));
    if (c === '«' && value[i + 1] !== '\u202f') errors.push(makeIssue('FR_OPEN_QUOTE', `${path}/${i}`));
    if (c === '»' && value[i - 1] !== '\u202f') errors.push(makeIssue('FR_CLOSE_QUOTE', `${path}/${i}`));
    if (c === "'" && /[A-Za-zÀ-ÿ]/u.test(value[i - 1] ?? '') && /[A-Za-zÀ-ÿ]/u.test(value[i + 1] ?? '')) errors.push(makeIssue('FR_APOSTROPHE', `${path}/${i}`));
  }
  return errors;
}
export function copyProblems(pair, path = '/') {
  const errors = [];
  if (!isObject(pair) || Object.keys(pair).sort().join(',') !== 'en,fr') return [makeIssue('COPY_PAIR', path)];
  if (!goodText(pair.en)) errors.push(makeIssue('COPY_EN', `${path}/en`));
  if (!goodText(pair.fr)) errors.push(makeIssue('COPY_FR', `${path}/fr`));
  if (goodText(pair.fr)) errors.push(...frenchTextProblems(pair.fr, `${path}/fr`));
  return errors;
}
export function sensitiveFields(value, path = '', seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object') return [];
  if (depth > LIMITS.maxDepth) return [makeIssue('DEPTH', path || '/')];
  if (seen.has(value)) return [makeIssue('CYCLE', path || '/')];
  seen.add(value);
  const errors = [];
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  for (const [key, child] of entries) {
    const next = `${path}/${pointer(key)}`;
    const normalized = key.toLowerCase().replace(/[-_]/gu, '');
    if (UNDESIRED.has(normalized) || RESERVED.has(key)) errors.push(makeIssue('PRIVATE_FIELD', next));
    else errors.push(...sensitiveFields(child, next, seen, depth + 1));
  }
  seen.delete(value);
  return errors;
}
export function provenanceProblems(value, path, today) {
  if (!isObject(value)) return [makeIssue('PROVENANCE', path)];
  const errors = [];
  if (!goodText(value.source) || !goodUrl(value.source)) errors.push(makeIssue('SOURCE', `${path}/source`));
  if (!OPEN_LICENCE.has(value.licence)) errors.push(makeIssue('LICENCE', `${path}/licence`));
  if (!validDay(value.retrievedOn) || (validDay(today) && value.retrievedOn > today)) errors.push(makeIssue('RETRIEVED', `${path}/retrievedOn`));
  if (!VALID_TIER.has(value.tier)) errors.push(makeIssue('TIER', `${path}/tier`));
  for (const key of Object.keys(value)) if (!['source','licence','retrievedOn','tier'].includes(key)) errors.push(makeIssue('PROVENANCE_EXTRA', `${path}/${pointer(key)}`));
  return errors;
}
export function controlProblems(control, path) {
  if (!isObject(control)) return [makeIssue('CONTROL', path)];
  const issues = [];
  if (!goodId(control.id)) issues.push(makeIssue('CONTROL_ID', `${path}/id`));
  if (!ROLE.has(control.role)) issues.push(makeIssue('ROLE', `${path}/role`));
  if (control.name !== 'UNKNOWN' && !goodText(control.name)) issues.push(makeIssue('NAME', `${path}/name`));
  if (!isObject(control.bounds)) issues.push(makeIssue('BOUNDS', `${path}/bounds`));
  else for (const key of ['width','height']) {
    if (control.bounds[key] !== 'UNKNOWN' && !(typeof control.bounds[key] === 'number' && Number.isFinite(control.bounds[key]) && control.bounds[key] >= 0 && control.bounds[key] <= 10000)) issues.push(makeIssue('BOUNDS_VALUE', `${path}/bounds/${key}`));
  }
  if (!OUTCOME.has(control.focusVisible)) issues.push(makeIssue('FOCUS', `${path}/focusVisible`));
  if (!OUTCOME.has(control.tabReachable)) issues.push(makeIssue('TAB_REACHABLE', `${path}/tabReachable`));
  if (!isObject(control.keyboard)) issues.push(makeIssue('KEYBOARD', `${path}/keyboard`));
  else {
    for (const [key, state] of Object.entries(control.keyboard)) {
      if (!KEY.has(key) || !OUTCOME.has(state)) issues.push(makeIssue('KEY_ACTION', `${path}/keyboard/${pointer(key)}`));
    }
  }
  if (control.labelFor !== undefined && !goodId(control.labelFor)) issues.push(makeIssue('LABEL_TARGET', `${path}/labelFor`));
  for (const key of Object.keys(control)) if (!['id','role','name','bounds','focusVisible','tabReachable','keyboard','labelFor'].includes(key)) issues.push(makeIssue('CONTROL_EXTRA', `${path}/${pointer(key)}`));
  return issues;
}
export function announcementProblems(item, path) {
  if (!isObject(item)) return [makeIssue('ANNOUNCEMENT', path)];
  const errors = [];
  if (!goodId(item.id)) errors.push(makeIssue('ANNOUNCEMENT_ID', `${path}/id`));
  if (item.text !== 'UNKNOWN' && !goodText(item.text)) errors.push(makeIssue('ANNOUNCEMENT_TEXT', `${path}/text`));
  if (!['polite','assertive','off','UNKNOWN'].includes(item.live)) errors.push(makeIssue('ANNOUNCEMENT_LIVE', `${path}/live`));
  if (!OUTCOME.has(item.announced)) errors.push(makeIssue('ANNOUNCEMENT_RESULT', `${path}/announced`));
  for (const key of Object.keys(item)) if (!['id','text','live','announced'].includes(key)) errors.push(makeIssue('ANNOUNCEMENT_EXTRA', `${path}/${pointer(key)}`));
  return errors;
}
export function captureProblems(capture, path, today) {
  if (!isObject(capture)) return [makeIssue('CAPTURE', path)];
  const errors = [];
  if (!goodId(capture.id)) errors.push(makeIssue('CAPTURE_ID', `${path}/id`));
  if (!goodRoute(capture.route)) errors.push(makeIssue('ROUTE', `${path}/route`));
  if (!LOCALE.has(capture.language)) errors.push(makeIssue('LANGUAGE', `${path}/language`));
  if (!ENVIRONMENT.has(capture.environment)) errors.push(makeIssue('ENVIRONMENT', `${path}/environment`));
  errors.push(...provenanceProblems(capture.provenance, `${path}/provenance`, today));
  if (!Array.isArray(capture.controls) || capture.controls.length > LIMITS.maxControls) errors.push(makeIssue('CONTROLS', `${path}/controls`));
  else {
    const ids = new Set();
    capture.controls.forEach((control, i) => {
      errors.push(...controlProblems(control, `${path}/controls/${i}`));
      if (goodId(control?.id)) {
        if (ids.has(control.id)) errors.push(makeIssue('DUPLICATE_CONTROL', `${path}/controls/${i}/id`));
        ids.add(control.id);
      }
    });
  }
  if (!Array.isArray(capture.announcements) || capture.announcements.length > LIMITS.maxAnnouncements) errors.push(makeIssue('ANNOUNCEMENTS', `${path}/announcements`));
  else {
    const ids = new Set();
    capture.announcements.forEach((item,i) => {
      errors.push(...announcementProblems(item, `${path}/announcements/${i}`));
      if (goodId(item?.id)) {
        if (ids.has(item.id)) errors.push(makeIssue('DUPLICATE_ANNOUNCEMENT', `${path}/announcements/${i}/id`));
        ids.add(item.id);
      }
    });
  }
  if (!OUTCOME.has(capture.offlineShell)) errors.push(makeIssue('OFFLINE_SHELL', `${path}/offlineShell`));
  if (!OUTCOME.has(capture.storageReadable)) errors.push(makeIssue('STORAGE', `${path}/storageReadable`));
  if (!Array.isArray(capture.assets) || capture.assets.length > 120) errors.push(makeIssue('ASSETS', `${path}/assets`));
  else for (const [i,asset] of capture.assets.entries()) {
    if (!isObject(asset) || !goodAssetPath(asset.path) || !OUTCOME.has(asset.available)) errors.push(makeIssue('ASSET', `${path}/assets/${i}`));
  }
  for (const key of Object.keys(capture)) if (!['id','route','language','environment','provenance','controls','announcements','offlineShell','storageReadable','assets'].includes(key)) errors.push(makeIssue('CAPTURE_EXTRA', `${path}/${pointer(key)}`));
  return errors;
}
export function inspectSnapshots(value, options = {}) {
  const problems = sensitiveFields(value);
  if (!isObject(value) || value.version !== SNAPSHOT_VERSION || !Array.isArray(value.captures)) return { ok: false, problems: [...problems, makeIssue('DOCUMENT', '/')], captures: 0 };
  if (value.captures.length > LIMITS.maxCaptures) return { ok: false, problems: [...problems, makeIssue('CAPTURE_LIMIT', '/captures')], captures: 0 };
  const ids = new Set();
  for (const [index, capture] of value.captures.entries()) {
    problems.push(...captureProblems(capture, `/captures/${index}`, options.today));
    if (goodId(capture?.id)) {
      if (ids.has(capture.id)) problems.push(makeIssue('DUPLICATE_CAPTURE', `/captures/${index}/id`));
      ids.add(capture.id);
    }
    if (problems.length > LIMITS.maxIssues) return { ok: false, problems: problems.slice(0, LIMITS.maxIssues).concat(makeIssue('ISSUE_LIMIT', '/')), captures: 0 };
  }
  for (const key of Object.keys(value)) if (!['version','captures'].includes(key)) problems.push(makeIssue('DOCUMENT_EXTRA', `/${pointer(key)}`));
  return { ok: problems.length === 0, problems, captures: value.captures.length };
}
export function canonicalSnapshots(value) {
  return { version: SNAPSHOT_VERSION, captures: [...value.captures].sort((a,b)=>a.id.localeCompare(b.id,'en')).map(c=>({
    id:c.id, route:c.route, language:c.language, environment:c.environment,
    provenance: { source:c.provenance.source, licence:c.provenance.licence, retrievedOn:c.provenance.retrievedOn, tier:c.provenance.tier },
    controls:[...c.controls].sort((a,b)=>a.id.localeCompare(b.id,'en')).map(k=>({id:k.id,role:k.role,name:k.name,bounds:{width:k.bounds.width,height:k.bounds.height},focusVisible:k.focusVisible,tabReachable:k.tabReachable,keyboard:Object.fromEntries(Object.entries(k.keyboard).sort(([a],[b])=>a.localeCompare(b,'en'))),...(k.labelFor?{labelFor:k.labelFor}:{})})),
    announcements:[...c.announcements].sort((a,b)=>a.id.localeCompare(b.id,'en')),
    offlineShell:c.offlineShell, storageReadable:c.storageReadable,
    assets:[...c.assets].sort((a,b)=>a.path.localeCompare(b.path,'en')),
  })) };
}
export function fingerprintSnapshots(value, options = {}) {
  const check = inspectSnapshots(value, options);
  if (!check.ok) return { ok:false, problems:check.problems, sha256:null };
  const text = JSON.stringify(canonicalSnapshots(value));
  const digest = createHash('sha256').update(text,'utf8').digest('hex');
  return { ok:true, problems:[], sha256:digest };
}
export function parseSnapshots(input, options = {}) {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > LIMITS.maxBytes) return { ok:false, value:null, problems:[makeIssue('INPUT_LIMIT','/')] };
  try {
    const value = JSON.parse(input);
    const checked = inspectSnapshots(value, options);
    return { ok:checked.ok, value:checked.ok ? value : null, problems:checked.problems };
  } catch { return { ok:false, value:null, problems:[makeIssue('JSON','/')] }; }
}
export function serializeSnapshots(value, options = {}) {
  const checked = inspectSnapshots(value, options);
  if (!checked.ok) return { ok:false, text:null, problems:checked.problems };
  const text = `${JSON.stringify(canonicalSnapshots(value),null,2)}\n`;
  if (Buffer.byteLength(text, 'utf8') > LIMITS.maxBytes) return {ok:false,text:null,problems:[makeIssue('OUTPUT_LIMIT','/')]};
  return {ok:true,text,problems:[]};
}
