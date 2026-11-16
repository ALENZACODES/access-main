import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_FACTS, semanticsInPage, type SemanticFacts } from './semantics.js';
import { installDom, type Installed, type Spec } from './testkit.js';

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

function read(roots: Spec[], opts: Parameters<typeof installDom>[1] = {}, maxElements = 500): SemanticFacts {
  dom = installDom(roots, opts);
  return semanticsInPage({ maxElements });
}

const input = (over: Partial<Spec> = {}): Spec => ({ tag: 'input', attrs: { type: 'text' }, interactive: true, ...over });

describe('semanticsInPage: fields', () => {
  it('reads the label, placeholder, required and autocomplete of a text field', () => {
    const f = read([input({ id: 'e', attrs: { type: 'email', name: 'email', placeholder: 'you@x.org', required: '', autocomplete: 'Email' }, labels: ['Email address'] })]);
    expect(f.fields).toHaveLength(1);
    expect(f.fields[0]).toMatchObject({ id: 'input#e[0]', kind: 'input', type: 'email', name: 'email', label: 'Email address', placeholder: 'you@x.org', required: true, autocomplete: 'email' });
  });
  it('uses aria-label and aria-labelledby when there is no label element', () => {
    const f = read([
      { tag: 'span', id: 'cap', text: 'Postal code' },
      input({ id: 'a', attrs: { type: 'text', 'aria-label': 'City' } }),
      input({ id: 'b', attrs: { type: 'text', 'aria-labelledby': 'cap' } }),
    ]);
    expect(f.fields.map((x) => x.label)).toEqual(['City', 'Postal code']);
  });
  it('skips hidden controls, buttons, checkboxes and hidden elements', () => {
    const f = read([
      input({ attrs: { type: 'hidden' } }),
      input({ attrs: { type: 'checkbox' } }),
      input({ attrs: { type: 'submit' } }),
      input({ style: { display: 'none' } }),
      { tag: 'div', style: { display: 'none' }, children: [input()] },
      input({ id: 'ok' }),
    ]);
    expect(f.fields.map((x) => x.id)).toEqual(['input#ok[5]']);
  });
  it('treats aria-required as required', () => {
    expect(read([input({ attrs: { type: 'text', 'aria-required': 'true' } })]).fields[0]?.required).toBe(true);
  });
  it('resolves aria-describedby, and flags a hint that sits next to a field without being linked', () => {
    const linked = read([{ tag: 'div', children: [input({ id: 'f', attrs: { type: 'text', 'aria-describedby': 'h' } }), { tag: 'span', id: 'h', attrs: { class: 'hint' }, text: 'Use letters' }] }]);
    expect(linked.fields[0]).toMatchObject({ described: true, hintUnlinked: false });
    dom?.uninstall();
    const loose = read([{ tag: 'div', children: [input({ id: 'f' }), { tag: 'span', attrs: { class: 'field-hint' }, text: 'Use letters' }] }]);
    expect(loose.fields[0]).toMatchObject({ described: false, hintUnlinked: true });
  });
  it('an empty hint element is not a hint', () => {
    expect(read([{ tag: 'div', children: [input(), { tag: 'span', attrs: { class: 'hint' } }] }]).fields[0]?.hintUnlinked).toBe(false);
  });
  it('reads an error message and whether it is in a live region', () => {
    const quiet = read([{ tag: 'div', children: [input({ id: 'f', attrs: { type: 'text', 'aria-invalid': 'true', 'aria-describedby': 'e' } }), { tag: 'p', id: 'e', text: 'Too short' }] }]);
    expect(quiet.fields[0]).toMatchObject({ invalid: true, error: { text: 'Too short', announced: false } });
    dom?.uninstall();
    const loud = read([{ tag: 'div', children: [input({ id: 'f', attrs: { type: 'text', 'aria-invalid': 'true', 'aria-errormessage': 'e' } }), { tag: 'p', id: 'e', attrs: { role: 'alert' }, text: 'Too short' }] }]);
    expect(loud.fields[0]?.error).toEqual({ text: 'Too short', announced: true });
  });
  it('a field that is not invalid has no error', () => {
    expect(read([input({ attrs: { type: 'text', 'aria-describedby': 'h' } }), { tag: 'p', id: 'h', text: 'x' }]).fields[0]?.error).toBeNull();
  });
  it('finds a note that says what the required mark means, in either language', () => {
    expect(read([{ tag: 'p', text: '* = required' }]).requiredNote).toBe(true);
    dom?.uninstall();
    expect(read([{ tag: 'p', text: 'Les champs obligatoires sont marqués' }]).requiredNote).toBe(true);
    dom?.uninstall();
    expect(read([{ tag: 'p', text: 'Welcome' }]).requiredNote).toBe(false);
  });
});

