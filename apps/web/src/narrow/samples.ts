import { applyWaivers, parseWaivers } from './ci.js';
import { auditBudget } from './budget.js';
import { auditConsistency } from './consistency.js';
import { auditContrast } from './contrast.js';
import { auditCopy, COPY_RULES } from './copylint.js';
import { auditFocusObscured } from './focus.js';
import { lintHtml } from './htmllint.js';
import { auditHosts } from './hostlint.js';
import { auditI18n } from './i18n.js';
import { auditKeyboard } from './keyboard.js';
import { lintManifest } from './manifestlint.js';
import { auditParity } from './parity.js';
import { auditLanguage, auditNames } from './names.js';
import { offlineCheckResult } from './offline.js';
import { auditMotion } from './profiles.js';
import { auditControlBoundaries, auditDragging, auditLinkCues, type PageFacts } from './probes.js';
import { auditProvenance } from './provenance.js';
import { buildRouteAudit, entriesFromFindings, makeReport } from './report.js';
import { auditTargetSpacing } from './spacing.js';
import { lintServiceWorker } from './swlint.js';
import { auditAuth } from './auth.js';
import { auditForms } from './forms.js';
import { auditClipping, auditFixedSpace } from './layoutspace.js';
import { auditLangParts } from './langparts.js';
import { auditMedia } from './media.js';
import { auditStatus } from './status.js';
import { auditWeight } from './weight.js';
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
    '<html><head><link rel="alternate" hreflang="english" href="/e"></head><body><h1>a</h1><h3>b</h3><img src="a.png"><button></button><input type="email">' +
    '<p id="d"></p><p id="d"></p><div tabindex="2"></div><div aria-hidden="true"><button>x</button></div>' +
    '<button aria-labelledby="zz">x</button><a href="/x">click here</a><iframe></iframe><video autoplay></video>' +
    '<button style="width:20px">go</button><main></main><main></main>' +
    '<table><tr><td>a</td></tr></table><table><tr><th>A</th></tr><tr><td>1</td></tr></table>' +
    '<input type="radio" name="r"><input type="radio" name="r"><a href="/y"><button>in</button></a><h2></h2>' +
    '<svg role="img"></svg><svg></svg><video src="v.mp4"></video><meta http-equiv="refresh" content="5">' +
    '<input autocomplete="e-mail"><li>x</li><p lang="english">x</p><nav></nav><nav></nav>' +
    '<button accesskey="a">a</button><button accesskey="a">b</button>' +
    '<input aria-invalid="true"><input autofocus><details></details><dialog></dialog></body></html>';
  const facts = (over: Partial<PageFacts>): PageFacts => ({
    title: 'T', lang: 'en', links: [], controls: [], draggables: [], nav: ['A', 'B'], help: { text: 'Help', region: 'footer', afterMain: true }, truncated: false, ...over,
  });
  const light = ['rgb(255, 255, 255)'];
  const waiverReport = makeReport([buildRouteAudit('/x', 320, { contrast: { checked: 1, entries: [{ check: 'contrast', id: 'a', status: 'fail', message: { en: 'e', fr: 'f' } }] } })], new Date('2026-11-15T00:00:00Z'));
  const badWaivers = parseWaivers(JSON.stringify({ waivers: [{ check: 'contrast', reason: 'no', expires: 'x' }] }));
  const waiverEntries = applyWaivers(
    waiverReport,
    [
      { check: 'contrast', id: 'zzz', reason: 'matches nothing at all', expires: '2027-01-01' },
      { check: 'target-size', reason: 'expired long ago for sure', expires: '2020-01-01' },
    ],
    new Date('2026-11-15T00:00:00Z'),
    badWaivers.problems,
  ).report.routes.flatMap((r) => (r.route === 'waivers' ? r.entries : []));
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
    ...auditLinkCues([
      { id: 'a', text: 'x', color: 'rgb(60, 60, 60)', parentColor: 'rgb(0, 0, 0)', decoration: 'none', weight: 400, parentWeight: 400, borderBottomWidth: 0, bgLayers: light, bgImage: false },
      { id: 'b', text: 'y', color: 'rgb(60, 60, 60)', parentColor: 'rgb(0, 0, 0)', decoration: 'none', weight: 400, parentWeight: 400, borderBottomWidth: 0, bgLayers: [], bgImage: true },
    ]).entries,
    ...auditControlBoundaries([
      { id: 'a', fill: 'rgba(0, 0, 0, 0)', sides: [{ color: 'rgb(230, 230, 230)', width: 1 }], bgLayers: light, bgImage: false },
      { id: 'b', fill: 'rgba(0, 0, 0, 0)', sides: [], bgLayers: [], bgImage: true },
    ]).entries,
    ...auditDragging(['div[0]']).entries,
    ...auditConsistency([
      { route: '/a', facts: facts({}) },
      {
        route: '/b',
        facts: facts({ nav: ['B', 'A'], help: { text: 'Aide', region: 'header', afterMain: false }, lang: 'fr' }),
      },
      { route: '/c', facts: facts({ help: null }) },
    ]).entries,
    ...waiverEntries,
    ...auditHosts(
      [
        'https://tile.openstreetmap.org/a', 'http://example.org/a', 'https://www.google-analytics.com/a',
        'https://fonts.googleapis.com/a', 'https://unpkg.com/a', 'https://example.org/b',
      ].map((url, i) => ({ id: `u${i}`, url })),
    ).entries,
    ...lintManifest('{"orientation":"portrait","start_url":"https://x.test/","scope":"/a/","short_name":"A very long short name","icons":[{"src":"a","sizes":"48x48"}],"prefer_related_applications":true,"shortcuts":[{}]}').entries,
    ...lintManifest('{').entries,
    ...lintServiceWorker('sw.js', "caches.open('plain');").entries,
    ...auditParity([
      { profile: 'narrow', keys: ['button|a', 'button|b'] },
      { profile: 'landscape', keys: [] },
      { profile: 'dark', keys: [] },
    ]).entries,
    ...auditWeight(
      {
        resources: [
          { url: 'https://x.test/big.jpg', bytes: 900 * 1024, kind: 'img' },
          { url: 'https://y.test/a.js', bytes: null, kind: 'script' },
        ],
        images: [{ id: 'img[0]', src: 'a.jpg', naturalWidth: 2400, shownWidth: 300, hasSize: false }],
      },
      { maxKb: 100 },
    ).entries,
    ...auditWeight({ resources: [{ url: 'https://x.test/a.js', bytes: 2000 * 1024, kind: 'script' }], images: [] }).entries,
    ...auditForms(
      [
        { id: 'a', kind: 'input', type: 'text', name: 'email', label: '', placeholder: 'Email', required: true, autocomplete: '', inputmode: '', described: false, hintUnlinked: true, invalid: true, error: { text: '', announced: false } },
        { id: 'b', kind: 'input', type: 'text', name: 'q', label: 'Phone', placeholder: '', required: false, autocomplete: '', inputmode: '', described: true, hintUnlinked: false, invalid: true, error: { text: 'Too short', announced: false } },
      ],
      false,
    ).entries,
    ...auditAuth({
      passwords: [
        { id: 'p0', autocomplete: 'off', pasteBlocked: true, hasUsername: true },
        { id: 'p1', autocomplete: '', pasteBlocked: false, hasUsername: false },
      ],
      oneTime: [{ id: 'o0', autocomplete: '' }],
      captchas: ['c0'],
    }).entries,
    ...auditStatus({
      live: [
        { id: 'l0', role: 'alert', live: 'off', hidden: true },
        { id: 'l1', role: 'alert', live: '', hidden: false },
        { id: 'l2', role: '', live: 'assertive', hidden: false },
      ],
      toasts: ['t0'],
      progress: [{ id: 'g0', named: false }],
    }).entries,
    ...auditMedia([
      { id: 'v0', tag: 'video', autoplay: true, playing: true, muted: false, loop: false, duration: 30, hasCaptions: false, controls: false, host: '' },
      { id: 'v1', tag: 'video', autoplay: true, playing: true, muted: false, loop: false, duration: 30, hasCaptions: true, controls: true, host: '' },
      { id: 'v2', tag: 'video', autoplay: true, playing: true, muted: true, loop: true, duration: null, hasCaptions: true, controls: false, host: '' },
      { id: 'v3', tag: 'embed', autoplay: false, playing: null, muted: false, loop: false, duration: null, hasCaptions: false, controls: true, host: 'youtube.com' },
    ]).entries,
    ...auditFixedSpace(
      [{ id: 'header[0]', position: 'fixed', edge: 'top', height: 400, width: 320 }],
      { width: 320, height: 640 },
    ).entries,
    ...auditFixedSpace(
      [{ id: 'header[0]', position: 'fixed', edge: 'top', height: 240, width: 320 }],
      { width: 320, height: 640 },
    ).entries,
    ...auditClipping([
      { id: 'p[0]', axis: 'x', ellipsis: true, text: 'A long place name' },
      { id: 'p[1]', axis: 'y', ellipsis: false, text: 'Opening hours' },
    ]).entries,
    ...auditLangParts({
      pageLang: 'en',
      blocks: [1, 2, 3, 4].map((n) => ({ id: `p[${n}]`, lang: '', own: false, text: 'Les heures d’ouverture sont affichées pour tous les jours de la semaine' })),
    }).entries,
    ...auditBudget(waiverReport, { version: 1, checks: { contrast: { fail: 0, unknown: 0 } } }).entries,
    ...auditBudget(makeReport([buildRouteAudit('/x', 320, { contrast: { checked: 1, entries: [{ check: 'contrast', id: 'a', status: 'unknown', message: { en: 'e', fr: 'f' } }] } })], new Date('2026-11-15T00:00:00Z')), { version: 1, checks: {} }).entries,
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
