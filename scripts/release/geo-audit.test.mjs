import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validPosition, positionsEqual, validBoundingBox, inspectGeometry,
  inspectFeature, inspectGeoJson, findExplicitStates,
} from './geo-audit.mjs';

const feature = (options = {}) => ({
  type: 'Feature', id: 'place-1',
  geometry: { type: 'Point', coordinates: [-79.4, 43.7] },
  properties: { name: 'Demonstration location', stepFreeEntrance: 'UNKNOWN' },
  ...options,
});
const collection = (...features) => ({ type: 'FeatureCollection', features });
const has = (issues, code) => assert.ok(issues.some((item) => item.code === code),
  `Expected ${code}: ${JSON.stringify(issues)}`);
const clean = (value) => assert.deepEqual(inspectGeoJson(value), []);

describe('GeoJSON coordinate positions', () => {
  for (const point of [[0, 0], [-180, -90], [180, 90], [-79.4, 43.7], [10, 20, 30]]) {
    it(`accepts ${JSON.stringify(point)}`, () => assert.equal(validPosition(point), true));
  }
  for (const point of [[], [0], [0, 0, 0, 0], [-181, 1], [181, 0], [0, -91],
    [0, 91], ['1', 2], [NaN, 1], [Infinity, 1], null, {}]) {
    it(`rejects ${JSON.stringify(point)}`, () => assert.equal(validPosition(point), false));
  }
  it('compares coordinate dimensions', () => assert.equal(positionsEqual([0, 1], [0, 1, 0]), false));
  it('compares coordinate values', () => assert.equal(positionsEqual([0, 1], [0, 2]), false));
  it('accepts matching coordinates', () => assert.equal(positionsEqual([-79, 43], [-79, 43]), true));
});

describe('GeoJSON bounding boxes', () => {
  it('accepts a standard bbox', () => assert.equal(validBoundingBox([-80, 40, -78, 45]), true));
  it('accepts altitude bounds', () => assert.equal(validBoundingBox([-80, 40, -5, -78, 45, 10]), true));
  it('accepts antimeridian wrap', () => assert.equal(validBoundingBox([170, 0, -170, 10]), true));
  for (const bbox of [[], [0, 0, 1], [0, 5, 1, -5], [-200, 0, 0, 10],
    [0, -100, 10, 0], [0, 0, NaN, 5], [0, 0, 10, 3, 2, 1], null]) {
    it(`rejects ${JSON.stringify(bbox)}`, () => assert.equal(validBoundingBox(bbox), false));
  }
});

describe('GeoJSON geometry transport integrity', () => {
  it('accepts a point', () => clean({ type: 'Point', coordinates: [0, 0] }));
  it('accepts a multipoint', () => clean({ type: 'MultiPoint', coordinates: [[0, 0], [1, 1]] }));
  it('accepts a line', () => clean({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }));
  it('accepts a multiline', () => clean({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] }));
  it('accepts a polygon', () => clean({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }));
  it('accepts a multipolygon', () => clean({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] }));
  it('accepts a geometry collection', () => clean({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }] }));
  it('accepts an empty collection', () => clean({ type: 'GeometryCollection', geometries: [] }));
  it('rejects an invalid geometry type', () => has(inspectGeometry({ type: 'Circle' }, 'a.geojson'), 'GEO_TYPE'));
  it('rejects an invalid point', () => has(inspectGeometry({ type: 'Point', coordinates: [999, 2] }, 'a.geojson'), 'GEO_COORDINATES'));
  it('rejects a short line', () => has(inspectGeometry({ type: 'LineString', coordinates: [[0, 0]] }, 'a.geojson'), 'GEO_COORDINATES'));
  it('rejects a short ring', () => has(inspectGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] }, 'a.geojson'), 'GEO_COORDINATES'));
  it('rejects an open ring', () => has(inspectGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [2, 2]]] }, 'a.geojson'), 'GEO_COORDINATES'));
  it('rejects empty multipolygons', () => has(inspectGeometry({ type: 'MultiPolygon', coordinates: [] }, 'a.geojson'), 'GEO_COORDINATES'));
  it('rejects invalid collection children', () => has(inspectGeometry({ type: 'GeometryCollection', geometries: [null] }, 'a.geojson'), 'GEO_TYPE'));
  it('rejects malformed geometry collections', () => has(inspectGeometry({ type: 'GeometryCollection' }, 'a.geojson'), 'GEO_COLLECTION'));
  it('rejects deep nesting', () => has(inspectGeometry({ type: 'Point', coordinates: [0, 0] }, 'a.geojson', 'geometry', 21), 'GEO_DEPTH'));
  it('rejects invalid geometry bounding boxes', () => has(inspectGeometry({ type: 'Point', coordinates: [0, 0], bbox: [0, 4, 1, 1] }, 'a.geojson'), 'GEO_BBOX'));
});

