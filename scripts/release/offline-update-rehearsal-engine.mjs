/**
 * Derive a conservative review outcome from a supplied offline update trace.
 * This is not a browser simulation: it cannot infer a successful installation
 * from filenames, dates or source tiers. Only recorded events establish states.
 */
import { createHash } from 'node:crypto';
import { validateRehearsal, RESULTS, PHASES } from './offline-update-rehearsal-contract.mjs';

export const REVIEW_RULES = Object.freeze([
  'COMPLETE_TRACE', 'SHELL_SURVIVES', 'ASSETS_AVAILABLE', 'UPDATE_ATOMIC',
  'RESTART_USABLE', 'ROLLBACK_USABLE', 'KEYBOARD_OPERABLE', 'FOCUS_RETAINED',
  'ANNOUNCEMENT_RECORDED', 'STORAGE_RESILIENT', 'LANGUAGE_COVERAGE',
]);
const EVENT_RULES = Object.freeze({
  'shell-response': 'SHELL_SURVIVES',
  'asset-response': 'ASSETS_AVAILABLE',
  activation: 'UPDATE_ATOMIC',
  restart: 'RESTART_USABLE',
  rollback: 'ROLLBACK_USABLE',
  'keyboard-check': 'KEYBOARD_OPERABLE',
  'focus-check': 'FOCUS_RETAINED',
  'announcement-check': 'ANNOUNCEMENT_RECORDED',
  'storage-check': 'STORAGE_RESILIENT',
});
const RISK_RANK = { FAIL: 2, UNKNOWN: 1, PASS: 0 };

