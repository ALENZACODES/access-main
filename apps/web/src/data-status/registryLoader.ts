/**
 * Strict loader for registry JSON from outside the app. Anything unreadable is
 * reported with a path and treated as missing (so it shows as Unknown); nothing
 * is repaired by guessing. Licence names that match the reference table exactly
 * (by alias) are rewritten to the canonical id and reported as a warning.
 */
import type { DatasetRecord } from './datasetRegistry';
import { isDatasetKind } from './freshnessPolicy';
import { t } from './i18n';
import type { Locale } from './dataStatus';
import { normaliseLicence } from './licences';
import type { SourceInput } from './sourceList';

export type LoadCode =
  | 'not-json'
  | 'not-array'
  | 'not-object'
  | 'missing-id'
  | 'bad-kind'
  | 'bad-sources'
  | 'bad-field'
  | 'licence-normalised';

export interface LoadIssue {
  /** error: the dataset, source or field could not be read and is treated as missing. warning: read, with a note. */
  severity: 'error' | 'warning';
  code: LoadCode;
  path: string;
  licence?: string;
}

export interface RegistryLoadResult {
  records: DatasetRecord[];
  issues: LoadIssue[];
  /** false when the input as a whole was unusable (not JSON, not a list). */
  usable: boolean;
}

export interface LoadOptions {
  normaliseLicences?: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function describeLoadIssue(issue: LoadIssue, locale: Locale): string {
  return t(locale, `load.${issue.code}`, { path: issue.path, licence: issue.licence ?? '' });
}

type TextField = 'name' | 'url' | 'source' | 'licence' | 'retrievedAt';
const SOURCE_TEXT_FIELDS: readonly TextField[] = ['name', 'url', 'source', 'licence', 'retrievedAt'];

function readSource(raw: unknown, path: string, issues: LoadIssue[], opts: LoadOptions): SourceInput | null {
  if (!isObj(raw)) {
    issues.push({ severity: 'error', code: 'not-object', path });
    return null;
  }
  if (typeof raw['id'] !== 'string' || raw['id'].trim() === '') {
    issues.push({ severity: 'error', code: 'missing-id', path: `${path}.id` });
    return null;
  }
  const out: SourceInput = { id: raw['id'] };
  for (const f of SOURCE_TEXT_FIELDS) {
    const v = raw[f];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') {
      issues.push({ severity: 'error', code: 'bad-field', path: `${path}.${f}` });
      continue;
    }
    out[f] = v;
  }
  if (opts.normaliseLicences !== false && typeof out.licence === 'string') {
    const m = normaliseLicence(out.licence);
    if (m.id !== null && m.changed) {
      issues.push({ severity: 'warning', code: 'licence-normalised', path: `${path}.licence`, licence: m.id });
      out.licence = m.id;
    }
  }
  return out;
}

export function parseRegistry(input: unknown, opts: LoadOptions = {}): RegistryLoadResult {
  const issues: LoadIssue[] = [];
  const list = Array.isArray(input) ? input : isObj(input) && Array.isArray(input['datasets']) ? input['datasets'] : null;
  if (list === null) {
    issues.push({ severity: 'error', code: 'not-array', path: '' });
    return { records: [], issues, usable: false };
  }
  const records: DatasetRecord[] = [];
  list.forEach((raw: unknown, i: number) => {
    const path = `datasets[${i}]`;
    if (!isObj(raw)) {
      issues.push({ severity: 'error', code: 'not-object', path });
      return;
    }
    if (typeof raw['id'] !== 'string' || raw['id'].trim() === '') {
      issues.push({ severity: 'error', code: 'missing-id', path: `${path}.id` });
      return;
    }
    if (!isDatasetKind(raw['kind'])) {
      issues.push({ severity: 'error', code: 'bad-kind', path: `${path}.kind` });
      return;
    }
    if (!Array.isArray(raw['sources'])) {
      issues.push({ severity: 'error', code: 'bad-sources', path: `${path}.sources` });
      return;
    }
    let name = '';
    if (typeof raw['name'] === 'string') name = raw['name'];
    else if (raw['name'] !== undefined && raw['name'] !== null) {
      issues.push({ severity: 'error', code: 'bad-field', path: `${path}.name` });
    }
    const sources: SourceInput[] = [];
    raw['sources'].forEach((s: unknown, j: number) => {
      const read = readSource(s, `${path}.sources[${j}]`, issues, opts);
      if (read !== null) sources.push(read);
    });
    records.push({ id: raw['id'], name, kind: raw['kind'], sources });
  });
  return { records, issues, usable: true };
}

export function parseRegistryText(text: string, opts: LoadOptions = {}): RegistryLoadResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { records: [], issues: [{ severity: 'error', code: 'not-json', path: '' }], usable: false };
  }
  return parseRegistry(json, opts);
}
