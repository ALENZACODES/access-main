import { describe, expect, it } from 'vitest';
import { AUTH_RULES, auditAuth, type AuthFacts } from './auth.js';
import { auditForms, FORM_RULES, wantedType } from './forms.js';
import { frTypographyIssues } from './i18n.js';
import { ASSERTIVE_LIMIT, auditStatus, STATUS_RULES, type StatusFacts } from './status.js';
import { auditClipping, auditFixedSpace, CLIP_RULES, FIXED_RULES } from './layoutspace.js';
import { auditMedia, MEDIA_RULES } from './media.js';
import { sampleEntries } from './samples.js';
import type { ClipFact, FieldFact, FixedFact, MediaFact, } from './semantics.js';
import type { Entry } from './types.js';

const rules = (es: readonly Entry[]): string[] => es.map((e) => `${e.rule}:${e.status}`);
const noFrIssues = (es: readonly Entry[]): void => {
  for (const e of es) {
    expect(e.message.en, `${e.rule} en`).not.toBe('');
    expect(frTypographyIssues(e.message.fr), `${e.rule}: ${e.message.fr}`).toEqual([]);
    expect(e.message.fr, e.rule).not.toBe(e.message.en);
  }
};

const field = (over: Partial<FieldFact> = {}): FieldFact => ({
  id: 'input[0]',
  kind: 'input',
  type: 'text',
  name: 'city',
  label: 'City',
  placeholder: '',
  required: false,
  autocomplete: '',
  inputmode: '',
  described: false,
  hintUnlinked: false,
  invalid: false,
  error: null,
  ...over,
});

describe('auditForms', () => {
  it('passes a labelled field and counts it', () => {
    const r = auditForms([field(), field({ id: 'input[1]' })], false);
    expect(r).toEqual({ checked: 2, entries: [] });
  });
  it('fails a field with only a placeholder, and not one that also has a label', () => {
    expect(rules(auditForms([field({ label: '', placeholder: 'Email' })], false).entries)).toEqual(['placeholder-only:fail']);
    expect(auditForms([field({ label: 'Full name', placeholder: 'Ada Lovelace' })], false).entries).toEqual([]);
  });
  it('a field with neither label nor placeholder is the name check’s business', () => {
    expect(auditForms([field({ label: '' })], false).entries).toEqual([]);
  });
  it('fails an invalid field that points to an empty error, and asks about one that is not announced', () => {
    expect(rules(auditForms([field({ invalid: true, error: { text: '', announced: true } })], false).entries)).toEqual(['error-empty:fail']);
    expect(rules(auditForms([field({ invalid: true, error: { text: 'Too short', announced: false } })], false).entries)).toEqual(['error-unannounced:unknown']);
    expect(auditForms([field({ invalid: true, error: { text: 'Too short', announced: true } })], false).entries).toEqual([]);
  });
  it('a field that is valid is not asked about its error', () => {
    expect(auditForms([field({ invalid: false, error: { text: '', announced: false } })], false).entries).toEqual([]);
  });
  it('asks about a required field with no mark, unless the page explains the mark', () => {
    expect(rules(auditForms([field({ required: true })], false).entries)).toEqual(['required-unmarked:unknown']);
    expect(auditForms([field({ required: true })], true).entries).toEqual([]);
    expect(auditForms([field({ required: true, label: 'City *' })], false).entries).toEqual([]);
    expect(auditForms([field({ required: true, label: 'Ville (obligatoire)' })], false).entries).toEqual([]);
    expect(auditForms([field({ required: true, label: 'Notes (optional)' })], false).entries).toEqual([]);
  });
  it('asks about an unlinked hint', () => {
    expect(rules(auditForms([field({ hintUnlinked: true })], false).entries)).toEqual(['hint-unlinked:unknown']);
  });
  it('asks when an email or phone field is a plain text field', () => {
    expect(rules(auditForms([field({ name: 'email', label: 'Email' })], false).entries)).toEqual(['type-mismatch:unknown']);
    expect(rules(auditForms([field({ name: 'x', label: 'Téléphone' })], false).entries)).toEqual(['type-mismatch:unknown']);
    expect(auditForms([field({ name: 'email', type: 'email' })], false).entries).toEqual([]);
    expect(auditForms([field({ name: 'email', inputmode: 'email' })], false).entries).toEqual([]);
    expect(auditForms([field({ kind: 'textarea', name: 'email' })], false).entries).toEqual([]);
  });
  it('wantedType reads the name, label and id', () => {
    expect(wantedType({ name: 'courriel', label: '', id: '' })).toBe('email');
    expect(wantedType({ name: '', label: 'Mobile', id: '' })).toBe('tel');
    expect(wantedType({ name: 'city', label: 'City', id: 'x' })).toBeNull();
  });
  it('names the field in the message and writes both languages', () => {
    const e = auditForms([field({ label: '', placeholder: 'Your name' })], false).entries;
    expect(e[0]?.message.en).toContain('Your name');
    expect(e[0]?.message.fr).toContain('Your name');
    noFrIssues(e);
  });
});

