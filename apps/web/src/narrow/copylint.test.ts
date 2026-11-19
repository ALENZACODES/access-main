import { describe, expect, it } from 'vitest';
import { auditCopy, auditCopyDict, COPY_RULES, plain, scanCopy } from './copylint.js';
import { endorsedByForbiddenOrgSample, forbiddenOrgNeedles } from '../../../../packages/shared/test/forbiddenOrg.ts';
import { SAMPLE_TEXT } from './samples.js';

const ids = (t: string): string[] => scanCopy(t).map((h) => h.rule.id);

/** Texts that must be caught, in both languages where the rule applies to both. */
const BAD: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['claim-checked', ['Verified by our team', 'Informations vérifiées', 'Lieu vérifié', 'Entrée vérifiée']],
  ['claim-live', ['Real-time updates', 'realtime map', 'Mises à jour en temps réel', 'Real time data']],
  ['claim-relationship', ['In partnership with a charity', 'Partnerships welcome', 'En partenariat avec un organisme']],
  ['claim-promise', ['We guarantee access', 'Guaranteed entry', 'Nous garantissons l’accès', 'Accès garanti', 'Une garantie']],
  ['claim-conformance', ['Fully accessible', 'AAA-conformant', 'WCAG 2.2 compliant', 'Certifié accessible', '100% accessible', 'Entièrement accessible']],
  ['mention-tech', ['Powered by AI', 'Propulsé par l’IA', 'AI route planner']],
  ['mention-tech-terms', ['Uses machine learning', 'Intelligence artificielle', 'Ask the chatbot', 'Powered by GPT', 'An LLM']],
  ['mention-org', [endorsedByForbiddenOrgSample('en'), endorsedByForbiddenOrgSample('fr')]],
  ['advice-eligibility', ['You qualify for support', 'You are eligible', 'Vous avez droit à une aide', 'Vous êtes admissible']],
  ['advice-medical', ['Consult your doctor', 'You should take rest', 'Consultez votre médecin', 'Vous devriez arrêter']],
  ['claim-complete', ['Always up to date', 'Toujours à jour', 'Complete and accurate']],
];

const GOOD = [
  'Opening hours',
  'Step-free entrance: unknown',
  'Heures d’ouverture',
  'Entrée sans marche : UNKNOWN',
  'Raised the ai in said and j’ai fait',
  'Verify your email address',
  'Vérifier mon courriel',
  'Partners list',
  'Our schedule is posted weekly',
];

describe('wording rules', () => {
  it('has a bad example for every rule', () => {
    expect(BAD.map((b) => b[0]).sort()).toEqual(COPY_RULES.map((r) => r.id).sort());
    expect(Object.keys(SAMPLE_TEXT).sort()).toEqual(COPY_RULES.map((r) => r.id).sort());
  });
  // The organisation samples are left out of the titles so a test report never prints the name.
  it.each(BAD.filter(([rule]) => rule !== 'mention-org').flatMap(([rule, texts]) => texts.map((t) => [rule, t] as const)))('%s catches "%s"', (rule, text) => {
    expect(ids(text)).toContain(rule);
  });
  it.each([['en'], ['fr']] as const)('mention-org catches the %s endorsement sample', (lang) => {
    expect(ids(endorsedByForbiddenOrgSample(lang))).toContain('mention-org');
  });
  it('mention-org catches every needle on its own', () => {
    const missed = forbiddenOrgNeedles().filter((needle) => !ids(needle).includes('mention-org'));
    expect(missed).toHaveLength(0);
  });
  it.each(GOOD)('leaves "%s" alone', (text) => {
    expect(ids(text)).toEqual([]);
  });
  it('matches AI and IA only in capitals', () => {
    expect(ids('ai ia Ai')).toEqual([]);
    expect(ids('the AI')).toEqual(['mention-tech']);
  });
  it('ignores accents and case for the other rules', () => {
    expect(plain('VÉRIFIÉE')).toBe('verifiee');
    expect(ids('VÉRIFIÉE')).toContain('claim-checked');
    expect(ids('TEMPS RÉEL')).toContain('claim-live');
  });
  it('lists each rule once per text', () => {
    expect(ids('verified verified verified')).toEqual(['claim-checked']);
  });
});

describe('auditCopy', () => {
  it('fails on bans and only asks for a look on review rules', () => {
    const res = auditCopy([
      { id: 'a', text: 'Real-time map' },
      { id: 'b', text: 'You qualify for support' },
      { id: 'c', text: 'Opening hours' },
    ]);
    expect(res.checked).toBe(3);
    expect(res.entries.map((e) => [e.id, e.status, e.rule])).toEqual([
      ['a', 'fail', 'claim-live'],
      ['b', 'unknown', 'advice-eligibility'],
    ]);
  });
  it('works on a dictionary and names the rule in both languages', () => {
    const res = auditCopyDict({ 'hero.title': 'Guaranteed access' });
    expect(res.entries[0]?.message.en).toContain('claim-promise');
    expect(res.entries[0]?.message.fr).toContain('règle claim-promise');
  });
  it('never repeats the wording it forbids in its own messages', () => {
    for (const r of COPY_RULES) {
      expect(scanCopy(r.en), r.en).toEqual([]);
      expect(scanCopy(r.fr), r.fr).toEqual([]);
    }
  });
});