describe('semanticsInPage: sign in', () => {
  it('reads a password field, its autocomplete and a blocked paste', () => {
    const f = read([{ tag: 'form', children: [input({ attrs: { type: 'email', name: 'email' } }), input({ id: 'pw', attrs: { type: 'password', autocomplete: 'off', onpaste: 'return false' } })] }]);
    expect(f.passwords).toEqual([{ id: 'input#pw[1]', autocomplete: 'off', pasteBlocked: true, hasUsername: true }]);
  });
  it('only a field in the same form counts as the user name', () => {
    const f = read([
      input({ attrs: { type: 'text', name: 'username' } }),
      { tag: 'form', children: [input({ id: 'pw', attrs: { type: 'password' } })] },
    ]);
    expect(f.passwords[0]).toMatchObject({ hasUsername: false, pasteBlocked: false });
  });
  it('finds a one-time code field by its autocomplete or its name', () => {
    const f = read([input({ id: 'a', attrs: { type: 'text', autocomplete: 'one-time-code' } }), input({ id: 'b', attrs: { type: 'text', name: 'otp' } }), input({ id: 'c', attrs: { type: 'text', name: 'city' } })]);
    expect(f.oneTime.map((o) => o.id)).toEqual(['input#a[0]', 'input#b[1]']);
  });
  it('finds a captcha by id, class or source, and ignores a hidden one', () => {
    const f = read([{ tag: 'div', attrs: { class: 'g-recaptcha' } }, { tag: 'iframe', attrs: { src: 'https://challenges.cloudflare.com/turnstile/v0' } }, { tag: 'div', id: 'hcaptcha', style: { display: 'none' } }]);
    expect(f.captchas).toEqual(['div[0]', 'iframe[0]']);
  });
});

describe('semanticsInPage: status, progress and media', () => {
  it('lists live regions with their state and finds a toast that is not live', () => {
    const f = read([
      { tag: 'div', id: 'a', attrs: { role: 'alert' }, text: 'Saved' },
      { tag: 'div', id: 'b', attrs: { 'aria-live': 'polite' }, style: { display: 'none' } },
      { tag: 'div', attrs: { class: 'toast' }, text: 'Saved' },
      { tag: 'div', attrs: { class: 'toast' }, text: 'Inside', children: [] },
      { tag: 'div', attrs: { role: 'status' }, children: [{ tag: 'div', attrs: { class: 'toast' }, text: 'Quiet' }] },
    ]);
    expect(f.live).toEqual([
      { id: 'div#a[0]', role: 'alert', live: '', hidden: false },
      { id: 'div#b[1]', role: '', live: 'polite', hidden: true },
      { id: 'div[4]', role: 'status', live: '', hidden: false },
    ]);
    expect(f.toasts).toEqual(['div[2]', 'div[3]']);
  });
  it('a word that only contains toast is not a toast', () => {
    expect(read([{ tag: 'div', attrs: { class: 'toaster-oven' }, text: 'Recipe' }]).toasts).toEqual([]);
  });
  it('reads progress bars and whether they have a name', () => {
    const f = read([{ tag: 'div', attrs: { role: 'progressbar' } }, { tag: 'progress', attrs: { 'aria-label': 'Upload' } }]);
    expect(f.progress.map((p) => p.named)).toEqual([false, true]);
  });
  it('reads media state from the element, and falls back to attributes', () => {
    const f = read([
      { tag: 'video', id: 'v', attrs: { autoplay: '' }, props: { paused: false, muted: false, loop: true, controls: false, duration: 42 }, children: [{ tag: 'track', attrs: { kind: 'captions' } }] },
      { tag: 'audio', id: 'a', attrs: { autoplay: '', muted: '', controls: '' } },
    ]);
    expect(f.media[0]).toMatchObject({ tag: 'video', autoplay: true, playing: true, muted: false, loop: true, controls: false, duration: 42, hasCaptions: true });
    expect(f.media[1]).toMatchObject({ tag: 'audio', playing: null, muted: true, controls: true, duration: null, hasCaptions: false });
  });
  it('a duration that is not finite is unknown', () => {
    expect(read([{ tag: 'video', props: { paused: true, duration: Number.POSITIVE_INFINITY } }]).media[0]?.duration).toBeNull();
  });
  it('lists a video embed by host and ignores other frames', () => {
    const f = read([
      { tag: 'iframe', attrs: { src: 'https://www.youtube.com/embed/x?autoplay=1&mute=1' } },
      { tag: 'iframe', attrs: { src: 'https://example.org/page' } },
    ]);
    expect(f.media).toHaveLength(1);
    expect(f.media[0]).toMatchObject({ tag: 'embed', host: 'youtube.com', autoplay: true, muted: true });
  });
});

