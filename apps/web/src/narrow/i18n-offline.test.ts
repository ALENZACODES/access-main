import { afterEach, describe, expect, it } from 'vitest';
import { auditI18n, checkParity, flattenDict, frTypographyIssues, placeholders } from './i18n.js';
import {
  checkOfflineReload,
  offlineCheckResult,
  readPageStateInPage,
  swReadyInPage,
  type OfflineContext,
  type OfflinePage,
} from './offline.js';
import { NBSP, NNBSP } from './types.js';

describe('flattenDict', () => {
  it('flattens nested objects and drops non-strings', () => {
    expect(flattenDict({ a: { b: 'x', c: 3 }, d: 'y', e: [1] })).toEqual({ 'a.b': 'x', d: 'y' });
  });
});

describe('placeholders', () => {
  it('lists unique names for single and double braces', () => {
    expect(placeholders('Hi {name}, {{count}} items, {name}')).toEqual(['count', 'name']);
    expect(placeholders('none')).toEqual([]);
  });
});

describe('frTypographyIssues', () => {
  it('accepts correct French', () => {
    expect(frTypographyIssues(`L’App${NBSP}: bonjour${NNBSP}! «${NNBSP}oui${NNBSP}» à 10:30`)).toEqual([]);
  });
  it('names each broken rule', () => {
    expect(frTypographyIssues("l'App")).toContain('apostrophe');
    expect(frTypographyIssues('Note: texte')).toContain('colon');
    expect(frTypographyIssues(`Note ${':'} texte`)).toContain('colon');
    expect(frTypographyIssues('Bonjour!')).toContain('high-punctuation');
    expect(frTypographyIssues('«oui»')).toContain('guillemets');
  });
  it('leaves URLs, times and query strings alone', () => {
    expect(frTypographyIssues('https://exemple.org/a?b=1 à 10:30')).toEqual([]);
  });
});

describe('checkParity', () => {
  it('reports each kind of problem', () => {
    const en = { a: 'Hello {name}', b: 'Only English', c: 'Same text that is long enough', d: 'Save', e: 'Empty' };
    const fr = { a: 'Bonjour', c: 'Same text that is long enough', d: "L'enregistrer", e: ' ', f: 'Extra' };
    const kinds = checkParity(en, fr).map((i) => `${i.key}:${i.kind}`);
    expect(kinds).toEqual([
      'a:placeholder-mismatch',
      'b:missing-fr',
      'c:same-text',
      'd:fr-typography',
      'e:empty',
      'f:missing-en',
    ]);
  });
  it('lets allowed keys and short strings be identical', () => {
    expect(checkParity({ a: 'OK', brand: 'The App is the same here' }, { a: 'OK', brand: 'The App is the same here' }, { allowSame: new Set(['brand']) })).toEqual([]);
  });
});

describe('auditI18n', () => {
  it('makes untranslated-looking text unknown and everything else a fail', () => {
    const res = auditI18n({ a: 'This text is identical in both', b: 'x' }, { a: 'This text is identical in both' });
    expect(res.checked).toBe(2);
    expect(res.entries.map((e) => [e.id, e.status])).toEqual([
      ['a', 'unknown'],
      ['b', 'fail'],
    ]);
  });
});

type Fn = (arg: never) => unknown;

function scripted(answers: Map<Fn, unknown[]>, log: string[]): OfflinePage {
  return {
    async goto(url) {
      log.push(`goto ${url}`);
    },
    async reload() {
      log.push('reload');
    },
    async evaluate(fn) {
      const next = answers.get(fn as unknown as Fn)?.shift();
      return next as never;
    },
  };
}

function ctx(log: string[]): OfflineContext {
  return {
    async setOffline(o) {
      log.push(`offline ${o}`);
    },
  };
}

