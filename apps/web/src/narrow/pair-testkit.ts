import type { PanelRoot } from './panel.js';

/**
 * Test support for the "Compare two colours" tool: a root with no DOM that
 * remembers what was typed and where focus went, and helpers to read markup
 * as text or as a whole page.
 */

export interface FakeRoot extends PanelRoot {
  /** Values a person typed or ticked, by selector. */
  readonly fields: Record<string, { value?: string; checked?: boolean }>;
  /** Selectors that were given focus, in order. */
  readonly focused: string[];
  readonly attributes: Record<string, string>;
  /** Activates the control with this `data-action`. */
  click(action: string | null): void;
  /** Types the two colours and sets the large-text box. */
  type(text: string, background: string, large?: boolean): void;
}

export function fakeRoot(): FakeRoot {
  const handlers: Array<(e: { target: unknown }) => void> = [];
  const root: FakeRoot = {
    innerHTML: '',
    fields: {},
    focused: [],
    attributes: {},
    setAttribute(name, value) {
      root.attributes[name] = value;
    },
    addEventListener(_type, handler) {
      handlers.push(handler);
    },
    querySelector(selector) {
      const field = root.fields[selector] ?? {};
      return {
        ...field,
        focus: () => {
          root.focused.push(selector);
        },
      };
    },
    click(action) {
      for (const h of handlers) h({ target: { getAttribute: (n: string) => (n === 'data-action' ? action : null) } });
    },
    type(text, background, large = false) {
      root.fields['#pair-text'] = { value: text };
      root.fields['#pair-background'] = { value: background };
      root.fields['#pair-large'] = { checked: large };
    },
  };
  return root;
}

/** Lets the promises a click started run to their end. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

/** The text of a piece of markup, the style block and tags removed, entities decoded. Spaces are kept as written. */
export function textOf(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** A whole page around a fragment, so the document checks can read it. */
export function pageAround(fragment: string, lang: 'en' | 'fr'): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${lang === 'fr' ? 'Comparer deux couleurs' : 'Compare two colours'}</title></head><body><main><h1>${lang === 'fr' ? 'Audit écran étroit' : 'Narrow-screen audit'}</h1>${fragment}</main></body></html>`;
}

/** A style sheet like the one of the App: a light root, a dark scheme and a high-contrast theme. */
export const SAMPLE_CSS = `
:root {
  --bg: #f4f1ea;
  --surface: #fffdf8;
  --ink: #1b1916;
  --muted: #3d3832;
  --header: #083734;
  --header-ink: #ffffff;
  --accent: #ffd84a;
  --accent-ink: #000000;
  --space: 12px;
  --font: system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000;
    --surface: #000000;
    --ink: #ffffff;
    --header: #000000;
  }
}
[data-theme="soft"] {
  --accent: #ffe9a0;
  --accent-ink: #b0a070;
}
`;
