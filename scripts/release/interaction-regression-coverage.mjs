/**
 * Coverage means recorded check presence, not operating-system/browser success.
 * No absent check may be counted as PASS. Every missing outcome is UNKNOWN.
 */
import {
  inspectRegressionSnapshot, problem, scopeKey, CHECK_CATEGORIES,
  NETWORK_MODES, STORAGE_MODES, LOCALES, safeRoute,
} from './interaction-regression-contract.mjs';

export const COVERAGE_VERSION = 1;
export const REQUIRED_CATEGORIES = Object.freeze([
  'keyboard', 'focus', 'screen-reader', 'target', 'locale', 'offline', 'storage',
]);
const CATEGORY = new Set(CHECK_CATEGORIES);
const NETWORK = new Set(NETWORK_MODES);
const STORAGE = new Set(STORAGE_MODES);
const LANG = new Set(LOCALES);
const MAX_POLICIES = 500;
const MAX_SCOPES = 12_000;

export function coveragePolicyIssues(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return [problem('COVERAGE_POLICY_REQUIRED', '/')];
  }
  const issues = [];
  if (policy.version !== COVERAGE_VERSION) issues.push(problem('COVERAGE_POLICY_VERSION', '/version'));
  if (!Array.isArray(policy.routes) || policy.routes.length === 0 ||
    policy.routes.length > MAX_POLICIES) issues.push(problem('COVERAGE_ROUTES', '/routes'));
  if (!Array.isArray(policy.locales) || policy.locales.length === 0 ||
    policy.locales.some((v) => !LANG.has(v))) issues.push(problem('COVERAGE_LOCALES', '/locales'));
  if (!Array.isArray(policy.networks) || policy.networks.length === 0 ||
    policy.networks.some((v) => !NETWORK.has(v))) issues.push(problem('COVERAGE_NETWORKS', '/networks'));
  if (!Array.isArray(policy.storages) || policy.storages.length === 0 ||
    policy.storages.some((v) => !STORAGE.has(v))) issues.push(problem('COVERAGE_STORAGES', '/storages'));
  if (!Array.isArray(policy.categories) || policy.categories.length === 0 ||
    policy.categories.some((v) => !CATEGORY.has(v))) issues.push(problem('COVERAGE_CATEGORIES', '/categories'));
  if (!Array.isArray(policy.viewports) || policy.viewports.length === 0 ||
    policy.viewports.length > 24) issues.push(problem('COVERAGE_VIEWPORTS', '/viewports'));
  if (Array.isArray(policy.routes)) {
    const seen = new Set();
    for (const [i, route] of policy.routes.entries()) {
      if (!safeRoute(route)) issues.push(problem('COVERAGE_ROUTE', `/routes/${i}`));
      if (seen.has(route)) issues.push(problem('COVERAGE_DUPLICATE_ROUTE', `/routes/${i}`));
      seen.add(route);
    }
  }
  if (Array.isArray(policy.viewports)) {
    const seen = new Set();
    for (const [i, viewport] of policy.viewports.entries()) {
      if (!viewport || !Number.isSafeInteger(viewport.width) ||
        !Number.isSafeInteger(viewport.height) || viewport.width < 200 ||
        viewport.height < 200 || viewport.width > 8_192 || viewport.height > 8_192) {
        issues.push(problem('COVERAGE_VIEWPORT', `/viewports/${i}`));
        continue;
      }
      const key = `${viewport.width}x${viewport.height}`;
      if (seen.has(key)) issues.push(problem('COVERAGE_DUPLICATE_VIEWPORT', `/viewports/${i}`));
      seen.add(key);
    }
  }
  for (const key of ['locales', 'networks', 'storages', 'categories']) {
    if (Array.isArray(policy[key]) && new Set(policy[key]).size !== policy[key].length) {
      issues.push(problem('COVERAGE_DUPLICATE_VALUE', `/${key}`));
    }
  }
  for (const key of Object.keys(policy)) {
    if (!['version', 'routes', 'locales', 'networks', 'storages',
      'viewports', 'categories'].includes(key)) {
      issues.push(problem('COVERAGE_EXTRA_FIELD', `/${key}`));
    }
  }
  return issues;
}

export function defaultCoveragePolicy(routes = ['/home']) {
  return {
    version: COVERAGE_VERSION,
    routes: [...routes],
    locales: ['en', 'fr'],
    networks: ['online', 'offline'],
    storages: ['ready', 'blocked'],
    viewports: [{ width: 390, height: 844 }],
    categories: [...REQUIRED_CATEGORIES],
  };
}

export function expectedScopes(policy) {
  const problems = coveragePolicyIssues(policy);
  if (problems.length > 0) return { ok: false, problems, scopes: [] };
  const result = [];
  for (const route of policy.routes) {
    for (const locale of policy.locales) {
      for (const network of policy.networks) {
        for (const storage of policy.storages) {
          for (const viewport of policy.viewports) {
            result.push({ route, locale, network, storage, viewport: { ...viewport } });
            if (result.length > MAX_SCOPES) {
              return { ok: false, problems: [problem('COVERAGE_SCOPE_LIMIT', '/')], scopes: [] };
            }
          }
        }
      }
    }
  }
  return { ok: true, problems: [], scopes: result };
}

