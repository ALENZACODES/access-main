/** Read-only release regression analysis. Evidence is not elevated into facts. */
import {
  inspectRegressionSnapshot, checkKey, scopeKey, problem,
} from './interaction-regression-contract.mjs';

export const CHANGE_KINDS = Object.freeze([
  'added', 'removed', 'regression', 'improvement-needs-review',
  'unknown-transition', 'outcome-changed', 'source-changed',
  'licence-changed', 'retrieval-changed', 'tier-changed',
  'artifact-changed', 'measurement-changed', 'label-changed',
  'unchanged',
]);
export const CHANGE_SEVERITIES = Object.freeze(['block', 'review', 'information']);
const HIGH_RISK = new Set([
  'regression', 'removed', 'source-changed', 'licence-changed',
  'artifact-changed', 'measurement-changed',
]);
const COMPARE_MAX_CHANGES = 20_000;

export function keyMap(snapshot) {
  const result = new Map();
  for (const run of snapshot.runs) {
    for (const check of run.checks) result.set(checkKey(run, check), { run, check });
  }
  return result;
}

export function severityForKind(kind, before, after) {
  if (kind === 'regression') return 'block';
  if (kind === 'removed') return before?.outcome === 'PASS' ? 'block' : 'review';
  if (kind === 'unknown-transition' || kind === 'improvement-needs-review') return 'review';
  if (kind === 'source-changed' || kind === 'licence-changed' ||
    kind === 'artifact-changed' || kind === 'measurement-changed') return 'review';
  if (kind === 'tier-changed' || kind === 'retrieval-changed' || kind === 'label-changed') {
    return 'review';
  }
  if (kind === 'added') return 'review';
  if (kind === 'outcome-changed') return 'review';
  if (kind === 'unchanged') return 'information';
  return 'information';
}

export function outcomeKind(before, after) {
  if (before === after) return 'unchanged';
  if (before === 'PASS' && after === 'FAIL') return 'regression';
  if (before === 'PASS' && after === 'UNKNOWN') return 'unknown-transition';
  if (before === 'FAIL' && after === 'PASS') return 'improvement-needs-review';
  if (before === 'UNKNOWN' || after === 'UNKNOWN') return 'unknown-transition';
  return 'outcome-changed';
}

export function fieldsChanged(before, after) {
  const changes = [];
  const keys = [
    ['source', 'source-changed'], ['licence', 'licence-changed'],
    ['retrievedOn', 'retrieval-changed'], ['tier', 'tier-changed'],
    ['artifactSha256', 'artifact-changed'],
  ];
  for (const [key, kind] of keys) {
    if (before[key] !== after[key]) changes.push(kind);
  }
  if (before.targetWidth !== after.targetWidth ||
    before.targetHeight !== after.targetHeight) changes.push('measurement-changed');
  if (before.label.en !== after.label.en || before.label.fr !== after.label.fr) {
    changes.push('label-changed');
  }
  return changes;
}

export function compareChecks(before, after) {
  if (before === null) return ['added'];
  if (after === null) return ['removed'];
  const changes = [];
  const outcome = outcomeKind(before.outcome, after.outcome);
  if (outcome !== 'unchanged') changes.push(outcome);
  changes.push(...fieldsChanged(before, after));
  return changes.length === 0 ? ['unchanged'] : changes;
}

export function impactForChange(kind, before, after) {
  if (kind === 'removed') return 'Re-run and document the missing check';
  if (kind === 'regression') return 'Reproduce the recorded failure with human review';
  if (kind === 'unknown-transition') return 'Capture fresh evidence; do not infer a pass';
  if (kind === 'improvement-needs-review') return 'Review the new recorded outcome independently';
  if (kind === 'source-changed' || kind === 'licence-changed' ||
    kind === 'artifact-changed') return 'Review the supporting material and its terms';
  if (kind === 'measurement-changed') return 'Repeat the target measurement';
  if (kind === 'label-changed') return 'Review the English and French control names';
  if (kind === 'added') return 'Check whether this new test belongs in the release plan';
  if (kind === 'retrieval-changed') return 'Review source freshness';
  if (kind === 'tier-changed') return 'Review the source-control tier';
  return 'No automatic action';
}

export function buildChange(key, kind, before, after) {
  const previous = before?.check ?? null;
  const next = after?.check ?? null;
  const run = after?.run ?? before?.run;
  return Object.freeze({
    id: `${key}:${kind}`,
    key,
    kind,
    severity: severityForKind(kind, previous, next),
    route: run.route,
    locale: run.locale,
    network: run.network,
    storage: run.storage,
    viewport: { ...run.viewport },
    checkId: next?.id ?? previous?.id,
    category: next?.category ?? previous?.category,
    before: previous ? {
      outcome: previous.outcome, source: previous.source,
      licence: previous.licence, retrievedOn: previous.retrievedOn,
      tier: previous.tier, artifactSha256: previous.artifactSha256 ?? null,
    } : null,
    after: next ? {
      outcome: next.outcome, source: next.source,
      licence: next.licence, retrievedOn: next.retrievedOn,
      tier: next.tier, artifactSha256: next.artifactSha256 ?? null,
    } : null,
    action: impactForChange(kind, previous, next),
  });
}

