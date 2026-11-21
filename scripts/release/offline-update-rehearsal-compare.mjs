/**
 * Conservative before/after analysis: changed evidence requires a human
 * review even when the recorded outcome does not change. An update may alter
 * a resource without providing proof of either success or failure.
 */
import { validateRehearsal } from './offline-update-rehearsal-contract.mjs';
import { affectedAssets, comparePriority, eventDigest, phaseCoverage, releaseReview } from './offline-update-rehearsal-engine.mjs';

export const CHANGE_KINDS = Object.freeze([
  'asset-added', 'asset-removed', 'asset-bytes', 'asset-state',
  'asset-source', 'asset-licence', 'asset-date', 'asset-tier',
  'asset-dependencies', 'session-added', 'session-removed',
  'session-outcome', 'session-network', 'session-date',
  'session-phase', 'session-locale', 'session-evidence',
  'session-source', 'session-licence', 'session-tier',
]);
function change(kind, id, previous, next, review = 'review') {
  return { kind, id, previous, next, review };
}
function common(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function sortChanges(changes) {
  return changes.sort((left, right) => left.id.localeCompare(right.id, 'en') ||
    left.kind.localeCompare(right.kind, 'en'));
}
function sourceView(value) {
  return {
    source: value.source, licence: value.licence,
    retrievedOn: value.retrievedOn, tier: value.tier,
  };
}
function assetsById(document) {
  return new Map(document.assets.map(asset => [asset.id, asset]));
}
function sessionsById(document) {
  return new Map(document.sessions.map(session => [session.id, session]));
}
export function assetChanges(previous, next) {
  const left = assetsById(previous);
  const right = assetsById(next);
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  const changes = [];
  for (const id of ids) {
    const a = left.get(id);
    const b = right.get(id);
    if (!a) { changes.push(change('asset-added', id, null, b.path)); continue; }
    if (!b) { changes.push(change('asset-removed', id, a.path, null, 'block')); continue; }
    if (a.sha256 !== b.sha256 || a.bytes !== b.bytes || a.path !== b.path) {
      changes.push(change('asset-bytes', id, a.sha256, b.sha256));
    }
    if (a.state !== b.state) changes.push(change('asset-state', id, a.state, b.state, comparePriority(a.state, b.state)));
    if (a.provenance.source !== b.provenance.source) {
      changes.push(change('asset-source', id, a.provenance.source, b.provenance.source));
    }
    if (a.provenance.licence !== b.provenance.licence) {
      changes.push(change('asset-licence', id, a.provenance.licence, b.provenance.licence));
    }
    if (a.provenance.retrievedOn !== b.provenance.retrievedOn) {
      changes.push(change('asset-date', id, a.provenance.retrievedOn, b.provenance.retrievedOn));
    }
    if (a.provenance.tier !== b.provenance.tier) {
      changes.push(change('asset-tier', id, a.provenance.tier, b.provenance.tier));
    }
    if (!common([...a.dependsOn].sort(), [...b.dependsOn].sort())) {
      changes.push(change('asset-dependencies', id, [...a.dependsOn].sort(), [...b.dependsOn].sort()));
    }
  }
  return sortChanges(changes);
}
export function sessionChanges(previous, next) {
  const left = sessionsById(previous);
  const right = sessionsById(next);
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  const changes = [];
  for (const id of ids) {
    const a = left.get(id);
    const b = right.get(id);
    if (!a) { changes.push(change('session-added', id, null, b.outcome)); continue; }
    if (!b) { changes.push(change('session-removed', id, a.outcome, null, 'block')); continue; }
    if (a.outcome !== b.outcome) {
      changes.push(change('session-outcome', id, a.outcome, b.outcome, comparePriority(a.outcome, b.outcome)));
    }
    for (const [key, kind] of [
      ['network', 'session-network'], ['recordedOn', 'session-date'],
      ['phase', 'session-phase'], ['locale', 'session-locale'],
    ]) {
      if (a[key] !== b[key]) changes.push(change(kind, id, a[key], b[key]));
    }
    const oldDigest = eventDigest(a.events);
    const newDigest = eventDigest(b.events);
    if (oldDigest !== newDigest) changes.push(change('session-evidence', id, oldDigest, newDigest));
    for (const [key, kind] of [
      ['source', 'session-source'], ['licence', 'session-licence'],
      ['retrievedOn', 'session-date'], ['tier', 'session-tier'],
    ]) {
      if (a.provenance[key] !== b.provenance[key]) {
        changes.push(change(kind, id, a.provenance[key], b.provenance[key]));
      }
    }
  }
  return sortChanges(changes);
}
export function compareRehearsals(previous, next, options = {}) {
  const checks = [
    ['previous', validateRehearsal(previous, options)],
    ['next', validateRehearsal(next, options)],
  ];
  const problems = checks.flatMap(([name, value]) => value.problems.map(problem => ({ ...problem, snapshot: name })));
  if (problems.length) return { ok: false, problems, changes: [], summary: null, affected: [] };
  const changes = sortChanges([...assetChanges(previous, next), ...sessionChanges(previous, next)]);
  const changedAssetIds = changes.filter(c => c.kind.startsWith('asset-')).map(c => c.id);
  const affected = affectedAssets(next.assets, changedAssetIds);
  const current = releaseReview(next, options);
  const former = releaseReview(previous, options);
  return {
    ok: true, problems: [], changes, affected,
    summary: {
      changes: changes.length,
      added: changes.filter(c => c.kind.endsWith('added')).length,
      removed: changes.filter(c => c.kind.endsWith('removed')).length,
      regressions: changes.filter(c => ['regressed', 'block'].includes(c.review)).length,
      manualReviews: changes.filter(c => c.review !== 'unchanged').length,
      previous: former.summary.state, next: current.summary.state,
    },
  };
}
export function coverageDelta(previous, next, options = {}) {
  const left = phaseCoverage(previous, options);
  const right = phaseCoverage(next, options);
  if (!left.ok || !right.ok) return { ok: false, problems: [...left.problems, ...right.problems], changes: [] };
  const changes = [];
  for (let index = 0; index < left.rows.length; index += 1) {
    const a = left.rows[index];
    const b = right.rows[index];
    if (a.state !== b.state || a.count !== b.count) {
      changes.push({ phase: a.phase, locale: a.locale, network: a.network,
        previous: a.state, next: b.state, previousCount: a.count,
        nextCount: b.count, review: comparePriority(a.state, b.state) });
    }
  }
  return { ok: true, problems: [], changes };
}
export function reviewChanges(previous, next, options = {}) {
  const compared = compareRehearsals(previous, next, options);
  if (!compared.ok) return { ok: false, problems: compared.problems, tasks: [] };
  const tasks = compared.changes.map(item => ({
    key: `${item.kind}:${item.id}`, kind: item.kind, itemId: item.id,
    priority: item.review === 'block' || item.review === 'regressed' ? 'high' : 'normal',
    status: 'UNKNOWN',
  }));
  const coverage = coverageDelta(previous, next, options);
  for (const item of coverage.changes) {
    tasks.push({ key: `coverage:${item.phase}:${item.locale}:${item.network}`,
      kind: 'coverage', itemId: item.phase,
      priority: item.review === 'regressed' ? 'high' : 'normal', status: 'UNKNOWN' });
  }
  return { ok: true, problems: [], tasks: tasks.sort((a, b) => a.key.localeCompare(b.key, 'en')) };
}
export function safeSummary(previous, next, options = {}) {
  const report = compareRehearsals(previous, next, options);
  if (!report.ok) return { ok: false, problems: report.problems, summary: null };
  return { ok: true, problems: [], summary: {
    ...report.summary, affectedAssets: report.affected.length,
    sourceChanges: report.changes.filter(change => change.kind.includes('source')).length,
    evidenceChanges: report.changes.filter(change => change.kind.includes('evidence')).length,
    outcomeChanges: report.changes.filter(change => change.kind.includes('outcome')).length,
  } };
}
export function crossReleaseSourceChanges(previous, next, options = {}) {
  const compared = compareRehearsals(previous, next, options);
  if (!compared.ok) return { ok: false, problems: compared.problems, items: [] };
  const items = compared.changes.filter(item => /source|licence|tier|date/.test(item.kind))
    .map(item => ({ kind: item.kind, id: item.id, previous: item.previous, next: item.next }));
  return { ok: true, problems: [], items };
}
export function provenanceDictionary(document, options = {}) {
  const check = validateRehearsal(document, options);
  if (!check.ok) return { ok: false, problems: check.problems, sources: [] };
  const values = new Map();
  for (const item of [...document.assets, ...document.sessions]) {
    const meta = sourceView(item.provenance);
    const key = JSON.stringify(meta);
    if (!values.has(key)) values.set(key, { ...meta, recordCount: 0 });
    values.get(key).recordCount += 1;
  }
  const sources = [...values.values()].sort((a, b) => a.source.localeCompare(b.source, 'en'));
  return { ok: true, problems: [], sources };
}
