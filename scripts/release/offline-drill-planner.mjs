/**
 * Non-mutating scenario coverage planner for manually supplied capture sets.
 * Missing observations become UNKNOWN work items, never synthetic PASS rows.
 */
import { evaluateDrill, gateMatrix, summarizeGates } from './offline-drill-matrix.mjs';
import { DRILL_VERSION } from './offline-drill-core.mjs';

export const PLANNER_VERSION = 1;
const NETWORKS = ['offline', 'limited', 'online'];
const STORAGE = ['ready', 'blocked'];
const LOCALES = ['en', 'fr'];
const SIZES = [
  { id: 'narrow', min: 240, max: 479 },
  { id: 'medium', min: 480, max: 1023 },
  { id: 'wide', min: 1024, max: 8192 },
];
export const PLAN_DIMENSIONS = Object.freeze({ networks: Object.freeze(NETWORKS),
  storage: Object.freeze(STORAGE), locales: Object.freeze(LOCALES), sizes: Object.freeze(SIZES) });
function cellId(route, locale, network, storage, size) {
  return `${route}|${locale}|${network}|${storage}|${size}`;
}
export function viewportBand(width) {
  if (!Number.isInteger(width)) return 'UNKNOWN';
  return SIZES.find((size) => width >= size.min && width <= size.max)?.id ?? 'UNKNOWN';
}
export function requiredCells(routes, { networks = NETWORKS, storage = STORAGE,
  locales = LOCALES, sizes = SIZES.map((s) => s.id) } = {}) {
  if (!Array.isArray(routes) || routes.length > 300 ||
      routes.some((route) => typeof route !== 'string' || !route.startsWith('/') || route.includes('|'))) {
    return null;
  }
  const domains = { networks, storage, locales, sizes };
  if (Object.values(domains).some((list) => !Array.isArray(list) || list.length === 0 || list.length > 10)) return null;
  if (networks.some((x) => !NETWORKS.includes(x)) ||
      storage.some((x) => !STORAGE.includes(x)) ||
      locales.some((x) => !LOCALES.includes(x)) ||
      sizes.some((x) => !SIZES.some((band) => band.id === x))) return null;
  const ids = new Set();
  for (const route of routes) for (const locale of locales) for (const network of networks) {
    for (const mode of storage) for (const size of sizes) ids.add(cellId(route, locale, network, mode, size));
  }
  if (ids.size > 10_000) return null;
  return [...ids].sort((a, b) => a.localeCompare(b, 'en'));
}
export function captureCell(capture) {
  if (!capture || typeof capture !== 'object') return null;
  if (!capture.viewport || typeof capture.route !== 'string') return null;
  return cellId(capture.route, capture.locale, capture.network,
    capture.storage, viewportBand(capture.viewport.width));
}
export function scenarioCoverage(document, options = {}) {
  const evaluated = evaluateDrill(document, options);
  if (!evaluated.ok) return { ok: false, problems: evaluated.problems, missing: [], present: [], summary: null };
  const routes = options.routes ?? [...new Set(document.captures.map((capture) => capture.route))];
  const required = requiredCells(routes, options.dimensions);
  if (required === null) return { ok: false, problems: [{ code: 'PLAN_SCOPE', path: '/routes' }],
    missing: [], present: [], summary: null };
  const counts = new Map();
  for (const capture of document.captures) {
    const id = captureCell(capture);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const missing = required.filter((id) => !counts.has(id));
  const present = required.filter((id) => counts.has(id)).map((id) => ({ id, captures: counts.get(id) }));
  const repeats = present.filter((entry) => entry.captures > 1);
  const extra = [...counts.keys()].filter((id) => !required.includes(id)).sort();
  return { ok: true, problems: [], missing, present, repeats, extra,
    summary: { required: required.length, observed: present.length,
      missing: missing.length, repeated: repeats.length, extra: extra.length,
      status: missing.length ? 'UNKNOWN' : evaluated.summary.status } };
}
export function missingScenarioTasks(coverage, limit = 500) {
  if (!coverage?.ok || !Number.isInteger(limit) || limit < 0) return null;
  return coverage.missing.slice(0, Math.min(limit, 500)).map((id) => {
    const [route, locale, network, storage, size] = id.split('|');
    return Object.freeze({ id, route, locale, network, storage, size,
      status: 'UNKNOWN', action: 'CAPTURE_REQUIRED' });
  });
}
export function reviewPlan(document, options = {}) {
  const evaluation = evaluateDrill(document, options);
  if (!evaluation.ok) return { ok: false, problems: evaluation.problems, tasks: [], summary: null };
  const coverage = scenarioCoverage(document, options);
  if (!coverage.ok) return { ok: false, problems: coverage.problems, tasks: [], summary: null };
  const tasks = [];
  for (const finding of evaluation.findings) {
    if (finding.severity === 'information') continue;
    tasks.push({ id: `${finding.capture}|${finding.code}|${finding.path}`,
      captureId: finding.capture, reason: finding.code, path: finding.path,
      priority: finding.severity, state: 'UNKNOWN', action: 'HUMAN_REVIEW' });
  }
  for (const missing of missingScenarioTasks(coverage)) tasks.push({
    id: missing.id, captureId: null, reason: 'CAPTURE_MISSING',
    path: missing.route, priority: 'review', state: 'UNKNOWN', action: missing.action,
  });
  const rank = { block: 0, review: 1, information: 2 };
  tasks.sort((a, b) => rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id, 'en'));
  return { ok: true, problems: [], tasks,
    summary: { total: tasks.length,
      blocked: tasks.filter((task) => task.priority === 'block').length,
      review: tasks.filter((task) => task.priority === 'review').length,
      missingScenarios: coverage.missing.length,
      state: tasks.length ? 'UNKNOWN' : evaluation.summary.status } };
}
export function compactGateSummary(document, options = {}) {
  const result = evaluateDrill(document, options);
  if (!result.ok) return { ok: false, problems: result.problems, gates: [] };
  const rows = gateMatrix(result, document);
  return { ok: true, problems: [], gates: summarizeGates(rows) };
}
export function blankDrill() {
  return { version: DRILL_VERSION, sources: [], captures: [] };
}
