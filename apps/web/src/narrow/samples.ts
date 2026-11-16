import { auditContrast } from './contrast.js';
import { auditCopy, COPY_RULES } from './copylint.js';
import { auditFocusObscured } from './focus.js';
import { lintHtml } from './htmllint.js';
import { auditI18n } from './i18n.js';
import { auditKeyboard } from './keyboard.js';
import { auditLanguage, auditNames } from './names.js';
import { offlineCheckResult } from './offline.js';
import { auditMotion } from './profiles.js';
import { auditProvenance } from './provenance.js';
import { entriesFromFindings } from './report.js';
import { auditTargetSpacing } from './spacing.js';
import { auditTextSpacing } from './textspacing.js';
import type { Entry, Rect } from './types.js';

/**
 * One entry from every check and every rule, with both languages filled in.
 * The wording and typography gates read the messages from here, so a new rule
 * that is missing from this list is still caught by the coverage test.
 */
export function sampleEntries(): Entry[] {
  const rect: Rect = { left: 0, top: 0, right: 1, bottom: 1 };
  const el = (id: string, name: string, text: string) => ({ id, tag: 'a', role: null, rect, name, text });
  const badHtml =
    '<html><head></head><body><h1>a</h1><h3>b</h3><img src="a.png"><button></button><input type="email">' +
    '<p id="d"></p><p id="d"></p><div tabindex="2"></div><div aria-hidden="true"><button>x</button></div>' +
    '<button aria-labelledby="zz">x</button><a href="/x">click here</a><iframe></iframe><video autoplay></video>' +
    '<button style="width:20px">go</button><main></main><main></main></body></html>';
  const allCopy = COPY_RULES.map((r, i) => ({ id: `r${i}`, text: SAMPLE_TEXT[r.id] ?? '' }));
  return [
    ...Object.values(
      entriesFromFindings([
        { kind: 'target-too-small', id: 'a', width: 30, height: 30, overflowPx: 0 },
        { kind: 'horizontal-overflow', id: 'a', width: 30, height: 30, overflowPx: 9 },
        { kind: 'page-scrolls-sideways', id: 'page', width: 400, height: 0, overflowPx: 80 },
      ]),
    ).flat(),
    ...auditTargetSpacing([
      { id: 'a', ...rect, right: 10, bottom: 10 },
      { id: 'b', left: 12, top: 0, right: 22, bottom: 10 },
    ]).entries,
    ...auditContrast([
      { id: 'a', text: 'x', fg: '#777', bgLayers: ['rgb(255, 255, 255)'], bgImage: false, fontSizePx: 16, fontWeight: 400 },
      { id: 'b', text: 'x', fg: '#777', bgLayers: [], bgImage: true, fontSizePx: 16, fontWeight: 400 },
    ]).entries,
    ...auditNames([el('a', '', ''), el('b', 'Menu', 'Home')]).names.entries,
    ...auditNames([el('b', 'Menu', 'Home')]).labels.entries,
    ...auditLanguage({ lang: '' }).entries,
    ...auditLanguage({ lang: '!!' }).entries,
    ...auditFocusObscured([
      { id: 'a', rect, covers: [rect], focused: true },
      { id: 'b', rect, covers: [], focused: false },
    ]).entries,
    ...auditTextSpacing({ checked: 1, newlyClipped: [{ id: 'a', scrollWidth: 1, clientWidth: 1, scrollHeight: 2, clientHeight: 1 }] }).entries,
    ...auditI18n(
      { a: 'x', b: 'y', c: 'z {n}', d: 'Same text that is long enough', e: 'e' },
      { b: ' ', c: 'z', d: 'Same text that is long enough', f: 'f', e: "l'e" },
    ).entries,
    ...(['unsupported', 'no-service-worker', 'error-page', 'empty-page', 'exception'] as const).flatMap(
      (reason) => offlineCheckResult('/', { status: reason === 'unsupported' ? 'unknown' : 'fail', reason }).entries,
    ),
    ...lintHtml(badHtml).entries,
    ...auditCopy(allCopy).entries,
    ...auditProvenance(
      [
        { id: 'a', facts: { x: 'maybe', y: null, z: { value: 'yes', evidence: 'probably' }, w: 'yes' } },
        { id: 'b', source: { name: 'n', url: 'http://x', licence: 'Custom', retrieved: '2999-01-01' }, facts: {} },
        { id: 'c', source: { name: 'n', url: 'https://x', licence: 'MIT', retrieved: '2026-02-30' } },
        { id: 'd', source: { name: '', url: '', licence: '', retrieved: '' } },
        7,
      ],
      { now: new Date('2026-11-15T00:00:00Z'), requiredFacts: ['ramp'] },
    ).entries,
    ...auditProvenance('nope', { now: new Date() }).entries,
    ...auditKeyboard({
      baseline: [
        { id: 'a', sig: 's', ctx: 'c', tabbable: true },
        { id: 'b', sig: 's', ctx: 'c', tabbable: true },
        { id: 'c', sig: 's', ctx: 'c', tabbable: true },
      ],
      steps: [
        { index: 1, id: 'b', sig: 's', ctx: 'c', rect: { left: 0, top: 500, right: 1, bottom: 510 }, leftPage: false },
        { index: 1, id: 'b', sig: 's', ctx: 'c', rect: rect, leftPage: false },
        { index: 1, id: 'b', sig: 's', ctx: 'c', rect: rect, leftPage: false },
        { index: -1, id: 'body', sig: '', ctx: '', rect, leftPage: true },
      ],
      capped: false,
    }).keyboard.entries,
    ...auditKeyboard({
      baseline: [{ id: 'a', sig: 's', ctx: 'c', tabbable: true }],
      steps: [{ index: 0, id: 'a', sig: 's', ctx: 'c', rect, leftPage: false }],
      capped: true,
    }).focusVisible.entries,
    ...auditMotion({ running: 2, infinite: 1, ids: ['div#a'] }, true).entries,
    ...auditMotion({ running: 2, infinite: 1, ids: ['div#a'] }, false).entries,
  ];
}

/** One text that breaks each wording rule, keyed by rule id. */
export const SAMPLE_TEXT: Readonly<Record<string, string>> = {
  'claim-checked': 'Verified by our team',
  'claim-live': 'Real-time updates',
  'claim-relationship': 'In partnership with a charity',
  'claim-promise': 'We guarantee access',
  'claim-conformance': 'Fully accessible',
  'mention-tech': 'Powered by AI',
  'mention-tech-terms': 'Uses machine learning',
  'mention-org': 'Spinal Cord Injury Ontario',
  'advice-eligibility': 'You qualify for support',
  'advice-medical': 'Consult your doctor',
  'claim-complete': 'Always up to date',
};