export function changedScopes(before, after) {
  const left = new Set(before.runs.map(scopeKey));
  const right = new Set(after.runs.map(scopeKey));
  return {
    added: [...right].filter((key) => !left.has(key)).sort(),
    removed: [...left].filter((key) => !right.has(key)).sort(),
    common: [...right].filter((key) => left.has(key)).sort(),
  };
}

export function summarizeChanges(changes, scopes) {
  const categories = Object.fromEntries(CHANGE_KINDS.map((kind) => [kind, 0]));
  const severities = Object.fromEntries(CHANGE_SEVERITIES.map((kind) => [kind, 0]));
  const locales = { en: 0, fr: 0 };
  const routes = new Set();
  const checks = new Set();
  let unknown = 0;
  let block = 0;
  let review = 0;
  for (const item of changes) {
    categories[item.kind] += 1;
    severities[item.severity] += 1;
    locales[item.locale] += 1;
    routes.add(item.route);
    checks.add(item.key);
    if (item.after?.outcome === 'UNKNOWN' || item.before?.outcome === 'UNKNOWN') unknown += 1;
    if (item.severity === 'block') block += 1;
    if (item.severity === 'review') review += 1;
  }
  return Object.freeze({
    total: changes.length,
    blocks: block,
    reviews: review,
    unknown,
    categories,
    severities,
    locales,
    routes: [...routes].sort(),
    uniqueChecks: checks.size,
    scopes,
    readyForAutomaticRelease: false,
  });
}

export function compareRegressionSnapshots(earlier, later, options = {}) {
  const inspections = [
    ['earlier', inspectRegressionSnapshot(earlier, options)],
    ['later', inspectRegressionSnapshot(later, options)],
  ];
  const issues = inspections.flatMap(([side, result]) =>
    result.issues.map((item) => ({ ...item, side })));
  if (issues.length > 0) return { ok: false, issues, changes: [], summary: null };
  const before = inspections[0][1].snapshot;
  const after = inspections[1][1].snapshot;
  if (earlier.releaseId === later.releaseId && options.allowSameRelease !== true) {
    return { ok: false, issues: [problem('SAME_RELEASE', '/releaseId')], changes: [], summary: null };
  }
  const a = keyMap(before);
  const b = keyMap(after);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  if (keys.length > COMPARE_MAX_CHANGES) {
    return { ok: false, issues: [problem('CHANGE_LIMIT', '/')], changes: [], summary: null };
  }
  const changes = [];
  for (const key of keys) {
    const old = a.get(key) ?? null;
    const fresh = b.get(key) ?? null;
    for (const kind of compareChecks(old?.check ?? null, fresh?.check ?? null)) {
      changes.push(buildChange(key, kind, old, fresh));
    }
  }
  const scopes = changedScopes(before, after);
  return { ok: true, issues: [], changes, summary: summarizeChanges(changes, scopes) };
}

/** A sorted human-review queue is a view of differences, never a claim update. */
export function reviewQueue(comparison, options = {}) {
  if (!comparison?.ok || !Array.isArray(comparison.changes)) {
    return { ok: false, items: [], issues: comparison?.issues ?? [problem('COMPARISON_REQUIRED', '/')] };
  }
  const includeInformational = options.includeInformational === true;
  const priority = { block: 0, review: 1, information: 2 };
  return {
    ok: true,
    issues: [],
    items: comparison.changes.filter((row) =>
      includeInformational || row.severity !== 'information')
      .sort((a, b) => priority[a.severity] - priority[b.severity] ||
        a.route.localeCompare(b.route, 'en') ||
        a.locale.localeCompare(b.locale, 'en') || a.id.localeCompare(b.id, 'en')),
  };
}

export function regressionGate(comparison, options = {}) {
  if (!comparison?.ok || !comparison.summary) {
    return { status: 'UNKNOWN', reasons: ['INVALID_COMPARISON'] };
  }
  const reasons = [];
  if (comparison.summary.blocks > 0) reasons.push('BLOCKING_REGRESSION');
  if (comparison.summary.reviews > 0) reasons.push('HUMAN_REVIEW_REQUIRED');
  if (comparison.summary.scopes.removed.length > 0) reasons.push('MISSING_RECORDED_SCOPE');
  if (options.requireBothLanguages !== false &&
    (comparison.summary.locales.en === 0 || comparison.summary.locales.fr === 0)) {
    reasons.push('BILINGUAL_REVIEW_REQUIRED');
  }
  return { status: reasons.includes('BLOCKING_REGRESSION') ? 'FAIL' : 'UNKNOWN', reasons };
}

export function compareByLocale(comparison) {
  if (!comparison?.ok) return null;
  const result = { en: [], fr: [] };
  for (const item of comparison.changes) result[item.locale].push(item);
  return result;
}

export function evidenceChanged(before, after) {
  if (!before || !after) return true;
  return before.source !== after.source || before.licence !== after.licence ||
    before.retrievedOn !== after.retrievedOn || before.tier !== after.tier ||
    before.artifactSha256 !== after.artifactSha256;
}

export function severeChanges(comparison) {
  if (!comparison?.ok) return [];
  return comparison.changes.filter((change) => HIGH_RISK.has(change.kind));
}