describe('auditAuth', () => {
  const none: AuthFacts = { passwords: [], oneTime: [], captchas: [] };
  const pw = (over = {}) => ({ id: 'input[0]', autocomplete: '', pasteBlocked: false, hasUsername: true, ...over });
  it('passes a plain sign in form', () => {
    expect(auditAuth({ ...none, passwords: [pw()] })).toEqual({ checked: 1, entries: [] });
    expect(auditAuth({ ...none, passwords: [pw({ autocomplete: 'current-password' })] }).entries).toEqual([]);
  });
  it('fails a blocked paste and autocomplete off', () => {
    expect(rules(auditAuth({ ...none, passwords: [pw({ pasteBlocked: true, autocomplete: 'off' })] }).entries)).toEqual(['paste-blocked:fail', 'autocomplete-off:fail']);
  });
  it('asks when a password has no user name field, but not when autocomplete is already off', () => {
    expect(rules(auditAuth({ ...none, passwords: [pw({ hasUsername: false })] }).entries)).toEqual(['no-username:unknown']);
    expect(rules(auditAuth({ ...none, passwords: [pw({ hasUsername: false, autocomplete: 'off' })] }).entries)).toEqual(['autocomplete-off:fail']);
  });
  it('asks about a code field without one-time-code, and passes one that has it', () => {
    expect(rules(auditAuth({ ...none, oneTime: [{ id: 'o', autocomplete: '' }] }).entries)).toEqual(['otp-no-autofill:unknown']);
    expect(auditAuth({ ...none, oneTime: [{ id: 'o', autocomplete: 'off one-time-code' }] }).entries).toEqual([]);
  });
  it('asks about a captcha and never passes it', () => {
    const r = auditAuth({ ...none, captchas: ['div[0]', 'iframe[0]'] });
    expect(rules(r.entries)).toEqual(['captcha:unknown', 'captcha:unknown']);
    expect(r.checked).toBe(2);
  });
  it('writes both languages', () => {
    noFrIssues(auditAuth({ passwords: [pw({ pasteBlocked: true, autocomplete: 'off' }), pw({ hasUsername: false })], oneTime: [{ id: 'o', autocomplete: '' }], captchas: ['c'] }).entries);
  });
});

describe('auditStatus', () => {
  const none: StatusFacts = { live: [], toasts: [], progress: [] };
  const live = (over = {}) => ({ id: 'div[0]', role: 'status', live: '', hidden: false, ...over });
  it('passes working live regions and a named progress bar', () => {
    const r = auditStatus({ live: [live(), live({ role: 'alert' }), live({ role: '', live: 'polite' })], toasts: [], progress: [{ id: 'p', named: true }] });
    expect(r).toEqual({ checked: 4, entries: [] });
  });
  it('fails a status or alert that aria-live off silences', () => {
    expect(rules(auditStatus({ ...none, live: [live({ live: 'off' }), live({ role: 'alert', live: 'off' })] }).entries)).toEqual(['live-conflict:fail', 'live-conflict:fail']);
  });
  it('a log with aria-live off is a choice, not a conflict', () => {
    expect(auditStatus({ ...none, live: [live({ role: 'log', live: 'off' })] }).entries).toEqual([]);
  });
  it('asks about a hidden live region', () => {
    expect(rules(auditStatus({ ...none, live: [live({ hidden: true })] }).entries)).toEqual(['live-hidden:unknown']);
  });
  it('asks when there are more assertive regions than the limit, and not at the limit', () => {
    const many = Array.from({ length: ASSERTIVE_LIMIT + 1 }, (_, i) => live({ id: `d${i}`, role: 'alert' }));
    expect(rules(auditStatus({ ...none, live: many }).entries)).toEqual(['too-assertive:unknown']);
    expect(auditStatus({ ...none, live: many.slice(0, ASSERTIVE_LIMIT) }).entries).toEqual([]);
  });
  it('asks about a toast outside a live region', () => {
    expect(rules(auditStatus({ ...none, toasts: ['div[3]'] }).entries)).toEqual(['toast-silent:unknown']);
  });
  it('fails an unnamed progress bar', () => {
    expect(rules(auditStatus({ ...none, progress: [{ id: 'p', named: false }] }).entries)).toEqual(['progress-unnamed:fail']);
  });
  it('writes both languages', () => {
    noFrIssues(auditStatus({ live: [live({ live: 'off', hidden: true }), live({ role: 'alert' }), live({ role: 'alert' }), live({ role: 'alert' })], toasts: ['t'], progress: [{ id: 'p', named: false }] }).entries);
  });
});

