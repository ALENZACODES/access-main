/** Explicit content integrity rules for released JSON documents. */
import { finding, isOpenLicence, isValidDate, provenanceOf } from './site-audit.mjs';

const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
const ACCESS_KEYS = new Set([
  'stepFreeEntrance', 'stepFree', 'accessibleEntrance',
  'accessibleWashroom', 'accessibleWashrooms', 'accessibleToilet',
  'accessibleParking', 'liftAvailable', 'elevator', 'ramp',
  'automaticDoor', 'accessibleSeating', 'turningSpace', 'doorWidth',
]);
const CLAIM_WRAPPER = new Set(['state', 'source', 'licence', 'license',
  'observedOn', 'date', 'sourceUrl', 'updatedAt', 'notes', 'value',
]);
const ID_KEYS = ['id', 'placeId', 'locationId'];
const TEXT_KEYS = ['name', 'label', 'title'];

function pointerPart(raw) {
  return raw.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function walkJson(value, visit, pointer = '', depth = 0, seen = new WeakSet()) {
  if (depth > 64 || value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  visit(value, pointer, depth);
  for (const [key, child] of Object.entries(value)) {
    walkJson(child, visit, `${pointer}/${pointerPart(key)}`, depth + 1, seen);
  }
}

export function evidenceState(value) {
  if (typeof value === 'string') return STATES.has(value) ? value : null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return typeof value.state === 'string' ? value.state : null;
}

export function isPlaceLike(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false;
  const hasId = ID_KEYS.some((key) => typeof value[key] === 'string');
  const hasName = TEXT_KEYS.some((key) => typeof value[key] === 'string');
  return Boolean(hasId && hasName && (value.fields || value.accessibility || value.features));
}

export function placeIdentity(value) {
  return ID_KEYS.map((key) => value[key]).find((value) =>
    typeof value === 'string' && value.trim()) ?? null;
}

export function claimedFields(place) {
  const containers = [place.fields, place.accessibility, place.features];
  const results = [];
  for (const container of containers) {
    if (!container || Array.isArray(container) || typeof container !== 'object') continue;
    for (const [key, value] of Object.entries(container)) {
      if (!ACCESS_KEYS.has(key)) continue;
      results.push({ key, value, state: evidenceState(value) });
    }
  }
  return results;
}

export function inspectPlaceIntegrity(value, file, pointer) {
  const issues = [];
  const id = placeIdentity(value);
  if (!id) issues.push(finding('CONTENT_PLACE_ID', file,
    `${pointer}: place has no nonempty identity`));
  for (const field of claimedFields(value)) {
    const at = `${pointer}/${field.key}`;
    if (field.state === null &&
        (typeof field.value === 'boolean' || field.value === null ||
         typeof field.value === 'string')) {
      issues.push(finding('CONTENT_ACCESS_STATE', file,
        `${at}: use explicit YES, NO or UNKNOWN rather than inferred access`));
      continue;
    }
    if (field.state !== null && !STATES.has(field.state)) {
      issues.push(finding('CONTENT_ACCESS_STATE', file,
        `${at}: unsupported accessibility state`));
      continue;
    }
    if (field.state === 'UNKNOWN') continue;
    if (field.state === 'YES' || field.state === 'NO') {
      const owner = provenanceOf(value);
      const own = provenanceOf(field.value);
      if (!own.valid && !owner.valid) {
        issues.push(finding('CONTENT_ACCESS_SOURCE', file,
          `${at}: explicit access needs source, open licence and date`));
      }
    }
    if (field.value && typeof field.value === 'object' &&
        !Array.isArray(field.value)) {
      const unexpected = Object.keys(field.value).filter((key) =>
        !CLAIM_WRAPPER.has(key));
      // Extensions are permitted: no error for user-defined descriptive data.
      void unexpected;
    }
  }
  return issues;
}

export function inspectUniquePlaces(value, file) {
  const issues = [];
  const ids = new Map();
  walkJson(value, (node, pointer) => {
    if (!isPlaceLike(node)) return;
    const id = placeIdentity(node);
    if (!id) return;
    if (ids.has(id)) {
      issues.push(finding('CONTENT_DUPLICATE_PLACE', file,
        `${pointer}: repeated place identity ${id} (first ${ids.get(id)})`));
    } else ids.set(id, pointer);
    issues.push(...inspectPlaceIntegrity(node, file, pointer));
  });
  return issues;
}

export function inspectCredits(value, file) {
  const issues = [];
  walkJson(value, (node, pointer) => {
    if (!node || Array.isArray(node)) return;
    // Narrowly scoped: only actual named credit entries are examined.
    if (!Object.hasOwn(node, 'attribution') ||
        !Object.hasOwn(node, 'licence')) return;
    if (typeof node.attribution !== 'string' || !node.attribution.trim()) {
      issues.push(finding('CONTENT_ATTRIBUTION', file,
        `${pointer}: attribution must contain text`));
    }
    if (!isOpenLicence(node.licence)) {
      issues.push(finding('CONTENT_LICENCE', file,
        `${pointer}: unsupported or missing open licence`));
    }
    if (Object.hasOwn(node, 'observedOn') &&
        !isValidDate(node.observedOn)) {
      issues.push(finding('CONTENT_DATE', file,
        `${pointer}: invalid calendar date`));
    }
  });
  return issues;
}

export function inspectUnknownIntegrity(value, file) {
  const issues = [];
  walkJson(value, (node, pointer) => {
    if (!node || Array.isArray(node)) return;
    if (node.state !== 'UNKNOWN') return;
    for (const key of ['inferred', 'assumed', 'autoFilled']) {
      if (node[key] === true) {
        issues.push(finding('CONTENT_UNKNOWN_INFERENCE', file,
          `${pointer}: unknown state cannot be inferred into a claim`));
      }
    }
    if (node.accessible === true || node.accessible === false) {
      issues.push(finding('CONTENT_UNKNOWN_CONFLICT', file,
        `${pointer}: unknown state conflicts with an accessibility boolean`));
    }
  });
  return issues;
}

export function inspectContentJson(value, file) {
  if (!value || typeof value !== 'object') return [];
  return [
    ...inspectUniquePlaces(value, file),
    ...inspectCredits(value, file),
    ...inspectUnknownIntegrity(value, file),
  ];
}
