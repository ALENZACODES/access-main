import type { LocalizedText } from './audit.js';
import type { CheckResult, Entry } from './types.js';

export interface MediaOptions {
  colorScheme?: 'light' | 'dark';
  reducedMotion?: 'reduce' | 'no-preference';
  forcedColors?: 'active' | 'none';
}

export interface Profile {
  readonly id: string;
  readonly label: LocalizedText;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly media: MediaOptions;
  /** Checks that do not apply when the browser overrides colours. */
  readonly skipContrast?: boolean;
}

export const PROFILES: readonly Profile[] = [
  {
    id: 'narrow',
    label: { en: '320px wide', fr: 'Largeur de 320\u00A0px' },
    viewport: { width: 320, height: 640 },
    media: { colorScheme: 'light', reducedMotion: 'no-preference', forcedColors: 'none' },
  },
  {
    id: 'landscape',
    label: { en: 'Landscape phone', fr: 'Téléphone en paysage' },
    viewport: { width: 640, height: 320 },
    media: { colorScheme: 'light', reducedMotion: 'no-preference', forcedColors: 'none' },
  },
  {
    id: 'dark',
    label: { en: 'Dark colour scheme', fr: 'Thème sombre' },
    viewport: { width: 320, height: 640 },
    media: { colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none' },
  },
  {
    id: 'reduced-motion',
    label: { en: 'Reduced motion', fr: 'Animations réduites' },
    viewport: { width: 320, height: 640 },
    media: { colorScheme: 'light', reducedMotion: 'reduce', forcedColors: 'none' },
  },
  {
    id: 'forced-colors',
    label: { en: 'Forced colours', fr: 'Couleurs forcées' },
    viewport: { width: 320, height: 640 },
    media: { colorScheme: 'light', reducedMotion: 'no-preference', forcedColors: 'active' },
    skipContrast: true,
  },
];

export const DEFAULT_PROFILE: Profile = PROFILES[0] as Profile;

/** "all" or a comma list of profile ids. */
export function selectProfiles(spec: string): Profile[] | null {
  if (spec === 'all') return [...PROFILES];
  const out: Profile[] = [];
  for (const id of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const p = PROFILES.find((x) => x.id === id);
    if (!p) return null;
    out.push(p);
  }
  return out.length > 0 ? out : null;
}

export interface MotionResult {
  readonly running: number;
  readonly infinite: number;
  readonly ids: readonly string[];
}

/** Runs in the page. Counts animations that are running right now. */
export function motionProbeInPage(_arg: null): MotionResult {
  void _arg;
  interface Anim {
    playState: string;
    effect?: { target?: { tagName?: string; id?: string } | null; getComputedTiming?(): { iterations?: number } } | null;
  }
  const doc = (globalThis as unknown as { document: { getAnimations?(): Anim[] } }).document;
  const all = doc.getAnimations ? doc.getAnimations() : [];
  let running = 0;
  let infinite = 0;
  const ids: string[] = [];
  for (const a of all) {
    if (a.playState !== 'running') continue;
    running++;
    const iterations = a.effect?.getComputedTiming?.().iterations;
    if (iterations === Infinity) infinite++;
    const t = a.effect?.target;
    if (t && ids.length < 5) ids.push(`${(t.tagName ?? '').toLowerCase()}${t.id ? '#' + t.id : ''}`);
  }
  return { running, infinite, ids };
}

/**
 * With reduced motion requested, nothing should still be running. Otherwise an
 * animation that never ends may need a way to pause it, which a script cannot
 * judge, so it is reported as unknown.
 */
export function auditMotion(res: MotionResult, reducedMotion: boolean): CheckResult {
  const entries: Entry[] = [];
  if (reducedMotion && res.running > 0) {
    entries.push({
      check: 'motion',
      id: res.ids.join(', ') || 'page',
      status: 'fail',
      rule: 'reduced-motion',
      message: {
        en: `${res.running} animation(s) kept running although reduced motion was requested.`,
        fr: `${res.running} animation(s) ont continué malgré la demande de réduction des animations.`,
      },
    });
  } else if (!reducedMotion && res.infinite > 0) {
    entries.push({
      check: 'motion',
      id: res.ids.join(', ') || 'page',
      status: 'unknown',
      rule: 'endless',
      message: {
        en: `${res.infinite} animation(s) never end. Check that people can pause them.`,
        fr: `${res.infinite} animation(s) ne s’arrêtent jamais. Assurez-vous que l’on peut les mettre en pause.`,
      },
    });
  }
  return { checked: 1, entries };
}
