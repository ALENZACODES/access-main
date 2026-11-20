/** Manual, local-only audit of recorded input continuity. Nothing is inferred about real routes. */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';

export const VERSION = 1;
export const STATES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const NETWORKS = Object.freeze(['online', 'offline', 'limited', 'UNKNOWN']);
export const INPUTS = Object.freeze(['keyboard', 'switch', 'voice', 'touch', 'screen-reader']);
export const TASKS = Object.freeze(['search', 'review-evidence', 'plan-journey', 'save-offline', 'change-language', 'resume-task']);
export const STEPS = Object.freeze(['start', 'navigate', 'activate', 'interrupt', 'restore', 'confirm']);
export const LIMITS = Object.freeze({ bytes: 6_000_000, sessions: 160, steps: 200, notes: 500, issues: 2000 });
export const safeObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const boundedText = (value, maximum = LIMITS.notes) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && ![...value].some(c => c.codePointAt(0) < 32 || c.codePointAt(0) === 127 || c === '\uFFFD');
export const safeId = value => typeof value === 'string' && /^[a-z][a-z0-9._-]{0,79}$/u.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
export const safeDate = value => {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
 const [year, month, day] = value.split('-').map(Number);
 const d = new Date(Date.UTC(year, month - 1, day));
 return year >= 1900 && year <= 9999 && d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};