const media = (over: Partial<MediaFact> = {}): MediaFact => ({ id: 'video[0]', tag: 'video', autoplay: false, playing: false, muted: false, loop: false, controls: true, duration: 60, hasCaptions: true, host: '', ...over });

describe('auditMedia', () => {
  it('passes a video that waits for the person and has captions', () => {
    expect(auditMedia([media()])).toEqual({ checked: 1, entries: [] });
  });
  it('fails sound that plays by itself, with or without controls', () => {
    expect(rules(auditMedia([media({ playing: true })]).entries)).toEqual(['autoplay-sound:fail']);
    expect(rules(auditMedia([media({ playing: true, controls: false })]).entries)).toEqual(['autoplay-no-controls:fail']);
  });
  it('uses the autoplay attribute when the browser did not say', () => {
    expect(rules(auditMedia([media({ playing: null, autoplay: true })]).entries)).toEqual(['autoplay-sound:fail']);
    expect(auditMedia([media({ playing: null, autoplay: false })]).entries).toEqual([]);
  });
  it('allows sound of three seconds or less, and counts a loop or an unknown length as long', () => {
    expect(auditMedia([media({ playing: true, duration: 3 })]).entries).toEqual([]);
    expect(rules(auditMedia([media({ playing: true, duration: 3.5 })]).entries)).toEqual(['autoplay-sound:fail']);
    expect(rules(auditMedia([media({ playing: true, duration: 2, loop: true })]).entries)).toEqual(['autoplay-sound:fail']);
    expect(rules(auditMedia([media({ playing: true, duration: null })]).entries)).toEqual(['autoplay-sound:fail']);
  });
  it('muted media may start by itself', () => {
    expect(auditMedia([media({ playing: true, muted: true })]).entries).toEqual([]);
  });
  it('asks about a muted moving video with no controls', () => {
    expect(rules(auditMedia([media({ playing: true, muted: true, controls: false, loop: true })]).entries)).toEqual(['loop-no-pause:unknown']);
    expect(auditMedia([media({ playing: true, muted: true, controls: false, duration: 4 })]).entries).toEqual([]);
    expect(auditMedia([media({ tag: 'audio', playing: true, muted: true, controls: false, loop: true })]).entries).toEqual([]);
  });
  it('asks about a video with sound and no captions track, never an audio file', () => {
    expect(rules(auditMedia([media({ hasCaptions: false })]).entries)).toEqual(['no-captions:unknown']);
    expect(auditMedia([media({ tag: 'audio', hasCaptions: false })]).entries).toEqual([]);
  });
  it('asks about a video embed and names its host', () => {
    const e = auditMedia([media({ tag: 'embed', host: 'vimeo.com' })]).entries;
    expect(rules(e)).toEqual(['embed:unknown']);
    expect(e[0]?.message.en).toContain('vimeo.com');
  });
  it('writes both languages', () => {
    noFrIssues(auditMedia([media({ playing: true }), media({ playing: true, controls: false }), media({ playing: true, muted: true, controls: false, loop: true, hasCaptions: false }), media({ tag: 'embed', host: 'youtube.com' }), media({ hasCaptions: false })]).entries);
  });
});

const bar = (height: number, over: Partial<FixedFact> = {}): FixedFact => ({ id: 'header[0]', position: 'fixed', edge: 'top', height, width: 320, ...over });

