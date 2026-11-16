import { afterEach, describe, expect, it } from 'vitest';
import {
  INTERACTIVE_SELECTOR,
  MIN_TARGET_PX,
  REFLOW_WIDTH_PX,
  auditBoxes,
  auditReflow,
  auditRoutes,
  auditTargets,
  describeFinding,
  formatReport,
  measureInPage,
  formatUnexplained,
  isAllowlisted,
  unexplainedFindings,
  type Box,
  type AllowlistItem,
  type Finding,
  type PageLike,
} from './index.ts';

const box = (id: string, left: number, width: number, height: number): Box => ({
  id,
  left,
  right: left + width,
  width,
  height,
});

describe('auditTargets', () => {
  it('flags boxes under 44px in either direction, skips unmeasured ones', () => {
    const f = auditTargets([
      box('ok', 0, 44, 44),
      box('narrow', 0, 30, 48),
      box('short', 0, 120, 40),
      box('hidden', 0, 0, 0),
    ]);
    expect(f.map((x) => x.id)).toEqual(['narrow', 'short']);
    expect(MIN_TARGET_PX).toBe(44);
  });
  it('ignores sub-pixel noise', () => {
    expect(auditTargets([box('a', 0, 43.7, 44)])).toEqual([]);
  });
});

describe('auditReflow', () => {
  it('flags overflow on either edge and a sideways page scroll', () => {
    const f = auditReflow([box('wide', 10, 340, 50), box('left', -20, 100, 50), box('fine', 0, 320, 50)], 360, 320);
    expect(f.map((x) => [x.kind, x.id, x.overflowPx])).toEqual([
      ['page-scrolls-sideways', 'page', 40],
      ['horizontal-overflow', 'wide', 30],
      ['horizontal-overflow', 'left', 20],
    ]);
    expect(REFLOW_WIDTH_PX).toBe(320);
  });
  it('is clean for content that fits', () => {
    expect(auditReflow([box('a', 16, 288, 44)], 320, 320)).toEqual([]);
  });
});

describe('messages', () => {
  const sample: Finding[] = [
    { kind: 'target-too-small', id: 'x', width: 30, height: 30, overflowPx: 0 },
    { kind: 'horizontal-overflow', id: 'x', width: 400, height: 40, overflowPx: 80 },
    { kind: 'page-scrolls-sideways', id: 'page', width: 400, height: 0, overflowPx: 80 },
  ];
  it('exist in EN and FR, and FR follows the typography rules', () => {
    for (const f of sample) {
      const m = describeFinding(f);
      expect(m.en.length).toBeGreaterThan(0);
      expect(m.fr.length).toBeGreaterThan(0);
      expect(m.fr).not.toMatch(/\p{L}'\p{L}/u);
      expect(m.fr).not.toMatch(/ [:;!?]/);
      expect(m.fr).not.toMatch(/verified|AAA/i);
    }
  });
  it('formats one line per finding', () => {
    const r = auditBoxes('/a', [box('b', 0, 30, 30)], 320, 320);
    expect(formatReport(r, 'en')).toEqual(['/a  b  Target is 30×30px, below the 44px minimum.']);
  });
});

describe('measureInPage + auditRoutes', () => {
  const g = globalThis as unknown as { document?: unknown; getComputedStyle?: (el: unknown) => { display: string; visibility: string } };
  afterEach(() => {
    delete g.document;
    delete g.getComputedStyle;
  });

  it('reads layout from the page document', () => {
    g.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
    g.document = {
      querySelectorAll: () => [
        {
          id: 'go',
          tagName: 'BUTTON',
          textContent: 'Go',
          getAttribute: () => null,
          closest: () => null,
          parentElement: null,
          getBoundingClientRect: () => ({ left: 0, right: 30, width: 30, height: 30 }),
        },
      ],
      documentElement: { scrollWidth: 320, clientWidth: 320 },
    };
    expect(measureInPage(INTERACTIVE_SELECTOR).boxes[0]?.id).toBe('button#go[Go]');
  });

  it('audits every route at 320px', async () => {
    const visited: string[] = [];
    let width = 0;
    const page: PageLike = {
      async setViewportSize(s) {
        width = s.width;
      },
      async goto(url) {
        visited.push(url);
      },
      async evaluate(fn, arg) {
        g.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
        g.document = {
          querySelectorAll: () => [
            {
              id: '',
              tagName: 'A',
              textContent: 'Open',
              getAttribute: (name: string) => (name === 'href' ? '/map' : null),
              closest: () => null,
              parentElement: null,
              getBoundingClientRect: () => ({ left: 0, right: 50, width: 50, height: 20 }),
            },
          ],
          documentElement: { scrollWidth: 320, clientWidth: 320 },
        };
        return fn(arg);
      },
    };
    const reports = await auditRoutes(page, 'http://localhost:5173', ['/', '/map']);
    expect(width).toBe(320);
    expect(visited).toEqual(['http://localhost:5173/', 'http://localhost:5173/map']);
    expect(reports.map((r) => r.findings.length)).toEqual([1, 1]);
  });
});


describe('allowlist', () => {
  const small: Finding = { kind: 'target-too-small', id: 'a[/help]', width: 24, height: 24, overflowPx: 0 };
  it('treats an empty allowlist as a failure for every finding', () => {
    const report = auditBoxes('/help', [box('a[/help]', 0, 24, 24)], 320, 320);
    expect(unexplainedFindings(report, 'en')).toHaveLength(report.findings.length);
    expect(formatUnexplained([report], 'en')[0]).toContain('/help');
  });
  it('records a reason when a finding is explicitly allowlisted', () => {
    const item: AllowlistItem = {
      route: '/help',
      language: '*',
      kind: 'target-too-small',
      idIncludes: '/help',
      reason: 'example only; not used in the production list',
    };
    expect(item.reason.length).toBeGreaterThan(0);
    expect(isAllowlisted('/help', 'en', small)).toBe(false);
  });
});