describe('checkOfflineReload', () => {
  it('passes when the page renders text with the network off, and restores the network', async () => {
    const log: string[] = [];
    const page = scripted(
      new Map<Fn, unknown[]>([
        [swReadyInPage as unknown as Fn, ['ready']],
        [readPageStateInPage as unknown as Fn, [{ errorPage: false, textLength: 42 }]],
      ]),
      log,
    );
    expect(await checkOfflineReload(page, ctx(log), 'http://x/')).toEqual({ status: 'pass', reason: 'ok' });
    expect(log).toEqual(['goto http://x/', 'reload', 'offline true', 'reload', 'offline false']);
  });

  it('fails on an error page or an empty page', async () => {
    for (const [state, reason] of [
      [{ errorPage: true, textLength: 9 }, 'error-page'],
      [{ errorPage: false, textLength: 0 }, 'empty-page'],
    ] as const) {
      const log: string[] = [];
      const page = scripted(
        new Map<Fn, unknown[]>([
          [swReadyInPage as unknown as Fn, ['ready']],
          [readPageStateInPage as unknown as Fn, [state]],
        ]),
        log,
      );
      expect((await checkOfflineReload(page, ctx(log), 'u')).reason).toBe(reason);
      expect(log.at(-1)).toBe('offline false');
    }
  });

  it('fails when no service worker becomes ready and is unknown when unsupported', async () => {
    const log: string[] = [];
    const none = scripted(new Map<Fn, unknown[]>([[swReadyInPage as unknown as Fn, ['timeout']]]), log);
    expect(await checkOfflineReload(none, ctx(log), 'u')).toEqual({ status: 'fail', reason: 'no-service-worker' });
    const unsupported = scripted(new Map<Fn, unknown[]>([[swReadyInPage as unknown as Fn, ['unsupported']]]), log);
    expect(await checkOfflineReload(unsupported, ctx(log), 'u')).toEqual({ status: 'unknown', reason: 'unsupported' });
    expect(log).not.toContain('offline true');
  });

  it('treats a failed offline reload as an error page and still restores the network', async () => {
    const log: string[] = [];
    let reloads = 0;
    const page: OfflinePage = {
      async goto() {},
      async reload() {
        if (++reloads === 2) throw new Error('net::ERR_INTERNET_DISCONNECTED');
      },
      async evaluate() {
        return 'ready' as never;
      },
    };
    expect((await checkOfflineReload(page, ctx(log), 'u')).reason).toBe('error-page');
    expect(log).toEqual(['offline true', 'offline false']);
  });
});

describe('offlineCheckResult', () => {
  it('has a clean result for pass and a bilingual entry otherwise', () => {
    expect(offlineCheckResult('/', { status: 'pass', reason: 'ok' }).entries).toEqual([]);
    const u = offlineCheckResult('/', { status: 'unknown', reason: 'unsupported' });
    expect(u.entries[0]?.status).toBe('unknown');
    const f = offlineCheckResult('/', { status: 'fail', reason: 'no-service-worker' }, 3000);
    expect(f.entries[0]?.message.en).toContain('3000 ms');
    expect(f.entries[0]?.message.fr).toContain(`3000${NBSP}ms`);
  });
});

describe('in-page helpers', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  afterEach(() => {
    delete g['document'];
  });
  it('readPageStateInPage spots Chrome and Firefox error pages', () => {
    g['document'] = { querySelector: (s: string) => (s === '#main-frame-error' ? {} : null), body: { innerText: 'x' } };
    expect(readPageStateInPage()).toEqual({ errorPage: true, textLength: 1 });
    g['document'] = { querySelector: () => null, documentURI: 'about:neterror?e=x', body: { innerText: '' } };
    expect(readPageStateInPage()).toEqual({ errorPage: true, textLength: 0 });
  });
  it('swReadyInPage is unsupported without a service worker API', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    try {
      expect(await swReadyInPage(10)).toBe('unsupported');
      Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { ready: new Promise(() => undefined) } }, configurable: true });
      expect(await swReadyInPage(10)).toBe('timeout');
      Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { ready: Promise.resolve({}) } }, configurable: true });
      expect(await swReadyInPage(1000)).toBe('ready');
    } finally {
      if (saved) Object.defineProperty(globalThis, 'navigator', saved);
      else delete g['navigator'];
    }
  });
});