describe('auditFixedSpace', () => {
  const vp = { width: 320, height: 640 };
  it('passes bars that leave most of the screen', () => {
    expect(auditFixedSpace([bar(56), bar(64, { edge: 'bottom', id: 'nav[0]' })], vp)).toEqual({ checked: 2, entries: [] });
  });
  it('asks above a third and fails above a half', () => {
    expect(rules(auditFixedSpace([bar(230)], vp).entries)).toEqual(['fixed-large:unknown']);
    expect(rules(auditFixedSpace([bar(330)], vp).entries)).toEqual(['fixed-covers:fail']);
  });
  it('the limits are exclusive', () => {
    expect(auditFixedSpace([bar(320)], vp).entries.map((e) => e.status)).toEqual(['unknown']);
    expect(auditFixedSpace([bar(640 * 0.33)], vp).entries).toEqual([]);
  });
  it('adds the top and bottom bars together', () => {
    const r = auditFixedSpace([bar(180), bar(180, { edge: 'bottom', id: 'nav[0]' })], vp);
    expect(rules(r.entries)).toEqual(['fixed-covers:fail']);
    expect(r.entries[0]?.id).toBe('header[0], nav[0]');
  });
  it('a narrow floating button is not a bar', () => {
    expect(auditFixedSpace([bar(400, { width: 56 })], vp).entries).toEqual([]);
  });
  it('without a screen height nothing can be judged, and nothing is failed', () => {
    expect(auditFixedSpace([bar(900)], { width: 320, height: 0 }).entries).toEqual([]);
  });
  it('a short landscape screen turns the same bar into a failure', () => {
    expect(auditFixedSpace([bar(120, { width: 640 })], { width: 640, height: 280 }).entries[0]?.status).toBe('unknown');
    expect(auditFixedSpace([bar(160, { width: 640 })], { width: 640, height: 280 }).entries[0]?.status).toBe('fail');
  });
  it('writes both languages, with a space before the percent sign in French', () => {
    const e = auditFixedSpace([bar(330)], vp).entries;
    noFrIssues(e);
    expect(e[0]?.message.fr).toMatch(/\d\u00A0%/);
    noFrIssues(auditFixedSpace([bar(230)], vp).entries);
  });
});

const clipFact = (over: Partial<ClipFact> = {}): ClipFact => ({ id: 'p[0]', axis: 'x', ellipsis: false, text: 'Opening hours', ...over });

describe('auditClipping', () => {
  it('passes a page with nothing clipped', () => {
    expect(auditClipping([], 12)).toEqual({ checked: 12, entries: [] });
  });
  it('fails text that is cut off, and says on which side', () => {
    const e = auditClipping([clipFact(), clipFact({ axis: 'y', id: 'p[1]' })]).entries;
    expect(rules(e)).toEqual(['text-clipped:fail', 'text-clipped:fail']);
    expect(e[0]?.message.en).toContain('at the side');
    expect(e[1]?.message.en).toContain('at the bottom');
  });
  it('asks about an ellipsis and does not fail it', () => {
    expect(rules(auditClipping([clipFact({ ellipsis: true })]).entries)).toEqual(['text-ellipsis:unknown']);
  });
  it('writes both languages', () => {
    noFrIssues(auditClipping([clipFact(), clipFact({ ellipsis: true }), clipFact({ axis: 'y' })]).entries);
  });
});

describe('coverage of the rules', () => {
  const seen = new Set(sampleEntries().filter((e) => ['forms', 'auth', 'status', 'media', 'fixed-space', 'clipping'].includes(e.check)).map((e) => `${e.check}/${e.rule}`));
  const groups: Array<[string, readonly string[]]> = [
    ['forms', FORM_RULES],
    ['auth', AUTH_RULES],
    ['status', STATUS_RULES],
    ['media', MEDIA_RULES],
    ['fixed-space', FIXED_RULES],
    ['clipping', CLIP_RULES],
  ];
  for (const [check, list] of groups) {
    it(`the sample set has an entry for every ${check} rule`, () => {
      for (const rule of list) expect(seen.has(`${check}/${rule}`), `${check}/${rule}`).toBe(true);
    });
  }
  it('the rule lists have no duplicates', () => {
    for (const [, list] of groups) expect(new Set(list).size).toBe(list.length);
  });
});