describe('GeoJSON feature evidence', () => {
  it('accepts unknown without recorded evidence', () => clean(collection(feature())));
  it('does not infer a claim from coordinates', () => clean(collection(feature({ properties: { name: 'Place' } }))));
  it('accepts sourced positive evidence', () => clean(collection(feature({ properties: {
    stepFreeEntrance: 'YES', source: 'Demonstration', licence: 'CC0-1.0', observedOn: '2026-11-15',
  } }))));
  it('accepts sourced negative evidence', () => clean(collection(feature({ properties: {
    accessibleParking: { state: 'NO', source: 'Demonstration', licence: 'CC0-1.0', date: '2026-11-15' },
  } }))));
  it('rejects unknown states outside the explicit enum', () => has(inspectFeature(feature({ properties: { liftAvailable: 'probably' } }), 'a.geojson'), 'GEO_STATE'));
  it('rejects missing source', () => has(inspectFeature(feature({ properties: { stepFreeEntrance: 'YES' } }), 'a.geojson'), 'GEO_SOURCE'));
  it('rejects missing licence', () => has(inspectFeature(feature({ properties: { stepFreeEntrance: 'YES', source: 'Local' } }), 'a.geojson'), 'GEO_LICENCE'));
  it('rejects missing date', () => has(inspectFeature(feature({ properties: { stepFreeEntrance: 'NO', source: 'Local', licence: 'CC0-1.0' } }), 'a.geojson'), 'GEO_DATE'));
  it('rejects closed licence', () => has(inspectFeature(feature({ properties: { stepFreeEntrance: 'YES', source: 'Local', licence: 'private', date: '2026-11-15' } }), 'a.geojson'), 'GEO_LICENCE'));
  it('rejects impossible dates', () => has(inspectFeature(feature({ properties: { stepFreeEntrance: 'YES', source: 'Local', licence: 'CC0-1.0', date: '2026-02-30' } }), 'a.geojson'), 'GEO_DATE'));
  it('accepts null geometry', () => clean(feature({ geometry: null })));
  it('accepts null properties', () => clean(feature({ properties: null })));
  it('rejects array properties', () => has(inspectFeature(feature({ properties: [] }), 'a.geojson'), 'GEO_PROPERTIES'));
  it('rejects non-feature entries', () => has(inspectFeature({}, 'a.geojson'), 'GEO_FEATURE'));
  it('rejects invalid ids', () => has(inspectFeature(feature({ id: '' }), 'a.geojson'), 'GEO_ID'));
  it('accepts numeric feature ids', () => clean(feature({ id: 0 })));
  it('extracts only explicit claims', () => assert.deepEqual(findExplicitStates({ stepFreeEntrance: 'UNKNOWN', name: 'A', doorWidth: 90 }), [{ field: 'stepFreeEntrance', state: 'UNKNOWN' }]));
});

describe('GeoJSON document integrity', () => {
  it('accepts an empty collection', () => clean(collection()));
  it('rejects a missing feature array', () => has(inspectGeoJson({ type: 'FeatureCollection' }), 'GEO_FEATURES'));
  it('rejects duplicate feature ids', () => has(inspectGeoJson(collection(feature(), feature())), 'GEO_DUPLICATE_ID'));
  it('rejects legacy CRS', () => has(inspectGeoJson({ ...collection(), crs: { type: 'name' } }), 'GEO_CRS'));
  it('rejects a broken bbox', () => has(inspectGeoJson({ ...collection(), bbox: [0, 2, 1, 1] }), 'GEO_BBOX'));
  it('rejects unsupported document types', () => has(inspectGeoJson({ type: 'Geometry' }), 'GEO_DOCUMENT_TYPE'));
  it('rejects non-object documents', () => has(inspectGeoJson(null), 'GEO_DOCUMENT'));
  it('rejects oversized collections', () => has(inspectGeoJson({ type: 'FeatureCollection', features: new Array(100001) }), 'GEO_FEATURE_LIMIT'));
  it('reports contextual file names', () => assert.equal(inspectGeoJson({ type: 'bad' }, 'fr/carte.geojson')[0].file, 'fr/carte.geojson'));
});