describe('semanticsInPage: fixed bars and clipped text', () => {
  const bar = (id: string, top: number, bottom: number, extra: Partial<Spec> = {}): Spec => ({
    tag: 'header',
    id,
    style: { position: 'fixed' },
    rect: [0, top, 320, bottom],
    ...extra,
  });
  it('reads fixed and sticky bars with their edge, and skips one inside another', () => {
    const f = read([
      bar('top', 0, 100),
      bar('bottom', 590, 640, { style: { position: 'sticky' } }),
      { tag: 'div', id: 'mid', style: { position: 'fixed' }, rect: [0, 200, 320, 260] },
      { tag: 'div', style: { position: 'fixed' }, rect: [0, 0, 320, 80], children: [{ tag: 'nav', style: { position: 'sticky' }, rect: [0, 0, 320, 40] }] },
    ]);
    expect(f.viewport).toEqual({ width: 320, height: 640 });
    expect(f.fixed.map((x) => [x.id, x.position, x.edge, x.height])).toEqual([
      ['header#top[0]', 'fixed', 'top', 100],
      ['header#bottom[1]', 'sticky', 'bottom', 50],
      ['div#mid[0]', 'fixed', 'other', 60],
      ['div[1]', 'fixed', 'top', 80],
    ]);
  });
  it('ignores fixed elements that have no size or are hidden', () => {
    expect(read([bar('a', 0, 0), bar('b', 0, 50, { style: { position: 'fixed', display: 'none' } })]).fixed).toEqual([]);
  });
  it('finds text cut off at the side or at the bottom, and ellipsis separately', () => {
    const f = read([
      { tag: 'p', id: 'x', text: 'Wide place name', style: { overflowX: 'hidden' }, scroll: { sw: 300, cw: 100, sh: 20, ch: 20 } },
      { tag: 'p', id: 'y', text: 'Tall text', style: { overflowY: 'hidden' }, scroll: { sw: 100, cw: 100, sh: 80, ch: 20 } },
      { tag: 'p', id: 'z', text: 'Shortened', style: { overflowX: 'hidden', textOverflow: 'ellipsis' }, scroll: { sw: 300, cw: 100, sh: 20, ch: 20 } },
      { tag: 'p', id: 'ok', text: 'Fits', style: { overflowX: 'hidden' }, scroll: { sw: 100, cw: 100, sh: 20, ch: 20 } },
      { tag: 'p', id: 'free', text: 'Scrolls', scroll: { sw: 300, cw: 100, sh: 20, ch: 20 } },
    ]);
    expect(f.clips.map((c) => [c.id, c.axis, c.ellipsis])).toEqual([
      ['p#x[0]', 'x', false],
      ['p#y[1]', 'y', false],
      ['p#z[2]', 'x', true],
    ]);
  });
  it('a box with no text of its own is not clipped text', () => {
    expect(read([{ tag: 'div', style: { overflowX: 'hidden' }, scroll: { sw: 300, cw: 100, sh: 20, ch: 20 } }]).clips).toEqual([]);
  });
});

describe('semanticsInPage: limits', () => {
  it('says when the document was larger than the limit', () => {
    const roots: Spec[] = Array.from({ length: 6 }, () => ({ tag: 'p', text: 'x' }));
    expect(read(roots, {}, 3).truncated).toBe(true);
    dom?.uninstall();
    expect(read(roots, {}, 10).truncated).toBe(false);
  });
  it('an empty page gives the empty facts', () => {
    expect({ ...read([]), viewport: EMPTY_FACTS.viewport }).toEqual(EMPTY_FACTS);
  });
});
