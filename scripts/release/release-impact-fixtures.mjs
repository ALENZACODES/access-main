/** Fictional sample manifests for release impact tests, never claims about real places. */
export const DAY = '2026-11-21';
export const SHA_A = 'a'.repeat(64);
export const SHA_B = 'b'.repeat(64);
export const SHA_C = 'c'.repeat(64);
export function asset(id = 'index', changes = {}) {
  return {
    id, path: `assets/${id}.js`, sha256: SHA_A, bytes: 100, kind: 'script', locale: 'en',
    entry: false, dependsOn: [], source: 'Fictional build manifest', licence: 'CC0-1.0',
    retrievedOn: DAY, tier: 'source-documented', ...changes,
  };
}
export function manifest(...assets) { return { version: 1, createdOn: DAY, assets: assets.length ? assets : [asset('index', { entry: true })] }; }
export function bilingual() { return manifest(asset('en', { entry: true, locale: 'en', dependsOn: ['shared'] }),
  asset('fr', { entry: true, locale: 'fr', dependsOn: ['shared'] }), asset('shared', { kind: 'script', locale: 'both' })); }
export function chain() { return manifest(asset('index', { entry: true, dependsOn: ['app'] }),
  asset('app', { dependsOn: ['vendor'] }), asset('vendor')); }
export function mutate(value) { return JSON.parse(JSON.stringify(value)); }
