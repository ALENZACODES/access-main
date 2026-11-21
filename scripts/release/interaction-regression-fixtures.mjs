/** Synthetic fixtures: no actual places, accounts, coordinates or health data. */
export const FIXTURE_DAY = '2026-11-20';
export const HASH_A = 'a'.repeat(64);
export const HASH_B = 'b'.repeat(64);

export function sampleCheck(id = 'keyboard-main', category = 'keyboard', changes = {}) {
  return {
    id,
    category,
    outcome: 'UNKNOWN',
    label: {
      en: 'Synthetic interaction review',
      fr: 'Examen d’une interaction fictive',
    },
    source: 'https://example.org/synthetic-evidence',
    licence: 'CC0-1.0',
    retrievedOn: '2026-11-19',
    tier: 0,
    artifactSha256: HASH_A,
    ...changes,
  };
}

export function sampleRun(id = 'sample-en', changes = {}) {
  return {
    id,
    route: '/examples',
    locale: 'en',
    network: 'offline',
    storage: 'ready',
    viewport: { width: 390, height: 844 },
    checks: [sampleCheck()],
    ...changes,
  };
}

export function sampleSnapshot(releaseId = 'release-a', changes = {}) {
  return {
    version: 1,
    releaseId,
    capturedOn: FIXTURE_DAY,
    runs: [sampleRun()],
    ...changes,
  };
}

export function pairedSnapshot(releaseId = 'release-a', changes = {}) {
  return sampleSnapshot(releaseId, {
    runs: [sampleRun(), sampleRun('sample-fr', { locale: 'fr' })],
    ...changes,
  });
}

export function sampleCoveragePolicy(changes = {}) {
  return {
    version: 1,
    routes: ['/examples'],
    locales: ['en', 'fr'],
    networks: ['offline'],
    storages: ['ready'],
    viewports: [{ width: 390, height: 844 }],
    categories: ['keyboard', 'focus', 'screen-reader'],
    ...changes,
  };
}

export function changedSnapshot(outcome = 'FAIL', releaseId = 'release-b') {
  return sampleSnapshot(releaseId, {
    runs: [sampleRun('sample-en', {
      checks: [sampleCheck('keyboard-main', 'keyboard', { outcome })],
    })],
  });
}

export function copy(value) {
  return JSON.parse(JSON.stringify(value));
}