function finding(code, path, severity = 'review') {
  return { code, path, severity };
}
function aggregate(states) {
  if (states.includes('FAIL')) return 'FAIL';
  if (states.length === 0 || states.includes('UNKNOWN')) return 'UNKNOWN';
  return 'PASS';
}
export function eventDigest(events) {
  const record = events.map(event => ({
    id: event.id, kind: event.kind, order: event.order, state: event.state,
    assetId: event.assetId ?? null, note: event.note ?? null,
  }));
  return createHash('sha256').update(JSON.stringify(record), 'utf8').digest('hex');
}
export function rulesForSession(session) {
  const rules = Object.fromEntries(REVIEW_RULES.map(rule => [rule, 'UNKNOWN']));
  const found = [];
  const buckets = new Map();
  for (const [index, event] of session.events.entries()) {
    const rule = EVENT_RULES[event.kind];
    if (!rule) {
      if (event.kind === 'error' && event.state === 'FAIL') {
        found.push(finding('RECORDED_ERROR', `/sessions/${session.id}/events/${index}`, 'block'));
      }
      continue;
    }
    if (!buckets.has(rule)) buckets.set(rule, []);
    buckets.get(rule).push(event.state);
  }
  for (const [rule, states] of buckets) rules[rule] = aggregate(states);
  rules.COMPLETE_TRACE = session.events.length === 0 ? 'UNKNOWN' : aggregate(session.events.map(event => event.state));
  const known = Object.values(rules).filter(value => value !== 'UNKNOWN');
  for (const [rule, state] of Object.entries(rules)) {
    if (state === 'FAIL') found.push(finding('RULE_FAIL', `/sessions/${session.id}/rules/${rule}`, 'block'));
    if (state === 'UNKNOWN') found.push(finding('RULE_UNKNOWN', `/sessions/${session.id}/rules/${rule}`));
  }
  if (session.outcome === 'PASS' && (Object.values(rules).includes('FAIL') || session.events.length === 0)) {
    found.push(finding('OUTCOME_CONTRADICTS_TRACE', `/sessions/${session.id}/outcome`, 'block'));
  }
  if (session.outcome === 'FAIL' && !session.events.some(event => event.state === 'FAIL')) {
    found.push(finding('UNEXPLAINED_FAILURE', `/sessions/${session.id}/outcome`));
  }
  return { rules, findings: found, recorded: session.outcome, observedRules: known.length, digest: eventDigest(session.events) };
}
export function assetDependents(assets) {
  const reverse = new Map(assets.map(asset => [asset.id, new Set()]));
  for (const asset of assets) {
    for (const dependency of asset.dependsOn) reverse.get(dependency)?.add(asset.id);
  }
  return reverse;
}
export function dependencyCycles(assets) {
  const graph = new Map(assets.map(asset => [asset.id, asset.dependsOn]));
  const completed = new Set();
  const visiting = new Set();
  const cycles = [];
  for (const root of graph.keys()) {
    if (completed.has(root)) continue;
    const stack = [{ node: root, next: 0 }];
    visiting.add(root);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = graph.get(frame.node) ?? [];
      if (frame.next >= neighbors.length) {
        completed.add(frame.node);
        visiting.delete(frame.node);
        stack.pop();
        continue;
      }
      const neighbor = neighbors[frame.next];
      frame.next += 1;
      if (!graph.has(neighbor)) continue;
      if (visiting.has(neighbor)) {
        const beginning = stack.findIndex(item => item.node === neighbor);
        cycles.push(stack.slice(beginning).map(item => item.node).concat(neighbor));
        continue;
      }
      if (!completed.has(neighbor)) {
        visiting.add(neighbor);
        stack.push({ node: neighbor, next: 0 });
      }
    }
  }
  return cycles;
}
export function affectedAssets(assets, changed) {
  const reverse = assetDependents(assets);
  const result = new Set(changed.filter(id => reverse.has(id)));
  const queue = [...result];
  for (let index = 0; index < queue.length; index += 1) {
    for (const dependent of reverse.get(queue[index]) ?? []) {
      if (!result.has(dependent)) {
        result.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return [...result].sort((a, b) => a.localeCompare(b, 'en'));
}
export function assetReview(assets) {
  const found = [];
  for (const [index, asset] of assets.entries()) {
    if (asset.state === 'FAIL') found.push(finding('ASSET_FAILURE', `/assets/${index}/state`, 'block'));
    if (asset.state === 'UNKNOWN') found.push(finding('ASSET_UNKNOWN', `/assets/${index}/state`));
    if (asset.bytes > 524_288 && asset.path.endsWith('.js')) {
      found.push(finding('SCRIPT_CHUNK_BUDGET', `/assets/${index}/bytes`, 'block'));
    }
  }
  for (const cycle of dependencyCycles(assets)) {
    found.push(finding('ASSET_DEPENDENCY_CYCLE', `/assets/${cycle[0]}/dependsOn`, 'block'));
  }
  return found;
}
export function sessionReview(session) {
  const { rules, findings, recorded, observedRules, digest } = rulesForSession(session);
  const state = recorded === 'FAIL' || findings.some(x => x.severity === 'block') ? 'FAIL' :
    recorded === 'UNKNOWN' || Object.values(rules).includes('UNKNOWN') ? 'UNKNOWN' : 'PASS';
  return {
    id: session.id, phase: session.phase, locale: session.locale,
    network: session.network, recordedOn: session.recordedOn, recorded,
    state, rules, observedRules, digest,
    evidence: { ...session.provenance },
    findings,
  };
}
export function releaseReview(document, options = {}) {
  const check = validateRehearsal(document, options);
  if (!check.ok) return { ok: false, problems: check.problems, findings: [], sessions: [], summary: null };
  const sessions = [...document.sessions].sort((a, b) => a.id.localeCompare(b.id, 'en')).map(sessionReview);
  const findings = assetReview(document.assets);
  for (const session of sessions) findings.push(...session.findings);
  const summary = {
    sessions: sessions.length,
    assets: document.assets.length,
    state: aggregate([...sessions.map(session => session.state), ...document.assets.map(asset => asset.state)]),
    pass: sessions.filter(x => x.state === 'PASS').length,
    fail: sessions.filter(x => x.state === 'FAIL').length,
    unknown: sessions.filter(x => x.state === 'UNKNOWN').length,
    assetUnknown: document.assets.filter(x => x.state === 'UNKNOWN').length,
    findings: findings.length,
    observedRules: sessions.reduce((total, session) => total + session.observedRules, 0),
  };
  const snapshot = JSON.stringify({ sessions: sessions.map(s => [s.id, s.state, s.digest]), assets: document.assets.map(a => [a.id, a.sha256, a.state]) });
  return {
    ok: true, problems: [], sessions, findings, summary,
    fingerprint: createHash('sha256').update(snapshot).digest('hex'),
  };
}
export function comparePriority(before, after) {
  if (before === after) return 'unchanged';
  if (after === 'FAIL' && before !== 'FAIL') return 'regressed';
  if (after === 'UNKNOWN') return 'evidence-missing';
  if (before === 'UNKNOWN') return 'requires-review';
  return RISK_RANK[after] < RISK_RANK[before] ? 'improved-record' : 'regressed';
}
export function phaseCoverage(document, options = {}) {
  const check = validateRehearsal(document, options);
  if (!check.ok) return { ok: false, problems: check.problems, rows: [] };
  const rows = [];
  for (const phase of PHASES) {
    for (const locale of ['en', 'fr']) {
      for (const network of ['online', 'offline']) {
        const matches = document.sessions.filter(s => s.phase === phase && s.locale === locale && s.network === network);
        rows.push({ phase, locale, network, count: matches.length,
          state: matches.length ? aggregate(matches.map(s => s.outcome)) : 'UNKNOWN',
        });
      }
    }
  }
  return { ok: true, problems: [], rows };
}
export function nextManualReviews(document, options = {}) {
  const report = releaseReview(document, options);
  if (!report.ok) return { ok: false, problems: report.problems, work: [] };
  const work = report.sessions.filter(s => s.state !== 'PASS').map(s => ({
    id: s.id, phase: s.phase, locale: s.locale, network: s.network,
    outcome: s.state, source: s.evidence.source, licence: s.evidence.licence,
    retrievedOn: s.evidence.retrievedOn, tier: s.evidence.tier,
    rules: Object.entries(s.rules).filter(([, state]) => state !== 'PASS').map(([name]) => name),
  }));
  return { ok: true, problems: [], work };
}
