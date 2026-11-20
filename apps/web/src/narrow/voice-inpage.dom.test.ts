/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VOICE_ARGS, voiceInPage, type VoiceFacts } from './voice-inpage.js';

/** What is read from a real DOM. jsdom lays nothing out, so each element is given a box, except those marked data-nobox or data-tiny. */
const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function box(this: Element): DOMRect {
    const size = this.hasAttribute('data-nobox') ? 0 : this.hasAttribute('data-tiny') ? 1 : 40;
    return { x: 0, y: 0, top: 0, left: 0, right: size, bottom: size, width: size, height: size, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
  document.body.innerHTML = '';
});

const read = (html: string, exclude = ''): VoiceFacts => {
  document.body.innerHTML = html;
  return voiceInPage({ ...VOICE_ARGS, exclude });
};
const rows = (f: VoiceFacts): string[][] => f.controls.map((c) => [c.role, c.name, c.visible]);

describe('voiceInPage', () => {
  it('gives the role, the name and the visible text of buttons, links and input buttons', () => {
    const f = read('<button>Send</button><a href="/m">Read more</a><input type="submit" value="Go"><input type="submit"><summary>More</summary>');
    expect(rows(f)).toEqual([
      ['button', 'Send', 'Send'],
      ['link', 'Read more', 'Read more'],
      ['button', 'Go', 'Go'],
      ['button', 'Submit', 'Submit'],
      ['button', 'More', 'More'],
    ]);
  });

  it('takes the name from aria-label or aria-labelledby, while the visible text stays what shows', () => {
    const f = read('<button aria-label="Read more about ramps">Learn more</button><span id="a">Search</span><span id="b">places</span><button aria-labelledby="a b">Find</button>');
    expect(rows(f)).toEqual([
      ['button', 'Read more about ramps', 'Learn more'],
      ['button', 'Search places', 'Find'],
    ]);
  });

  it('shows no words for an icon button, and for text kept only for screen readers', () => {
    const f = read('<button aria-label="Close"><svg aria-hidden="true"></svg></button><button><img src="data:," alt="Menu"></button><a href="/h"><span data-tiny>Home</span></a>');
    expect(rows(f)).toEqual([
      ['button', 'Close', ''],
      ['button', 'Menu', ''],
      ['link', 'Home', ''],
    ]);
  });

  it('names fields and choices by their label, and shows the label or the placeholder', () => {
    const f = read('<label for="t">Town</label><input id="t"><input placeholder="Search"><label><input type="checkbox"> Ramp</label><select aria-label="Size"><option>S</option></select>');
    expect(rows(f)).toEqual([
      ['field', 'Town', 'Town'],
      ['field', 'Search', 'Search'],
      ['choice', 'Ramp', 'Ramp'],
      ['field', 'Size', ''],
    ]);
  });

  it('reads roles given by ARIA', () => {
    const f = read('<div role="button" tabindex="0">Open</div><span role="link" tabindex="0">Map</span><div role="switch" aria-label="Captions" tabindex="0"></div><div role="textbox" aria-label="Note" tabindex="0"></div>');
    expect(f.controls.map((c) => c.role)).toEqual(['button', 'link', 'choice', 'field']);
  });

  it('leaves out hidden, disabled, inert, aria-hidden and boxless controls, and the excluded part', () => {
    const f = read(
      '<button hidden>A</button><button disabled>B</button><div inert><button>C</button></div><div aria-hidden="true"><button>D</button></div><button data-nobox>E</button><div style="display:none"><a href="/f">F</a></div><div class="voice"><button>G</button></div><button>Kept</button>',
      '.voice',
    );
    expect(f.controls.map((c) => c.name)).toEqual(['Kept']);
  });

  it('gives each control an id from its tag, its id and its number among elements of that tag', () => {
    const f = read('<button id="go">Go</button><button disabled>Off</button><button>Again</button>');
    expect(f.controls.map((c) => c.id)).toEqual(['button#go[0]', 'button[2]']);
  });

  it('reads no more controls than asked, says the page was cut, and moves no focus', () => {
    document.body.innerHTML = '<button>1</button><button>2</button><button>3</button>';
    const f = voiceInPage({ maxControls: 2, exclude: '' });
    expect(f.controls).toHaveLength(2);
    expect(f.truncated).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });
});
