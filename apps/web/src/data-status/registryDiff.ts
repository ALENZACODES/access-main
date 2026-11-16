/**
 * What changed between two registries (for example the saved copy and live data).
 * A retrieved date moving backwards, or a licence/date disappearing, is surfaced
 * first because it may mean data was lost rather than refreshed.
 */
import { parseRetrieved } from './dateRules';
import type { Locale } from './dataStatus';
import { cleanValue } from './unknownTokens';
import type { DatasetRecord } from './datasetRegistry';
import { t } from './i18n';
import { escapeHtml, type SourceInput } from './sourceList';

export type ChangeCode =
  | 'dataset-added'
  | 'dataset-removed'
  | 'source-added'
  | 'source-removed'
  | 'licence-changed'
  | 'licence-lost'
  | 'licence-added'
  | 'retrieved-advanced'
  | 'retrieved-regressed'
  | 'retrieved-lost'
  | 'retrieved-added';

export interface Change {
  code: ChangeCode;
  datasetId: string;
  datasetName: string;
  sourceId: string | null;
  from?: string;
  to?: string;
}

const RANK: Readonly<Record<ChangeCode, number>> = {
  'retrieved-regressed': 0,
  'retrieved-lost': 0,
  'licence-lost': 0,
  'licence-changed': 1,
  'dataset-removed': 2,
  'source-removed': 2,
  'dataset-added': 3,
  'source-added': 3,
  'licence-added': 4,
  'retrieved-added': 4,
  'retrieved-advanced': 5,
};

export function changeRank(code: ChangeCode): number {
  return RANK[code];
}

const clean = cleanValue;

/** YYYY-MM-DD when the value is a valid ISO date, else null. */
function dayOf(v: string | null | undefined): string | null {
  return parseRetrieved(v)?.day ?? null;
}

function firstById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const i of items) if (!m.has(i.id)) m.set(i.id, i);
  return m;
}

export function diffRegistries(prev: readonly DatasetRecord[], next: readonly DatasetRecord[]): Change[] {
  const out: Change[] = [];
  const a = firstById(prev);
  const b = firstById(next);
  const label = (r: DatasetRecord) => clean(r.name) ?? r.id;

  for (const [id, r] of b) {
    if (!a.has(id)) out.push({ code: 'dataset-added', datasetId: id, datasetName: label(r), sourceId: null });
  }
  for (const [id, r] of a) {
    const n = b.get(id);
    if (!n) {
      out.push({ code: 'dataset-removed', datasetId: id, datasetName: label(r), sourceId: null });
      continue;
    }
    const sa = firstById(r.sources);
    const sb = firstById(n.sources);
    const base = { datasetId: id, datasetName: label(n) };
    for (const [sid] of sb) if (!sa.has(sid)) out.push({ ...base, code: 'source-added', sourceId: sid });
    for (const [sid, from] of sa) {
      const to = sb.get(sid);
      if (!to) {
        out.push({ ...base, code: 'source-removed', sourceId: sid });
        continue;
      }
      diffSource(from, to, base, out);
    }
  }
  return out.sort(
    (x, y) =>
      changeRank(x.code) - changeRank(y.code) ||
      x.datasetName.localeCompare(y.datasetName) ||
      (x.sourceId ?? '').localeCompare(y.sourceId ?? '') ||
      x.code.localeCompare(y.code),
  );
}

function diffSource(
  from: SourceInput,
  to: SourceInput,
  base: { datasetId: string; datasetName: string },
  out: Change[],
): void {
  const sourceId = from.id;
  const la = clean(from.licence);
  const lb = clean(to.licence);
  if (la !== null && lb === null) out.push({ ...base, sourceId, code: 'licence-lost', from: la });
  else if (la === null && lb !== null) out.push({ ...base, sourceId, code: 'licence-added', to: lb });
  else if (la !== null && lb !== null && la !== lb) out.push({ ...base, sourceId, code: 'licence-changed', from: la, to: lb });

  const da = dayOf(from.retrievedAt);
  const db = dayOf(to.retrievedAt);
  if (da !== null && db === null) out.push({ ...base, sourceId, code: 'retrieved-lost', from: da });
  else if (da === null && db !== null) out.push({ ...base, sourceId, code: 'retrieved-added', to: db });
  else if (da !== null && db !== null && da !== db) {
    out.push({ ...base, sourceId, code: db > da ? 'retrieved-advanced' : 'retrieved-regressed', from: da, to: db });
  }
}

export function describeChange(c: Change, locale: Locale): string {
  const unknown = t(locale, 'unknown');
  const name = c.sourceId === null ? c.datasetName : `${c.datasetName} / ${c.sourceId}`;
  return t(locale, `diff.${c.code}`, { name, from: c.from ?? unknown, to: c.to ?? unknown });
}

export function countChanges(changes: readonly Change[]): Record<ChangeCode, number> {
  const out = Object.fromEntries(Object.keys(RANK).map((k) => [k, 0])) as Record<ChangeCode, number>;
  for (const c of changes) out[c.code]++;
  return out;
}

/** Changes worth a second look: dates going backwards or details disappearing. */
export function isAttentionChange(c: Change): boolean {
  return changeRank(c.code) === 0;
}

export function renderChangesHtml(changes: readonly Change[], locale: Locale): string {
  const body =
    changes.length === 0
      ? `<p>${escapeHtml(t(locale, 'diff.none'))}</p>`
      : `<ul>${changes.map((c) => `<li>${escapeHtml(describeChange(c, locale))}</li>`).join('')}</ul>`;
  return `<section aria-labelledby="ds-diff-title"><h2 id="ds-diff-title">${escapeHtml(t(locale, 'diff.title'))}</h2>${body}</section>`;
}
