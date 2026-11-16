/**
 * Evidence record checks for release JSON. Only structured, explicitly
 * identifiable accessibility records are inspected. No measurements imply
 * accessibility and UNKNOWN never becomes YES or NO.
 */
import { finding, isOpenLicence, isValidDate } from './site-audit.mjs';

export const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
export const EVIDENCE_KEYS = new Set([
  'stepFreeEntrance', 'accessibleEntrance', 'accessibleParking',
  'accessibleWashroom', 'accessibleWashrooms', 'accessibleToilet',
  'liftAvailable', 'elevator', 'ramp', 'automaticDoor', 'stepFree',
  'accessibleSeating', 'doorWidth', 'turningSpace', 'clearWidth',
  'transferSpace', 'threshold', 'accessibleRoute',
]);
export const SOURCE_KEYS = ['source', 'sourceUrl', 'source_url'];
export const LICENCE_KEYS = ['licence', 'license', 'licenceId', 'licenseId'];
export const DATE_KEYS = ['observedOn', 'observed_on', 'updatedAt', 'updated_at', 'date'];

export function firstKey(object, alternatives) {
  return alternatives.find((key) => Object.hasOwn(object, key));
}

export function metadata(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    return { source: null, licence: null, date: null };
  }
  const source = firstKey(object, SOURCE_KEYS);
  const licence = firstKey(object, LICENCE_KEYS);
  const date = firstKey(object, DATE_KEYS);
  return {
    source: source ? object[source] : null,
    licence: licence ? object[licence] : null,
    date: date ? object[date] : null,
  };
}

export function metadataIssues(object, file, pointer) {
  const issues = [];
  const meta = metadata(object);
  if (typeof meta.source !== 'string' || !meta.source.trim()) {
    issues.push(finding('EVIDENCE_SOURCE', file, `${pointer}: source missing`));
  }
  if (!isOpenLicence(meta.licence)) {
    issues.push(finding('EVIDENCE_LICENCE', file,
      `${pointer}: open licence identifier missing`));
  }
  if (!isValidDate(meta.date)) {
    issues.push(finding('EVIDENCE_DATE', file,
      `${pointer}: valid ISO calendar date missing`));
  }
  return issues;
}

export function isEvidenceValue(value) {
  if (typeof value === 'string') return STATES.has(value);
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.hasOwn(value, 'state') || Object.hasOwn(value, 'value') &&
      typeof value.value === 'string' && STATES.has(value.value));
}

export function explicitState(value) {
  if (typeof value === 'string') return STATES.has(value) ? value : null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value.state ?? value.value;
  return typeof state === 'string' ? state : null;
}

export function recordFields(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return [];
  const fields = [];
  for (const [name, value] of Object.entries(record)) {
    if (EVIDENCE_KEYS.has(name) && isEvidenceValue(value)) {
      fields.push({ name, value, owner: record });
    }
  }
  for (const name of ['fields', 'accessibility', 'accessibilityFields', 'features']) {
    const child = record[name];
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
    for (const [field, value] of Object.entries(child)) {
      if (EVIDENCE_KEYS.has(field) && isEvidenceValue(value)) {
        fields.push({ name: `${name}/${field}`, value, owner: record });
      }
    }
  }
  return fields;
}

export function inspectRecord(record, file, pointer = '') {
  const issues = [];
  const fields = recordFields(record);
  for (const field of fields) {
    const location = `${pointer}/${field.name}`;
    const state = explicitState(field.value);
    if (!STATES.has(state)) {
      issues.push(finding('EVIDENCE_STATE', file,
        `${location}: expected YES, NO or UNKNOWN`));
      continue;
    }
    // Deliberately do not turn UNKNOWN into a negative condition.
    // UNKNOWN may be included without evidence, provided it remains UNKNOWN.
    if (state === 'UNKNOWN') continue;
    const own = metadata(field.value);
    const hasOwn = typeof own.source === 'string' && own.source.trim() &&
      isOpenLicence(own.licence) && isValidDate(own.date);
    if (!hasOwn) {
      issues.push(...metadataIssues(field.owner, file, location));
    }
  }
  return issues;
}

export function locationRecords(document) {
  if (Array.isArray(document)) return document;
  if (!document || typeof document !== 'object') return [];
  for (const name of ['features', 'places', 'locations', 'results', 'records']) {
    if (Array.isArray(document[name])) return document[name];
  }
  if (document.type === 'FeatureCollection' && Array.isArray(document.features)) {
    return document.features;
  }
  return [];
}

export function inspectReleasedRecords(document, file) {
  const issues = [];
  const records = locationRecords(document);
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object') continue;
    const location = `/records/${index}`;
    const candidate = record.type === 'Feature' && record.properties ?
      record.properties : record;
    issues.push(...inspectRecord(candidate, file, location));
    if (record.type === 'Feature' && record.properties) {
      for (const field of recordFields(candidate)) {
        const state = explicitState(field.value);
        if (state === 'YES' || state === 'NO') {
          const own = metadata(field.value);
          const props = metadata(candidate);
          if (!(typeof own.source === 'string' && own.source.trim() &&
            isOpenLicence(own.licence) && isValidDate(own.date)) &&
            !(typeof props.source === 'string' && props.source.trim() &&
            isOpenLicence(props.licence) && isValidDate(props.date))) {
            // Provenance may be in the GeoJSON Feature rather than properties.
            const full = metadata(record);
            if (!(typeof full.source === 'string' && full.source.trim() &&
              isOpenLicence(full.licence) && isValidDate(full.date))) {
              // The initial inspection already reports the missing fields.
            } else {
              const prefix = `${location}/${field.name}`;
              for (let i = issues.length - 1; i >= 0; i -= 1) {
                if (issues[i].detail.startsWith(prefix + ':') &&
                  /^EVIDENCE_(SOURCE|LICENCE|DATE)$/.test(issues[i].code)) {
                  issues.splice(i, 1);
                }
              }
            }
          }
        }
      }
    }
  }
  return issues;
}

export function inspectEvidenceLists(document, file) {
  const issues = [];
  if (!document || typeof document !== 'object') return issues;
  const lists = [];
  if (Array.isArray(document.evidence)) lists.push(['evidence', document.evidence]);
  if (Array.isArray(document.sources)) lists.push(['sources', document.sources]);
  for (const [name, entries] of lists) {
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== 'object') {
        issues.push(finding('SOURCE_ENTRY', file,
          `/${name}/${index}: expected source object`));
        continue;
      }
      issues.push(...metadataIssues(entry, file, `/${name}/${index}`));
    }
  }
  return issues;
}

export function sourceSummary(document) {
  const records = locationRecords(document);
  let yes = 0;
  let no = 0;
  let unknown = 0;
  for (const record of records) {
    const candidate = record?.properties ?? record;
    for (const field of recordFields(candidate)) {
      const state = explicitState(field.value);
      if (state === 'YES') yes += 1;
      else if (state === 'NO') no += 1;
      else if (state === 'UNKNOWN') unknown += 1;
    }
  }
  return { records: records.length, yes, no, unknown };
}
