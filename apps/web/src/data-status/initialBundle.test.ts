import { describe, expect, it } from 'vitest';

/**
 * Keeps this folder out of the initial bundle (perf gates: home LCP and time
 * to first result). The only door in is the lazy route chunk for /data-status.
 * These checks read source text, so they say nothing about bundle bytes; the
 * measured bundle comes from the build and the perf spec.
 */
const sources = import.meta.glob<string>('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]*data-status[^'"]*)['"]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function outside(path: string): boolean {
  return !path.startsWith('../data-status/') && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx');
}

describe('data-status stays out of the initial bundle', () => {
  it('is imported statically only by the lazy /data-status page', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      if (!outside(path)) continue;
      for (const match of text.matchAll(STATIC_IMPORT)) {
        if (path !== '../pages/DataStatusPage.tsx') offenders.push(`${path} -> ${match[1] ?? ''}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reaches the page only through a dynamic import in the route chunks', () => {
    const chunks = sources['../perf/routeChunks.ts'] ?? '';
    const targets = [...chunks.matchAll(DYNAMIC_IMPORT)].map((m) => m[1]);
    expect(targets).toContain('../pages/DataStatusPage.tsx');
    for (const [path, text] of Object.entries(sources)) {
      if (!outside(path) || path === '../perf/routeChunks.ts') continue;
      for (const match of text.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*['"][^'"]*DataStatusPage[^'"]*['"]/g)) {
        expect(`${path}: ${match[0].trim()}`).toBe('no static import of DataStatusPage');
      }
    }
  });

  it('has no top-level side effects that would register work at load', () => {
    const risky = /^(?:window|document|navigator|self)\.[\w.]+\s*(?:=|\()/m;
    const offenders = Object.entries(sources)
      .filter(([path]) => path.startsWith('../data-status/') && !path.endsWith('.test.ts') && !path.includes('/standalone/'))
      .filter(([, text]) => risky.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