export const safeUrl = value => {
 if (typeof value !== 'string' || value.length > 1600) return false;
 try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && !u.hash && !['localhost', '127.0.0.1', '::1'].includes(u.hostname.toLowerCase()); } catch { return false; }
};
export function frenchSpacing(value) {
 if (typeof value !== 'string') return false;
 if (/(?<!\u00a0):/u.test(value)) return false;
 if (/(?<!\u202f)[;!?]/u.test(value)) return false;
 if (/«(?!\u202f)|(?<!\u202f)»/u.test(value)) return false;
 if (/\b[ldjtmcnsqu]'/iu.test(value)) return false;
 return true;
}
export const problem = (code, path) => ({ code, path });
const confidential = new Set(['password', 'secret', 'token', 'accesstoken', 'apikey', 'email', 'phone', 'fullname', 'birthdate', 'medical', 'diagnosis', 'health', 'latitude', 'longitude', 'coordinates', 'address']);
export function privateKeys(value, path = '/', issues = [], visited = new WeakSet(), depth = 0) {
 if (!value || typeof value !== 'object' || issues.length >= LIMITS.issues) return issues;
 if (depth > 25 || visited.has(value)) { issues.push(problem('UNSAFE_STRUCTURE', path)); return issues; }
 visited.add(value);
 for (const [key, child] of Object.entries(value)) {
  const keyPath = `${path === '/' ? '' : path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
  if (confidential.has(key.toLowerCase().replaceAll(/[^a-z]/gu, ''))) issues.push(problem('PRIVATE_KEY', keyPath));
  else if (child && typeof child === 'object') privateKeys(child, keyPath, issues, visited, depth + 1);
  if (issues.length >= LIMITS.issues) break;
 }
 return issues;
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
 if (Array.isArray(value)) return value.map(canonical);
 if (!safeObject(value)) return value;
 return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
export const fingerprint = value => sha256(JSON.stringify(canonical(value)));
const add = (issues, code, path) => { if (issues.length < LIMITS.issues) issues.push(problem(code, path)); };
export function provenanceIssues(value, path, issues, today) {
 if (!safeObject(value)) { add(issues, 'PROVENANCE_REQUIRED', path); return; }
 if (!safeUrl(value.source)) add(issues, 'SOURCE', `${path}/source`);
 if (!['CC0-1.0', 'CC-BY-4.0', 'ODC-BY-1.0', 'MIT', 'Apache-2.0'].includes(value.licence)) add(issues, 'LICENCE', `${path}/licence`);
 if (!safeDate(value.retrievedOn) || (safeDate(today) && value.retrievedOn > today)) add(issues, 'RETRIEVAL_DATE', `${path}/retrievedOn`);
 if (![0, 1, 2, 3, 'UNKNOWN'].includes(value.tier)) add(issues, 'TIER', `${path}/tier`);
}
export function stepIssues(value, path, issues) {
 if (!safeObject(value)) { add(issues, 'STEP_OBJECT', path); return; }
 if (!safeId(value.id)) add(issues, 'STEP_ID', `${path}/id`);
 if (!STEPS.includes(value.kind)) add(issues, 'STEP_KIND', `${path}/kind`);
 if (!STATES.includes(value.state)) add(issues, 'STEP_STATE', `${path}/state`);
 if (!Number.isInteger(value.order) || value.order < 1 || value.order > LIMITS.steps) add(issues, 'ORDER', `${path}/order`);
 if (value.target !== undefined && !safeId(value.target)) add(issues, 'TARGET', `${path}/target`);
 if (value.observation !== undefined && !boundedText(value.observation)) add(issues, 'OBSERVATION', `${path}/observation`);
 if (value.width !== undefined && value.width !== 'UNKNOWN' && (!Number.isFinite(value.width) || value.width < 0 || value.width > 20000)) add(issues, 'WIDTH', `${path}/width`);
 if (value.height !== undefined && value.height !== 'UNKNOWN' && (!Number.isFinite(value.height) || value.height < 0 || value.height > 20000)) add(issues, 'HEIGHT', `${path}/height`);
}
export function sessionIssues(value, path, issues, today) {
 if (!safeObject(value)) { add(issues, 'SESSION_OBJECT', path); return; }
 if (!safeId(value.id)) add(issues, 'SESSION_ID', `${path}/id`);
 if (!LANGUAGES.includes(value.language)) add(issues, 'LANGUAGE', `${path}/language`);
 if (!INPUTS.includes(value.input)) add(issues, 'INPUT', `${path}/input`);
 if (!TASKS.includes(value.task)) add(issues, 'TASK', `${path}/task`);
 if (!NETWORKS.includes(value.network)) add(issues, 'NETWORK', `${path}/network`);
 if (!STATES.includes(value.outcome)) add(issues, 'OUTCOME', `${path}/outcome`);
 if (value.label !== undefined && (!boundedText(value.label) || (value.language === 'fr' && !frenchSpacing(value.label)))) add(issues, 'LABEL', `${path}/label`);
 provenanceIssues(value.provenance, `${path}/provenance`, issues, today);
 if (!Array.isArray(value.steps) || value.steps.length > LIMITS.steps) { add(issues, 'STEPS', `${path}/steps`); return; }
 const ids = new Set(), orders = new Set(); let last = 0;
 value.steps.forEach((step, i) => {
  stepIssues(step, `${path}/steps/${i}`, issues);
  if (!safeObject(step)) return;
  if (ids.has(step.id)) add(issues, 'DUPLICATE_STEP', `${path}/steps/${i}/id`); ids.add(step.id);
  if (orders.has(step.order) || step.order <= last) add(issues, 'ORDER_SEQUENCE', `${path}/steps/${i}/order`);
  orders.add(step.order); last = step.order;
 });
}
export function validate(value, { today = '2026-11-20' } = {}) {
 const issues = [];
 if (!safeObject(value)) return { ok: false, issues: [problem('DOCUMENT_OBJECT', '/')] };
 let bytes = 0;
 try { bytes = Buffer.byteLength(JSON.stringify(value)); } catch { return { ok: false, issues: [problem('NOT_JSON', '/')] }; }
 if (bytes > LIMITS.bytes) return { ok: false, issues: [problem('BYTE_LIMIT', '/')] };
 if (value.version !== VERSION) add(issues, 'VERSION', '/version');
 if (!Array.isArray(value.sessions) || value.sessions.length > LIMITS.sessions) return { ok: false, issues: [problem('SESSIONS', '/sessions')] };
 const privacy = privateKeys(value); issues.push(...privacy.slice(0, LIMITS.issues - issues.length));
 const ids = new Set();
 value.sessions.forEach((session, i) => {
  sessionIssues(session, `/sessions/${i}`, issues, today);
  if (!safeObject(session)) return;
  if (ids.has(session.id)) add(issues, 'DUPLICATE_SESSION', `/sessions/${i}/id`);
  ids.add(session.id);
 });
 return { ok: issues.length === 0, issues };
}
export function parse(text, options = {}) {
 if (typeof text !== 'string' || Buffer.byteLength(text) > LIMITS.bytes) return { ok: false, issues: [problem('BYTE_LIMIT', '/')], value: null };
 try { const value = JSON.parse(text); const result = validate(value, options); return { ...result, value: result.ok ? value : null }; }
 catch { return { ok: false, issues: [problem('JSON', '/')] , value: null }; }
}
export function serialize(value, options = {}) {
 const result = validate(value, options);
 return { ...result, text: result.ok ? `${JSON.stringify(canonical(value), null, 2)}\n` : null };
}
