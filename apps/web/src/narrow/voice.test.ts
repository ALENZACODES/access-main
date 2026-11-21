import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { NBSP, NNBSP } from './types.js';
import { buildVoice, controlText, holds, issueText, phraseWords, say, sayText, voiceSummary, voiceText, words } from './voice.js';
import type { VoiceControl, VoiceFacts, VoiceRole } from './voice-inpage.js';

const c = (name: string, visible: string, role: VoiceRole = 'button', id = `button[${name}]`): VoiceControl => ({ id, role, name, visible });
const facts = (controls: VoiceControl[], truncated = false): VoiceFacts => ({ controls, truncated });

/** Two good controls, an icon button, a link whose name differs, two buttons named Edit, and one with no name. */
const PAGE = facts([
  c('Send', 'Send'),
  c('Search places', 'Search', 'button'),
  c('Close', '', 'button', 'button#close[2]'),
  c('Read more about ramps', 'Learn more', 'link', 'a[0]'),
  c('Edit', 'Edit', 'button', 'button[4]'),
  c('Edit', 'Edit', 'button', 'button[5]'),
  c('', '', 'button', 'button[6]'),
  c('Postal code', 'Postal code', 'field', 'input#pc[0]'),
]);

describe('words and holds', () => {
  it('turns text into lower-case words with no punctuation, keeping accents', () => {
    expect(words('  Send it!  ')).toEqual(['send', 'it']);
    expect(words('Café — Menu (2)')).toEqual(['café', 'menu', '2']);
    expect(words('S’inscrire')).toEqual(['s', 'inscrire']);
    expect(words('')).toEqual([]);
  });

  it('finds a run of words in order and next to each other', () => {
    expect(holds(['search', 'places'], ['search'])).toBe(true);
    expect(holds(['read', 'more', 'about', 'ramps'], ['more', 'about'])).toBe(true);
    expect(holds(['read', 'more', 'about', 'ramps'], ['learn', 'more'])).toBe(false);
    expect(holds(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(holds(['a'], [])).toBe(false);
    expect(holds(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('buildVoice', () => {
  it('finds the issues of each control, and how many can be reached in one step', () => {
    const m = buildVoice(PAGE);
    expect(m.outcomes.map((o) => [o.control.id, o.issues, o.sharedWith])).toEqual([
      ['button[Send]', [], 1],
      ['button[Search places]', [], 1],
      ['button#close[2]', ['no-words'], 1],
      ['a[0]', ['name-differs'], 1],
      ['button[4]', ['shared-name'], 2],
      ['button[5]', ['shared-name'], 2],
      ['button[6]', ['no-name'], 1],
      ['input#pc[0]', [], 1],
    ]);
    expect(m.direct).toBe(3);
    expect(m.counts).toEqual({ 'no-name': 1, 'no-words': 1, 'name-differs': 1, 'shared-name': 2 });
  });

  it('matches names in any case and with any punctuation when it looks for shared names', () => {
    const m = buildVoice(facts([c('Edit', 'Edit'), c('edit!', 'edit')]));
    expect(m.outcomes.map((o) => o.sharedWith)).toEqual([2, 2]);
  });

  it('counts visible text held inside a longer name as matching', () => {
    expect(buildVoice(facts([c('Search places near you', 'Search places')])).direct).toBe(1);
  });
});

describe('phraseWords and say', () => {
  it('leaves out command words in English and French', () => {
    expect(phraseWords('click Send')).toEqual(['send']);
    expect(phraseWords('Please tap Search')).toEqual(['search']);
    expect(phraseWords('cliquer sur Envoyer')).toEqual(['envoyer']);
    expect(phraseWords('appuyez sur Modifier')).toEqual(['modifier']);
    expect(phraseWords('Send')).toEqual(['send']);
  });

  it('says what a phrase reaches: nothing, one control or several', () => {
    expect(say('   ', PAGE)).toEqual({ kind: 'empty' });
    expect(say('click', PAGE)).toEqual({ kind: 'none', phrase: 'click' });
    expect(say('click Learn more', PAGE)).toEqual({ kind: 'none', phrase: 'learn more' });
    const one = say('tap search', PAGE);
    expect(one.kind === 'one' && one.control.name).toBe('Search places');
    const many = say('Edit', PAGE);
    expect(many.kind === 'many' && many.controls.length).toBe(2);
  });
});

describe('controlText and issueText', () => {
  it('names a control by its role and what it shows, or its id', () => {
    expect(controlText(c('Send', 'Send'), 'en')).toBe('button “Send”');
    expect(controlText(c('Close', ''), 'en')).toBe('button “Close”');
    expect(controlText(c('', '', 'link', 'a[3]'), 'en')).toBe('link with no text (a[3])');
    expect(controlText(c('Code postal', 'Code postal', 'field'), 'fr')).toBe(`champ «${NNBSP}Code postal${NNBSP}»`);
    expect(controlText(c('', '', 'choice', 'input[1]'), 'fr')).toBe('choix sans texte (input[1])');
  });

  it('says why a control takes extra steps', () => {
    const m = buildVoice(PAGE);
    const text = m.outcomes.flatMap((o) => o.issues.map((i) => issueText(o, i, 'en')));
    expect(text).toEqual([
      'It shows no words. To reach it, a person has to guess its hidden name, “Close”, or use numbers.',
      'It shows “Learn more”, but its name is “Read more about ramps”. Saying what it shows may not work.',
      '2 controls are named “Edit”. The voice tool will ask which one, often with numbers.',
      '2 controls are named “Edit”. The voice tool will ask which one, often with numbers.',
      'It has no name, so no words reach it. It takes numbers or a grid.',
    ]);
  });

  it('says it in French, with French typography', () => {
    const m = buildVoice(PAGE);
    const text = m.outcomes.flatMap((o) => o.issues.map((i) => issueText(o, i, 'fr')));
    expect(text[1]).toBe(`Il montre «${NNBSP}Learn more${NNBSP}», mais son nom est «${NNBSP}Read more about ramps${NNBSP}». Dire ce qu’il montre peut ne pas fonctionner.`);
    for (const t of text) {
      expect(frTypographyIssues(t), t).toEqual([]);
      expect(t).not.toMatch(/\p{L}'\p{L}/u);
    }
  });
});

describe('voiceSummary', () => {
  it('gives how many can be reached in one step, and the count of each issue', () => {
    expect(voiceSummary(buildVoice(PAGE), 'en')).toEqual([
      'Of 8 controls, 3 can be reached in one step by saying what they show.',
      '1 control shows no words; 1 control has a name that differs from what it shows; 2 controls share a name with another control; 1 control has no name.',
    ]);
  });

  it('has one line when all are reached in one step, says so with no control, and when the page was cut', () => {
    expect(voiceSummary(buildVoice(facts([c('Send', 'Send')])), 'en')).toEqual(['Of 1 control, 1 can be reached in one step by saying what it shows.']);
    expect(voiceSummary(buildVoice(facts([])), 'en')).toEqual(['No visible control was found on this page.']);
    expect(voiceSummary(buildVoice(facts([c('Send', 'Send')], true)), 'en')[1]).toBe('The page is long and only part of it was read, so the rest is UNKNOWN.');
  });

  it('says it in French, with French typography', () => {
    const lines = [...voiceSummary(buildVoice(PAGE), 'fr'), ...voiceSummary(buildVoice(facts([c('Envoyer', 'Envoyer')], true)), 'fr'), ...voiceSummary(buildVoice(facts([])), 'fr')];
    expect(lines[0]).toBe(`Sur 8${NBSP}commandes, 3 peuvent être atteintes en une étape en disant ce qu’elles montrent.`);
    expect(lines[1]).toBe(
      `1${NBSP}commande ne montre aucun mot${NNBSP}; 1${NBSP}commande porte un nom différent de ce qu’elle montre${NNBSP}; 2${NBSP}commandes partagent un nom avec une autre commande${NNBSP}; 1${NBSP}commande n’a aucun nom.`,
    );
    expect(lines[2]).toBe(`Sur 1${NBSP}commande, 1 peut être atteinte en une étape en disant ce qu’elle montre.`);
    for (const l of lines) expect(frTypographyIssues(l), l).toEqual([]);
  });
});

describe('sayText', () => {
  it('says the result of a phrase in both languages', () => {
    expect(sayText(say('', PAGE), 'en')).toBe('Write what you would say, such as Send.');
    expect(sayText(say('click Learn more', PAGE), 'en')).toBe('No control of this page has “learn more” in its name. The voice tool will likely find nothing.');
    expect(sayText(say('Send', PAGE), 'en')).toBe('One control answers to “send”: button “Send”.');
    expect(sayText(say('Edit', PAGE), 'en')).toBe('2 controls answer to “edit”. The voice tool will ask which one, often with numbers.');
    const fr = [say('', PAGE), say('Rien', PAGE), say('Send', PAGE), say('Edit', PAGE)].map((r) => sayText(r, 'fr'));
    expect(fr[2]).toBe(`Une seule commande répond à «${NNBSP}send${NNBSP}»${NBSP}: bouton «${NNBSP}Send${NNBSP}».`);
    for (const t of fr) expect(frTypographyIssues(t), t).toEqual([]);
  });
});

describe('voiceText', () => {
  it('holds the title, the summary, each control that takes extra steps, and what it does not say', () => {
    const lines = voiceText(buildVoice(PAGE), 'en').split('\n');
    expect(lines[0]).toBe('Say it to press it');
    expect(lines).toContain('link “Learn more”: It shows “Learn more”, but its name is “Read more about ramps”. Saying what it shows may not work.');
    expect(lines).toContain('button with no text (button[6]): It has no name, so no words reach it. It takes numbers or a grid.');
    expect(lines.at(-2)).toBe('Voice tools differ. These counts are about the names on the page, not about any one tool.');
    expect(lines.at(-1)).toBe('');
  });

  it('stops listing after the limit', () => {
    expect(voiceText(buildVoice(PAGE), 'en', 2)).toContain('… and 3 more.');
    expect(voiceText(buildVoice(facts([c('Send', 'Send')])), 'en').split('\n')).toHaveLength(4);
  });

  it('says it in French, with French typography on every line', () => {
    for (const l of voiceText(buildVoice(PAGE), 'fr').split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
  });
});
