/** Deterministic release drill: a finding is a request for human inspection. */
import { inspectDrill, GATE_RULES } from './offline-drill-core.mjs';

export const DRILL_SEVERITY = Object.freeze(['block', 'review', 'information']);
export const GATE_STATUSES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
const RISK_WEIGHT = Object.freeze({ block: 3, review: 2, information: 1 });
const SEVERITY = new Set(DRILL_SEVERITY);
function finding(code, capture, path, severity, detail, source = null) {
  return Object.freeze({ code, capture, path, severity, detail, source });
}
function order(a, b) {
  const risk = (RISK_WEIGHT[b.severity] ?? 0) - (RISK_WEIGHT[a.severity] ?? 0);
  return risk || a.capture.localeCompare(b.capture, 'en') ||
    a.path.localeCompare(b.path, 'en') || a.code.localeCompare(b.code, 'en');
}
export function inspectCaptureState(capture, sources) {
  const findings = [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const add = (code, path, severity, detail, source = null) =>
    findings.push(finding(code, capture.id, path, severity, detail, source));
  if (capture.network === 'offline') {
    if (capture.shell === 'FAIL') add('OFFLINE_SHELL_FAIL', '/shell', 'block', 'Local shell was not available');
    if (capture.shell === 'UNKNOWN') add('OFFLINE_SHELL_UNKNOWN', '/shell', 'review', 'Shell result was not supplied');
  }
  if (capture.network === 'UNKNOWN') add('NETWORK_UNKNOWN', '/network', 'review', 'Network state not supplied');
  if (capture.storage === 'blocked') add('STORAGE_BLOCKED', '/storage', 'block', 'Local persistence was blocked');
  if (capture.storage === 'UNKNOWN') add('STORAGE_UNKNOWN', '/storage', 'review', 'Storage state not supplied');
  if (capture.privacy === 'FAIL') add('PRIVACY_FAIL', '/privacy', 'block', 'Privacy boundary check failed');
  if (capture.privacy === 'UNKNOWN') add('PRIVACY_UNKNOWN', '/privacy', 'review', 'Privacy boundary check missing');
  if (capture.consent === 'FAIL') add('CONSENT_FAIL', '/consent', 'block', 'Consent boundary check failed');
  if (capture.consent === 'UNKNOWN') add('CONSENT_UNKNOWN', '/consent', 'review', 'Consent boundary check missing');
  if (capture.shell === 'FAIL' && capture.network !== 'offline') {
    add('SHELL_FAIL', '/shell', 'block', 'Shell was unavailable during observation');
  }
  for (const [i, control] of capture.controls.entries()) {
    const path = `/controls/${i}`;
    if (control.keyboard === 'FAIL') add('KEYBOARD_FAIL', `${path}/keyboard`, 'block', 'Keyboard operation failed');
    if (control.keyboard === 'UNKNOWN') add('KEYBOARD_UNKNOWN', `${path}/keyboard`, 'review', 'Keyboard operation untested');
    if (control.focus === 'FAIL') add('FOCUS_FAIL', `${path}/focus`, 'block', 'Focus indicator absent');
    if (control.focus === 'UNKNOWN') add('FOCUS_UNKNOWN', `${path}/focus`, 'review', 'Focus visibility untested');
    if (control.target.width < 44 || control.target.height < 44) {
      add('TARGET_SMALL', `${path}/target`, 'block', 'Target under 44 by 44 CSS pixels');
    }
    if (control.keyboard === 'PASS' && control.focus === 'FAIL') {
      add('FOCUS_KEYBOARD_CONFLICT', path, 'review', 'Keyboard reachable but focus not visible');
    }
    if (!control.name[capture.locale]) add('LANGUAGE_MISSING', `${path}/name`, 'block', 'Control name missing');
  }
  for (const [i, asset] of capture.assets.entries()) {
    const path = `/assets/${i}`;
    if (asset.available === 'NO') add('ASSET_ABSENT', `${path}/available`, 'block', 'Locally expected asset absent');
    if (asset.available === 'UNKNOWN') add('ASSET_UNKNOWN', `${path}/available`, 'review', 'Asset was not checked');
    if (asset.shell && capture.network === 'offline' && asset.available !== 'YES') {
      add('SHELL_ASSET_UNAVAILABLE', path, 'block', 'Offline shell dependency not available');
    }
    if (asset.sha256 === null) add('ASSET_DIGEST_UNKNOWN', `${path}/sha256`, 'review', 'Digest was not supplied');
  }
  const usedSources = new Set();
  for (const [i, claim] of capture.claims.entries()) {
    const path = `/claims/${i}`;
    usedSources.add(claim.sourceId);
    const source = sourceById.get(claim.sourceId);
    if (!source) add('SOURCE_NOT_FOUND', `${path}/sourceId`, 'block', 'Source missing');
    if (claim.state === 'UNKNOWN') {
      add('CLAIM_UNKNOWN', `${path}/state`, 'information', 'Claim remains UNKNOWN', source?.provenance ?? null);
    }
    if (claim.state !== 'UNKNOWN') {
      add('CLAIM_REVIEW', `${path}/state`, 'review', 'Human review needed for captured statement', source?.provenance ?? null);
    }
    if (source && capture.provenance.retrievedOn < source.provenance.retrievedOn) {
      add('SOURCE_AFTER_CAPTURE', path, 'review', 'Source retrieved after capture', source.provenance);
    }
  }
  for (const source of sources) {
    if (usedSources.has(source.id) && source.provenance.tier === 4 && capture.network === 'offline') {
      add('NETWORK_SOURCE_CONTEXT', '/claims', 'review', 'Source type may depend on connectivity', source.provenance);
    }
  }
  return Object.freeze(findings.sort(order));
}
export function evaluateDrill(value, options = {}) {
  const validated = inspectDrill(value, options);
  if (!validated.ok) {
    return { ok: false, problems: validated.problems, findings: [], summary: null, captures: [] };
  }
  const findings = value.captures.flatMap((capture) => inspectCaptureState(capture, value.sources)).sort(order);
  const captures = [...value.captures].sort((a, b) => a.id.localeCompare(b.id, 'en')).map((capture) => {
    const own = findings.filter((item) => item.capture === capture.id);
    const count = (severity) => own.filter((entry) => entry.severity === severity).length;
    const blocks = count('block');
    const reviews = count('review');
    return {
      id: capture.id, route: capture.route, locale: capture.locale,
      network: capture.network, storage: capture.storage,
      state: blocks ? 'FAIL' : reviews ? 'UNKNOWN' : 'PASS',
      findings: own.length, blocks, reviews, information: count('information'),
    };
  });
  const counter = (severity) => findings.filter((entry) => entry.severity === severity).length;
  return {
    ok: true, problems: [], findings,
    captures,
    summary: {
      total: value.captures.length,
      blocks: counter('block'), reviews: counter('review'), information: counter('information'),
      pass: captures.filter((c) => c.state === 'PASS').length,
      fail: captures.filter((c) => c.state === 'FAIL').length,
      unknown: captures.filter((c) => c.state === 'UNKNOWN').length,
      status: captures.some((c) => c.state === 'FAIL') ? 'FAIL' :
        captures.some((c) => c.state === 'UNKNOWN') ? 'UNKNOWN' : 'PASS',
    },
  };
}
export function gateMatrix(result, input) {
  if (!result?.ok || !Array.isArray(input?.captures)) return null;
  const rows = [];
  const map = new Map(result.captures.map((capture) => [capture.id, capture]));
  for (const capture of input.captures) {
    const output = map.get(capture.id);
    if (!output) return null;
    const own = result.findings.filter((finding) => finding.capture === capture.id);
    const has = (codes) => own.some((finding) => codes.includes(finding.code));
    const g = (failCodes, unknownCodes) =>
      has(failCodes) ? 'FAIL' : has(unknownCodes) ? 'UNKNOWN' : 'PASS';
    const checks = {
      SOURCE_METADATA: capture.claims.every((claim) => input.sources.some((source) => source.id === claim.sourceId)) ? 'PASS' : 'FAIL',
      UNKNOWN_PRESERVED: capture.claims.every((claim) => ['YES', 'NO', 'UNKNOWN'].includes(claim.state)) ? 'PASS' : 'FAIL',
      LOCAL_ASSET: g(['ASSET_ABSENT'], ['ASSET_UNKNOWN', 'ASSET_DIGEST_UNKNOWN']),
      OFFLINE_SHELL: g(['OFFLINE_SHELL_FAIL', 'SHELL_ASSET_UNAVAILABLE'], ['OFFLINE_SHELL_UNKNOWN']),
      KEYBOARD_REACHABLE: g(['KEYBOARD_FAIL'], ['KEYBOARD_UNKNOWN']),
      FOCUS_VISIBLE: g(['FOCUS_FAIL'], ['FOCUS_UNKNOWN']),
      TARGET_SIZE: g(['TARGET_SMALL'], []),
      LANGUAGE_COPY: g(['LANGUAGE_MISSING'], []),
      PRIVACY_LIMIT: g(['PRIVACY_FAIL'], ['PRIVACY_UNKNOWN']),
      CONSENT_BOUNDARY: g(['CONSENT_FAIL'], ['CONSENT_UNKNOWN']),
      NETWORK_DISCLOSURE: capture.network === 'UNKNOWN' ? 'UNKNOWN' : 'PASS',
      STORAGE_DISCLOSURE: capture.storage === 'UNKNOWN' ? 'UNKNOWN' : capture.storage === 'blocked' ? 'FAIL' : 'PASS',
    };
    rows.push({ captureId: capture.id, route: capture.route, locale: capture.locale,
      checks, status: output.state });
  }
  return rows.sort((a, b) => a.captureId.localeCompare(b.captureId, 'en'));
}
export function summarizeGates(rows) {
  if (!Array.isArray(rows)) return null;
  return GATE_RULES.map((rule) => {
    const data = rows.map((row) => row.checks?.[rule] ?? 'UNKNOWN');
    return {
      rule, pass: data.filter((value) => value === 'PASS').length,
      fail: data.filter((value) => value === 'FAIL').length,
      unknown: data.filter((value) => value === 'UNKNOWN').length,
      status: data.includes('FAIL') ? 'FAIL' : data.includes('UNKNOWN') ? 'UNKNOWN' : 'PASS',
    };
  });
}
export function compareDrills(earlier, later, options = {}) {
  const a = evaluateDrill(earlier, options);
  const b = evaluateDrill(later, options);
  if (!a.ok || !b.ok) {
    return { ok: false, problems: [...a.problems.map((p) => ({ ...p, run: 'earlier' })),
      ...b.problems.map((p) => ({ ...p, run: 'later' }))], changes: [], summary: null };
  }
  const left = new Map(a.captures.map((capture) => [capture.id, capture]));
  const right = new Map(b.captures.map((capture) => [capture.id, capture]));
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort((x, y) => x.localeCompare(y, 'en'));
  const changes = [];
  for (const id of ids) {
    const x = left.get(id);
    const y = right.get(id);
    if (!x) changes.push({ id, kind: 'added', before: null, after: y.state });
    else if (!y) changes.push({ id, kind: 'removed', before: x.state, after: null });
    else if (x.state !== y.state) changes.push({ id, kind: 'state-changed', before: x.state, after: y.state });
    else if (x.findings !== y.findings || x.blocks !== y.blocks || x.reviews !== y.reviews) {
      changes.push({ id, kind: 'findings-changed', before: x.state, after: y.state });
    }
  }
  return { ok: true, problems: [], changes,
    summary: { changes: changes.length, added: changes.filter((x) => x.kind === 'added').length,
      removed: changes.filter((x) => x.kind === 'removed').length,
      stateChanged: changes.filter((x) => x.kind === 'state-changed').length } };
}
export function findingSeverity(value) {
  return SEVERITY.has(value) ? RISK_WEIGHT[value] : null;
}
