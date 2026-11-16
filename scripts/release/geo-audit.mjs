/** GeoJSON export gates: structure, safe bounds, provenance and explicit states. */
import { finding, hasText, isOpenLicence, isValidDate } from './site-audit.mjs';

const GEOMETRIES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString',
  'Polygon', 'MultiPolygon', 'GeometryCollection']);
const STATES = new Set(['YES', 'NO', 'UNKNOWN']);
const ACCESS_KEYS = new Set([
  'stepFreeEntrance', 'accessibleEntrance', 'accessibleWashroom',
  'accessibleToilet', 'accessibleParking', 'liftAvailable', 'stepFree',
  'elevator', 'ramp', 'automaticDoor', 'accessibleSeating',
]);
const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;
const MAX_DEPTH = 20;
const MAX_FEATURES = 100_000;

export function validPosition(point) {
  return Array.isArray(point) && (point.length === 2 || point.length === 3) &&
    point.every((value) => typeof value === 'number' && Number.isFinite(value)) &&
    point[0] >= LNG_MIN && point[0] <= LNG_MAX &&
    point[1] >= LAT_MIN && point[1] <= LAT_MAX;
}

export function positionsEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((value, index) => value === b[index]);
}

export function validBoundingBox(bbox) {
  if (!Array.isArray(bbox) || ![4, 6].includes(bbox.length)) return false;
  if (!bbox.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    return false;
  }
  const dimensions = bbox.length / 2;
  const west = bbox[0];
  const south = bbox[1];
  const east = bbox[dimensions];
  const north = bbox[dimensions + 1];
  if (west < LNG_MIN || west > LNG_MAX || east < LNG_MIN || east > LNG_MAX ||
    south < LAT_MIN || south > LAT_MAX || north < LAT_MIN || north > LAT_MAX) {
    return false;
  }
  // Latitude is never allowed to wrap; longitude may wrap the antimeridian.
  if (south > north) return false;
  if (dimensions === 3 && bbox[2] > bbox[5]) return false;
  return true;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function lineValid(points) {
  return Array.isArray(points) && points.length >= 2 &&
    points.every(validPosition);
}

function ringValid(points) {
  return Array.isArray(points) && points.length >= 4 &&
    points.every(validPosition) && positionsEqual(points[0], points.at(-1));
}

function polygonValid(rings) {
  return Array.isArray(rings) && rings.length > 0 && rings.every(ringValid);
}

/**
 * Geometry validation enforces transport integrity only. It does not classify
 * a path, entrance, building or service as accessible from its coordinates.
 */
export function inspectGeometry(geometry, file, location = 'geometry', depth = 0) {
  const issues = [];
  const add = (code, message) => issues.push(finding(code, file, `${location}: ${message}`));
  if (depth > MAX_DEPTH) {
    add('GEO_DEPTH', 'Geometry nesting exceeds the maximum depth');
    return issues;
  }
  if (!isObject(geometry) || !GEOMETRIES.has(geometry.type)) {
    add('GEO_TYPE', 'Unrecognised geometry type');
    return issues;
  }
  if (geometry.bbox !== undefined && !validBoundingBox(geometry.bbox)) {
    add('GEO_BBOX', 'Invalid geometry bounding box');
  }
  if (geometry.type === 'GeometryCollection') {
    if (!Array.isArray(geometry.geometries)) {
      add('GEO_COLLECTION', 'GeometryCollection requires geometries array');
      return issues;
    }
    for (const [index, child] of geometry.geometries.entries()) {
      issues.push(...inspectGeometry(child, file, `${location}.geometries[${index}]`, depth + 1));
    }
    return issues;
  }
  const coordinates = geometry.coordinates;
  const valid = {
    Point: () => validPosition(coordinates),
    MultiPoint: () => Array.isArray(coordinates) && coordinates.length > 0 &&
      coordinates.every(validPosition),
    LineString: () => lineValid(coordinates),
    MultiLineString: () => Array.isArray(coordinates) && coordinates.length > 0 &&
      coordinates.every(lineValid),
    Polygon: () => polygonValid(coordinates),
    MultiPolygon: () => Array.isArray(coordinates) && coordinates.length > 0 &&
      coordinates.every(polygonValid),
  }[geometry.type]();
  if (!valid) add('GEO_COORDINATES', 'Invalid geometry coordinates or topology');
  return issues;
}

export function findExplicitStates(properties) {
  if (!isObject(properties)) return [];
  const states = [];
  for (const [field, raw] of Object.entries(properties)) {
    if (!ACCESS_KEYS.has(field)) continue;
    if (typeof raw === 'string') states.push({ field, state: raw });
    else if (isObject(raw) && Object.hasOwn(raw, 'state')) {
      states.push({ field, state: raw.state, evidence: raw });
    }
  }
  return states;
}

function featureProvenance(feature, claim) {
  const properties = feature.properties ?? {};
  const owner = claim?.evidence ?? properties;
  const source = owner.source ?? owner.sourceUrl;
  const licence = owner.licence ?? owner.license;
  const date = owner.observedOn ?? owner.date;
  return { source, licence, date };
}

export function inspectFeature(feature, file, index = 0) {
  const issues = [];
  const location = `features[${index}]`;
  const add = (code, message) => issues.push(finding(code, file, `${location}: ${message}`));
  if (!isObject(feature) || feature.type !== 'Feature') {
    add('GEO_FEATURE', 'Entry must be a GeoJSON Feature');
    return issues;
  }
  if (feature.geometry !== null) {
    issues.push(...inspectGeometry(feature.geometry, file, `${location}.geometry`));
  }
  if (feature.properties !== null && !isObject(feature.properties)) {
    add('GEO_PROPERTIES', 'Properties must be an object or null');
    return issues;
  }
  if (feature.id !== undefined &&
    !(typeof feature.id === 'string' && feature.id.trim()) &&
    !(typeof feature.id === 'number' && Number.isFinite(feature.id))) {
    add('GEO_ID', 'Feature id must be a nonempty string or finite number');
  }
  if (feature.bbox !== undefined && !validBoundingBox(feature.bbox)) {
    add('GEO_BBOX', 'Feature bounding box is invalid');
  }
  const states = findExplicitStates(feature.properties);
  for (const claim of states) {
    if (!STATES.has(claim.state)) {
      add('GEO_STATE', `${claim.field} must remain YES, NO or UNKNOWN`);
      continue;
    }
    if (claim.state === 'UNKNOWN') continue;
    const provenance = featureProvenance(feature, claim);
    if (!hasText(provenance.source)) add('GEO_SOURCE',
      `${claim.field} has no source`);
    if (!isOpenLicence(provenance.licence)) add('GEO_LICENCE',
      `${claim.field} has no accepted open licence`);
    if (!isValidDate(provenance.date)) add('GEO_DATE',
      `${claim.field} has no valid observation date`);
  }
  return issues;
}

export function inspectGeoJson(value, file = 'map.geojson') {
  const issues = [];
  const add = (code, message) => issues.push(finding(code, file, message));
  if (!isObject(value)) {
    add('GEO_DOCUMENT', 'GeoJSON must be an object');
    return issues;
  }
  if (Object.hasOwn(value, 'crs')) {
    add('GEO_CRS', 'Legacy coordinate reference systems are not supported');
  }
  if (value.bbox !== undefined && !validBoundingBox(value.bbox)) {
    add('GEO_BBOX', 'Document bounding box is invalid');
  }
  if (value.type === 'FeatureCollection') {
    if (!Array.isArray(value.features)) {
      add('GEO_FEATURES', 'FeatureCollection needs a features array');
      return issues;
    }
    if (value.features.length > MAX_FEATURES) {
      add('GEO_FEATURE_LIMIT', 'Feature collection exceeds the size bound');
      return issues;
    }
    const ids = new Set();
    for (const [index, feature] of value.features.entries()) {
      issues.push(...inspectFeature(feature, file, index));
      if (feature && (typeof feature.id === 'string' || typeof feature.id === 'number')) {
        const key = String(feature.id);
        if (ids.has(key)) add('GEO_DUPLICATE_ID', `Duplicate feature id: ${key}`);
        ids.add(key);
      }
    }
  } else if (value.type === 'Feature') {
    issues.push(...inspectFeature(value, file));
  } else if (GEOMETRIES.has(value.type)) {
    issues.push(...inspectGeometry(value, file, 'geometry'));
  } else add('GEO_DOCUMENT_TYPE', 'Unsupported top-level GeoJSON type');
  return issues;
}