export function coverageObservation(run, category) {
  if (!run) return { outcome: 'UNKNOWN', recorded: false, reason: 'SCOPE_MISSING' };
  const matches = run.checks.filter((check) => check.category === category);
  if (matches.length === 0) {
    return { outcome: 'UNKNOWN', recorded: false, reason: 'CATEGORY_MISSING' };
  }
  if (matches.some((check) => check.outcome === 'FAIL')) {
    return { outcome: 'FAIL', recorded: true, reason: 'RECORDED_FAIL' };
  }
  if (matches.some((check) => check.outcome === 'UNKNOWN')) {
    return { outcome: 'UNKNOWN', recorded: true, reason: 'RECORDED_UNKNOWN' };
  }
  return { outcome: 'PASS', recorded: true, reason: 'RECORDED_PASS' };
}

export function analyzeCoverage(snapshot, policy, options = {}) {
  const check = inspectRegressionSnapshot(snapshot, options);
  const expected = expectedScopes(policy);
  const problems = [...check.issues, ...expected.problems];
  if (problems.length > 0) {
    return { ok: false, problems, rows: [], summary: null };
  }
  const map = new Map(check.snapshot.runs.map((run) => [scopeKey(run), run]));
  const rows = [];
  const summary = {
    scopes: expected.scopes.length,
    completeScopes: 0,
    missingScopes: 0,
    checks: 0,
    PASS: 0,
    FAIL: 0,
    UNKNOWN: 0,
    recorded: 0,
    absent: 0,
    locales: { en: { PASS: 0, FAIL: 0, UNKNOWN: 0 },
      fr: { PASS: 0, FAIL: 0, UNKNOWN: 0 } },
    categories: Object.fromEntries(policy.categories.map((c) => [c, { PASS: 0, FAIL: 0, UNKNOWN: 0 }])),
    releaseEligible: false,
  };
  for (const scope of expected.scopes) {
    const run = map.get(scopeKey(scope));
    if (run === undefined) summary.missingScopes += 1;
    else summary.completeScopes += 1;
    for (const category of policy.categories) {
      const observed = coverageObservation(run, category);
      const row = Object.freeze({
        route: scope.route, locale: scope.locale, network: scope.network,
        storage: scope.storage, viewport: { ...scope.viewport }, category,
        ...observed,
      });
      rows.push(row);
      summary.checks += 1;
      summary[observed.outcome] += 1;
      summary.locales[scope.locale][observed.outcome] += 1;
      summary.categories[category][observed.outcome] += 1;
      if (observed.recorded) summary.recorded += 1;
      else summary.absent += 1;
    }
  }
  return { ok: true, problems: [], rows, summary };
}

export function reviewMissingCoverage(result) {
  if (!result?.ok) return [];
  return result.rows.filter((row) => row.outcome !== 'PASS').map((row) => ({
    ...row,
    action: row.recorded ? 'Review captured outcome' : 'Capture missing evidence',
  }));
}

export function compareCoverage(earlier, later) {
  if (!earlier?.ok || !later?.ok) {
    return { ok: false, changes: [], problems: [problem('COVERAGE_INPUT', '/')] };
  }
  const key = (row) => [row.route, row.locale, row.network, row.storage,
    row.viewport.width, row.viewport.height, row.category].join('|');
  const a = new Map(earlier.rows.map((row) => [key(row), row]));
  const b = new Map(later.rows.map((row) => [key(row), row]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  const changes = [];
  for (const id of ids) {
    const old = a.get(id);
    const fresh = b.get(id);
    if (!old || !fresh || old.outcome !== fresh.outcome || old.recorded !== fresh.recorded) {
      changes.push({ id,
        before: old?.outcome ?? 'UNKNOWN',
        after: fresh?.outcome ?? 'UNKNOWN',
        beforeRecorded: old?.recorded ?? false,
        afterRecorded: fresh?.recorded ?? false,
      });
    }
  }
  return { ok: true, changes, problems: [] };
}

export function policyCoverageCategories(policy) {
  const issues = coveragePolicyIssues(policy);
  if (issues.length > 0) return { ok: false, categories: [], problems: issues };
  return { ok: true, categories: [...policy.categories].sort(), problems: [] };
}

export function missingLanguages(coverage) {
  if (!coverage?.ok) return ['en', 'fr'];
  return ['en', 'fr'].filter((locale) =>
    !coverage.rows.some((row) => row.locale === locale && row.recorded));
}

export function coverageByRoute(coverage) {
  if (!coverage?.ok) return {};
  const result = {};
  for (const row of coverage.rows) {
    result[row.route] ??= { PASS: 0, FAIL: 0, UNKNOWN: 0 };
    result[row.route][row.outcome] += 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
