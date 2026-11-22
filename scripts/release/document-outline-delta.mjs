/** Explicit before/after comparisons. Never treats missing proof as confirmation. */
import { UNKNOWN, validateManifest, lexical } from './document-outline-contract.mjs';
import { analyzeMarkdown } from './document-outline-parser.mjs';
import { reviewManifest } from './document-outline-review.mjs';
const order = (a, b) => lexical(a.path, b.path) || lexical(a.code, b.code);
const byId = arr => new Map(arr.map(d => [d.id, d]));
export function compareDocuments(before, after) {
  const old = byId(before.documents), current = byId(after.documents);
  const ids = [...new Set([...old.keys(), ...current.keys()])].sort(lexical);
  return ids.map(id => {
    const a = old.get(id), b = current.get(id);
    if (!a) return { id, path: b.path, kind: 'added', fields: [] };
    if (!b) return { id, path: a.path, kind: 'removed', fields: [] };
    const fields = ['path', 'language', 'pairId', 'title', 'body', 'state', 'source', 'licence', 'retrievedOn', 'tier']
      .filter(field => a[field] !== b[field]);
    return { id, path: b.path, kind: fields.length ? 'changed' : 'unchanged', fields };
  });
}
export function outlineChanges(before, after) {
  const old = byId(before.documents), result = [];
  for (const doc of after.documents) {
    if (!old.has(doc.id)) continue;
    const prev = analyzeMarkdown(old.get(doc.id).body), curr = analyzeMarkdown(doc.body);
    const left = prev.headings.map(h => `${h.level}:${h.anchor}`);
    const right = curr.headings.map(h => `${h.level}:${h.anchor}`);
    if (JSON.stringify(left) !== JSON.stringify(right)) result.push({ id: doc.id, path: doc.path, before: left, after: right });
  }
  return result.sort((a, b) => lexical(a.path, b.path));
}
export function linkChanges(before, after) {
  const old = byId(before.documents), result = [];
  for (const doc of after.documents) {
    if (!old.has(doc.id)) continue;
    const prev = analyzeMarkdown(old.get(doc.id).body).links.map(l => `${l.label}|${l.destination}`);
    const curr = analyzeMarkdown(doc.body).links.map(l => `${l.label}|${l.destination}`);
    const a = new Set(prev), b = new Set(curr);
    const added = curr.filter(x => !a.has(x)).sort(lexical), removed = prev.filter(x => !b.has(x)).sort(lexical);
    if (added.length || removed.length) result.push({ id: doc.id, path: doc.path, added, removed });
  }
  return result.sort((a, b) => lexical(a.path, b.path));
}
export function deltaFindings(beforeReview, afterReview) {
  const key = item => `${item.doc}|${item.code}|${item.line}|${item.detail}`;
  const old = new Set(beforeReview.value.issues.map(key)), current = new Set(afterReview.value.issues.map(key));
  const added = afterReview.value.issues.filter(i => !old.has(key(i))).map(i => ({ ...i, change: 'added' }));
  const resolved = beforeReview.value.issues.filter(i => !current.has(key(i))).map(i => ({ ...i, change: 'removed' }));
  return { added: added.sort(order), resolved: resolved.sort(order) };
}
export function compareManifest(before, after, options = {}) {
  const a = validateManifest(before, options), b = validateManifest(after, options);
  if (!a.ok || !b.ok) return { ok: false, errors: [...(a.ok ? [] : a.errors), ...(b.ok ? [] : b.errors)] };
  const past = reviewManifest(before, options), current = reviewManifest(after, options);
  if (!past.ok || !current.ok) return { ok: false, errors: [...(past.ok ? [] : past.errors), ...(current.ok ? [] : current.errors)] };
  const changed = compareDocuments(before, after);
  const findings = deltaFindings(past, current);
  const positive = changed.filter(d => d.kind === 'added' || d.kind === 'changed');
  return { ok: true, value: { before: before.capturedOn, after: after.capturedOn, documents: changed,
    outlines: outlineChanges(before, after), links: linkChanges(before, after), findings,
    caution: UNKNOWN, requireReview: positive.length > 0 || findings.added.length > 0 } };
}
