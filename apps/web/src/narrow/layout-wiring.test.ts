import { afterEach, describe, expect, it } from 'vitest';
import { GENERATED_RULES } from './generated.js';
import { HANDLER_RULES } from './handlers.js';
import { ORDER_RULES } from './order.js';
import { auditSnapshot, layoutInPage, layoutResults, selfAudit, type LayoutFacts } from './run.js';
import { sampleEntries } from './samples.js';
import { snapshotInPage } from './inpage.js';
import { INTERACTIVE_SELECTOR } from './page.js';
import { installDom, type Installed } from './testkit.js';
import { CHECK_LABELS, CHECK_ORDER, CHECK_SC } from './types.js';
import { TYPOGRAPHY_RULES } from './typography.js';
import { LOOKALIKE_RULES } from './lookalike.js';
import { noFrIssues } from './expect-fr.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

const FACTS: LayoutFacts = {
  typography: { blocks: [{ id: 'p[0]', words: 20, chars: 100, fontSize: 10, leading: 1.5, lines: 3, textAlign: 'start', italic: false }], truncated: false },
  order: { reordered: [{ id: 'div[0]', kind: 'reverse', children: 2, focusable: 0 }], truncated: false },
  generated: { items: [{ id: 'span[0]::before', pseudo: '::before', text: 'New' }], checked: 4, truncated: false },
  regions: { landmarks: 1, checked: 3, outside: ['p[1]'], outsideCount: 1, truncated: false },
};

describe('check tables', () => {
  it('list the four new checks in order, with labels in both languages and a criterion', () => {
    for (const id of ['handlers', 'typography', 'order', 'generated', 'lookalike', 'regions'] as const) {
      expect(CHECK_ORDER).toContain(id);
      expect(CHECK_LABELS[id].en).not.toBe('');
      expect(CHECK_LABELS[id].fr).not.toBe(CHECK_LABELS[id].en);
    }
    expect(CHECK_SC.handlers).toBe('2.1.1');
    expect(CHECK_SC.typography).toBe('1.4.8');
    expect(CHECK_SC.order).toBe('1.3.2');
    expect(CHECK_SC.generated).toBe('1.3.1');
    expect(CHECK_SC.lookalike).toBe('1.3.1');
    expect(CHECK_SC.regions).toBe('1.3.1');
  });
  it('have no check id twice', () => {
    expect(new Set(CHECK_ORDER).size).toBe(CHECK_ORDER.length);
  });
});

describe('layoutResults', () => {
  it('runs the three checks on the facts', () => {
    const r = layoutResults(FACTS);
    expect(Object.keys(r).sort()).toEqual(['generated', 'order', 'regions', 'typography']);
    expect(r['typography']?.entries.map((e) => e.rule)).toEqual(['small-text']);
    expect(r['order']?.entries.map((e) => e.rule)).toEqual(['reverse-direction']);
    expect(r['generated']?.entries.map((e) => e.rule)).toEqual(['css-text']);
    expect(r['regions']?.entries.map((e) => e.rule)).toEqual(['outside-landmark']);
  });
});

describe('auditSnapshot', () => {
  const snap = (): ReturnType<typeof snapshotInPage> => snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 100 });
  it('adds layout checks only when the facts are given and the handler check only when markup is given', () => {
    dom = installDom([{ tag: 'p', text: 'hello' }]);
    const base = auditSnapshot('/x', 320, { snapshot: snap() });
    const names = base.checks.map((c) => c.check);
    for (const id of ['handlers', 'typography', 'order', 'generated']) expect(names).not.toContain(id);
    const full = auditSnapshot('/x', 320, { snapshot: snap(), layout: FACTS, html: '<div onclick="go()">Go</div><p></p>' });
    expect(full.checks.map((c) => c.check)).toEqual(expect.arrayContaining(['handlers', 'typography', 'order', 'generated', 'lookalike', 'regions']));
    expect(full.entries.filter((e) => e.check === 'lookalike').map((e) => e.rule)).toEqual(['empty-paragraph']);
    expect(full.entries.filter((e) => e.check === 'handlers').map((e) => e.rule)).toEqual(['click-not-focusable']);
  });
});

describe('layoutInPage and selfAudit', () => {
  it('collects the three kinds of facts from the live document', () => {
    dom = installDom([
      { tag: 'main', style: { display: 'flex', flexDirection: 'row-reverse' }, children: [{ tag: 'p', text: 'The ramp is on the left side of the main door of the building.', before: { content: '"New "' } }, { tag: 'p', text: 'x' }] },
    ]);
    const f = layoutInPage();
    expect(f.typography.blocks).toHaveLength(1);
    expect(f.order.reordered.map((r) => r.kind)).toEqual(['reverse']);
    expect(f.generated.items.map((i) => i.text)).toEqual(['New ']);
  });
  it('runs the layout checks in the live panel audit and leaves the document alone', () => {
    dom = installDom([
      { tag: 'main', children: [{ tag: 'h1', text: 'Help' }, { tag: 'p', text: 'The ramp is on the left side of the main door of the building.', style: { textAlign: 'justify' } }] },
    ]);
    const route = selfAudit(new Date('2026-11-16T12:00:00Z')).routes[0];
    expect(route?.checks.map((c) => c.check)).toEqual(expect.arrayContaining(['handlers', 'typography', 'order', 'generated', 'lookalike', 'regions']));
    expect(route?.entries.filter((e) => e.check === 'typography').map((e) => e.rule)).toEqual(['justified']);
    expect(dom.world.styleElements).toBe(0);
  });
});

describe('the sample set covers every rule of the four checks', () => {
  it('has an entry for each rule and clean French for all of them', () => {
    const all = sampleEntries();
    const rulesOf = (check: string): Set<string | undefined> => new Set(all.filter((e) => e.check === check).map((e) => e.rule));
    for (const r of HANDLER_RULES) expect(rulesOf('handlers').has(r), `handlers ${r}`).toBe(true);
    for (const r of TYPOGRAPHY_RULES) expect(rulesOf('typography').has(r), `typography ${r}`).toBe(true);
    for (const r of ORDER_RULES) expect(rulesOf('order').has(r), `order ${r}`).toBe(true);
    for (const r of GENERATED_RULES) expect(rulesOf('generated').has(r), `generated ${r}`).toBe(true);
    for (const r of LOOKALIKE_RULES) expect(rulesOf('lookalike').has(r), `lookalike ${r}`).toBe(true);
    expect(rulesOf('regions').has('outside-landmark')).toBe(true);
    noFrIssues(all.filter((e) => ['handlers', 'typography', 'order', 'generated', 'lookalike', 'regions'].includes(e.check)));
  });
});
