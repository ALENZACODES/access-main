import { describe, expect, it } from 'vitest';
import { forbiddenOrgNeedles, containsForbiddenOrg } from '../../../../packages/shared/test/forbiddenOrg.ts';
import { COPY_RULES, scanCatalog, scanCopy, scanHtml, visibleText } from './index';

const rules = (text: string) => scanCopy(text).map((v) => v.rule);
// The banned organisation names come only from the repo's shared helper, so they never appear as text here.
const NEEDLES = forbiddenOrgNeedles();

describe('copy rules flag violations', () => {
  it.each([
    ['verified-claim', ['Verified data', 'We verify every row', 'Vérifié par nos équipes', 'verification complete', 'à vérifier']],
    ['real-time-claim', ['Real-time updates', 'realtime status', 'en temps réel', 'Live data feed']],
    ['conformance-claim', ['AAA conformant', 'WCAG 2.2 compliant', 'AA-conformant', 'conforme aux WCAG']],
    ['ai-mention', ['Powered by AI', 'IA générative', 'a large language model (LLM)', 'machine learning', 'chatbot', 'intelligence artificielle']],
    ['partnership-claim', ['Official partner', 'partenaire officiel', 'in partnership with', 'Officially endorsed']],
    ['medical-advice', ['Seek medical advice', 'See your doctor', 'diagnosis', 'consultez votre médecin', 'traitement']],
    ['eligibility-advice', ['You qualify for this', 'eligible households', 'Vous êtes admissible']],
    ['guarantee-claim', ['guaranteed accurate', 'garanti exact', '100% accurate', 'toujours exact']],
    ['banned-name', [...NEEDLES, ...NEEDLES.map((n) => `${n.toUpperCase()} members`), ...NEEDLES.map((n) => `the ${n}, again`)]],
  ])('%s', (rule, samples) => {
    for (const s of samples) expect(rules(s), s).toContain(rule);
  });

  it('every rule has a sample above (no untested rule)', () => {
    expect(COPY_RULES.map((r) => r.id).sort()).toEqual(
      ['ai-mention', 'banned-name', 'conformance-claim', 'eligibility-advice', 'guarantee-claim', 'medical-advice', 'partnership-claim', 'real-time-claim', 'verified-claim'].sort(),
    );
  });

  it('reports the matched text', () => {
    expect(scanCopy('This is Verified.')[0]).toEqual({ rule: 'verified-claim', match: 'Verified' });
  });
});

describe('copy rules leave ordinary copy alone', () => {
  it.each([
    'Within its review period',
    'May be out of date',
    'Update date unknown',
    'Licence to review',
    'Source: Open Data Ontario · Licence: OGL-Ontario',
    'Dans sa période de révision',
    'Possiblement périmé',
    'Aiden and Maia went to Paris and the MAIN street',
    'Sources possiblement périmées',
    'Licence à examiner',
  ])('%s', (text) => expect(scanCopy(text)).toEqual([]));
});

describe('scanCatalog (the CI guard)', () => {
  it('finds no violations in the EN or FR catalog', () => {
    expect(scanCatalog()).toEqual([]);
  });

  it('fails when a rule matches catalog text (proves the guard bites)', () => {
    const out = scanCatalog([{ id: 'test-rule', pattern: /Recalculate|Recalculer/ }]);
    expect(out).toEqual(['en act.recalculate: test-rule (Recalculate)', 'fr act.recalculate: test-rule (Recalculer)']);
  });
});

describe('visibleText / scanHtml', () => {
  it('drops tags, styles, scripts and decodes entities', () => {
    const html = '<style>.a{color:red}</style><p class="x">A &amp; B &lt;c&gt; &#39;d&#39;</p><script>var AI=1</script>';
    expect(visibleText(html)).toBe("A & B <c> 'd'");
  });

  it('keeps no-break spaces (they carry French typography)', () => {
    expect(visibleText('<p>Source\u00A0: x</p>')).toBe('Source\u00A0: x');
  });

  it('flags banned wording a reader would see, but not attribute values or CSS', () => {
    expect(scanHtml('<p>Real-time data</p>').map((v) => v.rule)).toEqual(['real-time-claim']);
    expect(scanHtml('<p data-x="verified" style="content:\'AI\'">ok</p>')).toEqual([]);
  });
});

describe('banned organisation names', () => {
  it('the rule is built from the shared helper: it flags every needle it returns, in either language and any case', () => {
    expect(NEEDLES.length).toBeGreaterThanOrEqual(5);
    for (const n of NEEDLES) {
      for (const text of [n, n.toUpperCase(), `Visit ${n}.`, `(${n})`, `${n}\u00A0:`]) expect(rules(text), `needle ${NEEDLES.indexOf(n)}`).toContain('banned-name');
    }
  });

  it('does not flag words that merely contain a needle', () => {
    for (const n of NEEDLES.filter((x) => /^[a-z]+$/i.test(x) && x.length <= 6)) {
      expect(rules(`un${n}ment`), 'prefix').not.toContain('banned-name');
      expect(rules(`${n}s and ${n}ish`), 'suffix').not.toContain('banned-name');
    }
  });

  it('is clean for ordinary copy', () => {
    for (const text of ['Data status', 'Ontario open data', 'Spinal care', 'Statut des données']) expect(rules(text)).not.toContain('banned-name');
  });

  // Every file of this lane, as text. Failing files are reported by path only, never by the needle.
  const files = import.meta.glob<string>(['./**/*.{ts,tsx,md,css,html}', '../pages/DataStatusPage*.tsx'], { query: '?raw', import: 'default', eager: true });

  it('no file of the data-status lane or its page contains a banned name', () => {
    const entries = Object.entries(files);
    expect(entries.length).toBeGreaterThan(80);
    const offenders = entries.filter(([, text]) => containsForbiddenOrg(text)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('the scan can see a violation (it reports a path, not the name)', () => {
    const planted = Object.entries({ 'planted.ts': `// ${NEEDLES[0] ?? ''}` }).filter(([, text]) => containsForbiddenOrg(text)).map(([path]) => path);
    expect(planted).toEqual(['planted.ts']);
  });

  it('the French and English catalogues contain no banned name', () => {
    expect(scanCatalog().filter((v) => v.includes('banned-name'))).toEqual([]);
  });
});
