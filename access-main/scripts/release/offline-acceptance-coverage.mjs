/** Coverage planning for an offline, human-reviewed release. A missing test is UNKNOWN. */
import {
  ACCEPTANCE_KINDS, acceptanceSummary, validateAcceptanceLedger,
} from './offline-acceptance-ledger.mjs';
import { validateQueue } from '../../../scripts/release/offline-review-queue.mjs';

export const COVERAGE_VERSION = 1;
export const REQUIRED_GLOBAL = Object.freeze([
  'language-en', 'language-fr', 'privacy-export', 'source-provenance',
  'licence-attribution', 'claim-unknown', 'asset-integrity',
]);
export const REQUIRED_PER_ROUTE = Object.freeze([
  'keyboard', 'screen-reader', 'focus-visible', 'touch-target',
  'language-en', 'language-fr', 'offline-navigation',
]);
const KIND_SET = new Set(ACCEPTANCE_KINDS);
const MAX_RULES = 32;
const MAX_ROUTE_OVERRIDES = 500;

function problem(code, path) { return { code, path }; }
function sorted(values) { return [...values].sort((a, b) => a.localeCompare(b, 'en')); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validKinds(value) {
  return Array.isArray(value) && value.length <= MAX_RULES &&
    value.every((kind) => typeof kind === 'string' && KIND_SET.has(kind)) &&
    new Set(value).size === value.length;
}

/** Explicit policy keeps absence distinct from an observed FAIL. */
export function validateAcceptancePolicy(value) {
  if (!plain(value) || value.version !== COVERAGE_VERSION) {
    return { ok: false, problems: [problem('POLICY_INVALID', '/')], policy: null };
  }
  const problems = [];
  if (!validKinds(value.global)) problems.push(problem('GLOBAL_INVALID', '/global'));
  if (!validKinds(value.perRoute)) problems.push(problem('ROUTE_KINDS_INVALID', '/perRoute'));
  if (value.requireQueueLinks !== true && value.requireQueueLinks !== false) {
    problems.push(problem('QUEUE_MODE_INVALID', '/requireQueueLinks'));
  }
  if (value.allowEmptyRoute !== true && value.allowEmptyRoute !== false) {
    problems.push(problem('EMPTY_ROUTE_MODE_INVALID', '/allowEmptyRoute'));
  }
  if (value.overrides !== undefined) {
    if (!Array.isArray(value.overrides) || value.overrides.length > MAX_ROUTE_OVERRIDES) {
      problems.push(problem('OVERRIDES_INVALID', '/overrides'));
    } else {
      const seen = new Set();
      value.overrides.forEach((entry, index) => {
        const path = `/overrides/${index}`;
        if (!plain(entry) || typeof entry.routeId !== 'string' || !entry.routeId ||
            !validKinds(entry.kinds)) {
          problems.push(problem('OVERRIDE_INVALID', path));
          return;
        }
        if (seen.has(entry.routeId)) problems.push(problem('OVERRIDE_DUPLICATE', path));
        seen.add(entry.routeId);
      });
    }
  }
  for (const key of Object.keys(value)) {
    if (!['version', 'global', 'perRoute', 'requireQueueLinks', 'allowEmptyRoute', 'overrides'].includes(key)) {
      problems.push(problem('POLICY_EXTRA_FIELD', `/${key}`));
    }
  }
  return { ok: !problems.length, problems, policy: problems.length ? null : value };
}

export function defaultAcceptancePolicy() {
  return {
    version: COVERAGE_VERSION, global: [...REQUIRED_GLOBAL],
    perRoute: [...REQUIRED_PER_ROUTE], requireQueueLinks: true,
    allowEmptyRoute: false, overrides: [],
  };
}

function routeKinds(policy, id) {
  const override = policy.overrides?.find((entry) => entry.routeId === id);
  return override ? override.kinds : policy.perRoute;
}

/**
 * A coverage report is never a certificate of WCAG compliance. Its states
 * reflect tests recorded in the supplied ledger only, not a browser audit.
 */
export function acceptanceCoverage(ledger, policy = defaultAcceptancePolicy(), options = {}) {
  const contract = validateAcceptanceLedger(ledger, options);
  const rules = validateAcceptancePolicy(policy);
  const problems = [...contract.problems, ...rules.problems];
  if (problems.length) return { ok: false, problems, coverage: null };
  const missing = [];
  const failures = [];
  const unknown = [];
  const passed = [];
  const used = new Set();
  const allKinds = new Set();
  for (const route of ledger.routes) {
    const kinds = new Map();
    for (const check of route.checks) {
      allKinds.add(check.kind);
      const bucket = kinds.get(check.kind) ?? [];
      bucket.push(check);
      kinds.set(check.kind, bucket);
      if (check.state === 'FAIL') failures.push({ routeId: route.id, checkId: check.id, kind: check.kind });
      else if (check.state === 'UNKNOWN') unknown.push({ routeId: route.id, checkId: check.id, kind: check.kind });
      else passed.push({ routeId: route.id, checkId: check.id, kind: check.kind });
    }
    for (const kind of routeKinds(policy, route.id)) {
      if (!kinds.has(kind)) missing.push({ routeId: route.id, kind, scope: 'route' });
      else used.add(`${route.id}:${kind}`);
    }
    if (!route.checks.length && !policy.allowEmptyRoute) {
      missing.push({ routeId: route.id, kind: 'any-check', scope: 'route' });
    }
  }
  for (const kind of policy.global) {
    if (!allKinds.has(kind)) missing.push({ routeId: null, kind, scope: 'global' });
  }
  for (const list of [missing, failures, unknown, passed]) {
    list.sort((a, b) => String(a.routeId ?? '').localeCompare(String(b.routeId ?? ''), 'en') ||
      a.kind.localeCompare(b.kind, 'en') || String(a.checkId ?? '').localeCompare(String(b.checkId ?? ''), 'en'));
  }
  const summary = acceptanceSummary(ledger, options).summary;
  return { ok: true, problems: [], coverage: {
    missing, failures, unknown, passed,
    missingCount: missing.length, failureCount: failures.length,
    unknownCount: unknown.length, passCount: passed.length,
    routes: summary.routes, allRequiredKinds: sorted([...used]),
    readyForHumanReview: ledger.routes.length > 0 && passed.length > 0 &&
      missing.length === 0 && failures.length === 0 && unknown.length === 0,
    advisory: 'A complete checklist does not establish actual accessibility or certify WCAG compliance.',
  } };
}

export function validateAcceptanceQueueLinks(ledger, queue, options = {}) {
  const left = validateAcceptanceLedger(ledger, options);
  const right = validateQueue(queue, options);
  const problems = [
    ...left.problems.map((p) => ({ ...p, document: 'ledger' })),
    ...right.problems.map((p) => ({ ...p, document: 'queue' })),
  ];
  if (problems.length) return { ok: false, problems, links: null };
  const index = new Map(queue.items.map((item) => [item.id, item]));
  const links = [];
  for (const route of ledger.routes) {
    for (const check of route.checks) {
      if (!check.reviewItemId) continue;
      const entry = index.get(check.reviewItemId);
      if (!entry) {
        problems.push({ ...problem('REVIEW_NOT_FOUND', `/routes/${route.id}/checks/${check.id}`), document: 'ledger' });
        continue;
      }
      links.push({ routeId: route.id, checkId: check.id, reviewId: entry.id,
        reviewStatus: entry.status, claimState: entry.state,
        checkState: check.state, source: entry.provenance.source,
        licence: entry.provenance.licence, retrievedOn: entry.provenance.retrievedOn,
        tier: entry.provenance.tier });
    }
  }
  links.sort((a, b) => a.routeId.localeCompare(b.routeId, 'en') || a.checkId.localeCompare(b.checkId, 'en'));
  return { ok: problems.length === 0, problems, links: problems.length ? null : links };
}

/** Tracks which reference routes still need a human decision. */
export function unresolvedAcceptanceWork(ledger, queue, policy = defaultAcceptancePolicy(), options = {}) {
  const coverage = acceptanceCoverage(ledger, policy, options);
  const joined = validateAcceptanceQueueLinks(ledger, queue, options);
  const problems = [...coverage.problems, ...joined.problems];
  if (problems.length) return { ok: false, problems, work: null };
  const requested = [];
  const linked = new Set(joined.links.map((row) => `${row.routeId}/${row.checkId}`));
  for (const route of ledger.routes) {
    for (const item of route.checks) {
      if (item.state !== 'PASS' && !linked.has(`${route.id}/${item.id}`)) {
        requested.push({ routeId: route.id, checkId: item.id, kind: item.kind,
          reason: 'MISSING_REVIEW_LINK', state: item.state });
      }
    }
  }
  for (const row of joined.links) {
    if (row.reviewStatus !== 'closed') {
      requested.push({ routeId: row.routeId, checkId: row.checkId,
        kind: 'linked-review', reason: 'REVIEW_OPEN', state: row.checkState,
        reviewId: row.reviewId });
    }
  }
  for (const entry of coverage.coverage.missing) {
    requested.push({ routeId: entry.routeId, checkId: null,
      kind: entry.kind, reason: 'MISSING_CHECK', state: 'UNKNOWN' });
  }
  requested.sort((a, b) => String(a.routeId ?? '').localeCompare(String(b.routeId ?? ''), 'en') ||
    String(a.checkId ?? '').localeCompare(String(b.checkId ?? ''), 'en') || a.reason.localeCompare(b.reason, 'en'));
  return { ok: true, problems: [], work: requested, canCloseReview: requested.length === 0 };
}

/** Return an immutable snapshot of counts for machine-readable dashboards. */
export function coverageCounters(result) {
  if (!result?.ok || !result.coverage) return null;
  return Object.freeze({
    missing: result.coverage.missingCount,
    failed: result.coverage.failureCount,
    unknown: result.coverage.unknownCount,
    pass: result.coverage.passCount,
    readyForHumanReview: result.coverage.readyForHumanReview,
  });
}
