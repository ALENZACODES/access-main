/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { mountNarrowPanel } from './panel.js';

/** "Compare two colours" in the audit panel with a real DOM under it: labels, focus, the form values and the style sheets of the document. */

const hosts: HTMLElement[] = [];

function mount(lang: 'en' | 'fr' = 'en'): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  mountNarrowPanel({ root: host, lang, heading: false });
  return host;
}

afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
  for (const s of [...document.head.querySelectorAll('style')]) s.remove();
});

const field = (host: HTMLElement, id: string): HTMLInputElement => host.querySelector(`#${id}`) as HTMLInputElement;
const press = (host: HTMLElement, action: string): void => (host.querySelector(`[data-action="${action}"]`) as HTMLElement).click();
const type = (host: HTMLElement, text: string, background: string): void => {
  field(host, 'pair-text').value = text;
  field(host, 'pair-background').value = background;
};

describe('the colour tool in a document', () => {
  it('has one label for each field, and both fields share the hint', () => {
    const host = mount();
    for (const id of ['pair-text', 'pair-background', 'pair-large']) {
      expect(field(host, id).labels?.length, id).toBe(1);
      expect(field(host, id).labels?.[0]?.textContent?.trim(), id).not.toBe('');
    }
    expect(field(host, 'pair-text').labels?.[0]?.textContent).toBe('Text colour');
    for (const id of ['pair-text', 'pair-background']) {
      const hint = document.getElementById(field(host, id).getAttribute('aria-describedby') ?? '');
      expect(hint?.textContent).toContain('#1b1916');
    }
  });

  it('compares the typed colours, focuses the result heading and fills the table', () => {
    const host = mount();
    type(host, '#777777', 'white');
    press(host, 'pair-compare');
    const heading = host.querySelector('#pair-result-h') as HTMLElement;
    expect(document.activeElement).toBe(heading);
    expect(heading.tabIndex).toBe(-1);
    expect(host.querySelector('.pair caption')?.textContent).toBe('#777777 on #ffffff: 4.47:1');
    const rows = [...host.querySelectorAll('.pair tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ['Normal text', '4.5:1', 'below it'],
      ['Large text', '3.0:1', 'reaches it'],
      ['Parts of controls and graphics', '3.0:1', 'reaches it'],
    ]);
    expect(host.querySelector('.pair [role=status]')?.textContent).toBe('Contrast is 4.47:1. It is below the 4.5:1 minimum for normal text.');
    expect(field(host, 'pair-text').value).toBe('#777777');
    expect(field(host, 'pair-background').value).toBe('white');
  });

  it('marks a field that is not a colour, ties the message to it and focuses it', () => {
    const host = mount();
    type(host, 'not a colour', '#fff');
    press(host, 'pair-compare');
    const text = field(host, 'pair-text');
    expect(text.getAttribute('aria-invalid')).toBe('true');
    const ids = (text.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toEqual(['pair-hint', 'pair-text-error']);
    for (const id of ids) expect(document.getElementById(id), id).not.toBeNull();
    expect(document.getElementById('pair-text-error')?.textContent).toContain('“not a colour” was not read as a colour.');
    expect(document.activeElement).toBe(text);
    expect(field(host, 'pair-background').getAttribute('aria-invalid')).toBeNull();
    expect(host.querySelector('#pair-result-h')).toBeNull();
  });

  it('uses a suggestion from its button', () => {
    const host = mount();
    type(host, '#777777', '#ffffff');
    press(host, 'pair-compare');
    const use = host.querySelector('[data-action="pair-use-text-0"]') as HTMLButtonElement;
    expect(use.textContent).toBe('Use #767676 for the text');
    use.click();
    expect(field(host, 'pair-text').value).toBe('#767676');
    expect(host.querySelector('.pair [role=status]')?.textContent).toBe('Contrast is 4.54:1. It reaches the 4.5:1 minimum for normal text.');
    expect(host.querySelector('[data-action^="pair-use-"]')).toBeNull();
  });

  it('reads the large-text box from the form', () => {
    const host = mount();
    type(host, '#777777', '#ffffff');
    field(host, 'pair-large').checked = true;
    press(host, 'pair-compare');
    expect(host.querySelector('.pair [role=status]')?.textContent).toContain('It reaches the 3.0:1 minimum for large text.');
    expect(field(host, 'pair-large').checked).toBe(true);
  });

  it('paints each swatch with the colour next to it, and hides it from assistive technology', () => {
    const host = mount();
    type(host, '#777777', '#ffffff');
    press(host, 'pair-compare');
    const swatches = [...host.querySelectorAll<HTMLElement>('.pair-swatch')];
    expect(swatches.length).toBeGreaterThanOrEqual(3);
    for (const s of swatches) {
      expect(s.getAttribute('aria-hidden')).toBe('true');
      expect(s.style.background).not.toBe('');
      expect(s.textContent).toBe('');
    }
  });

  it('erases both colours and puts focus on the first field', () => {
    const host = mount();
    type(host, '#777777', '#ffffff');
    press(host, 'pair-compare');
    press(host, 'pair-clear');
    expect(field(host, 'pair-text').value).toBe('');
    expect(field(host, 'pair-background').value).toBe('');
    expect(host.querySelector('#pair-result-h')).toBeNull();
    expect(document.activeElement).toBe(field(host, 'pair-text'));
  });

  it('reads the colour tokens from the style sheets of the document', () => {
    const style = document.createElement('style');
    style.textContent = ':root{--card:#ffffff;--card-ink:#888888;--gap:4px}';
    document.head.appendChild(style);
    const host = mount();
    press(host, 'pair-tokens');
    const section = host.querySelector('[aria-labelledby="pair-tokens-h"]') as HTMLElement;
    expect(document.activeElement).toBe(host.querySelector('#pair-tokens-h'));
    expect(section.querySelector('code')?.textContent).toBe(':root');
    expect(section.textContent).toContain('2 colour tokens read, 1 pair measured from the names.');
    expect(section.querySelector('li')?.textContent).toMatch(/^--card-ink on --card: 3\.54:1, below the 4\.5:1 minimum\. For example, text in #[0-9a-f]{6} gives 4\.5\d:1 on this background\.$/);
  });

  it('says so when the document has no colour token', () => {
    const host = mount();
    press(host, 'pair-tokens');
    expect(host.querySelector('[aria-labelledby="pair-tokens-h"]')?.textContent).toContain('No colour token was found in the style sheets of this page.');
  });

  it('keeps the colours when the language is switched, and comes back', () => {
    const host = mount();
    type(host, '#777777', '#ffffff');
    press(host, 'pair-compare');
    press(host, 'lang-fr');
    expect(host.getAttribute('lang')).toBe('fr');
    expect(host.querySelector('#pair-h')?.textContent).toBe('Comparer deux couleurs');
    expect(field(host, 'pair-text').value).toBe('#777777');
    expect(field(host, 'pair-text').labels?.[0]?.textContent).toBe('Couleur du texte');
    expect(host.querySelector('.pair tbody tr td:last-child')?.textContent).toBe('en dessous');
    press(host, 'lang-en');
    expect(host.querySelector('.pair tbody tr td:last-child')?.textContent).toBe('below it');
  });

  it('adds no heading above its own h2, and no second h1', () => {
    const host = mount();
    expect(host.querySelectorAll('h1')).toHaveLength(0);
    expect(host.querySelector('#pair-h')?.tagName).toBe('H2');
  });
});
