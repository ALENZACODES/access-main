import { describe, expect, it } from 'vitest';
import { COPY_RULES, scanCatalog, scanCopy, scanHtml, visibleText } from './index';

const rules = (text: string) => scanCopy(text).map((v) => v.rule);
// The banned organisation names are assembled here so they never appear literally in the repo.
const NAME_A = ['sci', 'ontario'].join('');
const NAME_B = ['S', 'C', 'I', 'O'].join('');
const NAME_C = ['Spinal', 'Cord', 'Injury', 'Ontario'].join(' ');

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
    ['banned-name', [NAME_A, NAME_B, `${NAME_C} members`]],
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
    'Recently updated',
    'May be out of date',
    'Update date unknown',
    'Licence to review',
    'Source: Open Data Ontario · Licence: OGL-Ontario',
    'Mis à jour récemment',
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
