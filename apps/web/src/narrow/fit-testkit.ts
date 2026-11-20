import type { DeviceEnv } from './device-facts.js';
import type { FitRoot } from './fit-panel.js';

/** Test support for the "This page on your screen" panel: browsers that answer as told, and a root with no DOM. */

/** A browser that answers every media feature the module reads. `yes` lists the words of the queries that match. */
export function envOf(width: number, height: number, fontPx: number | null, yes: readonly string[], silent: readonly string[] = []): DeviceEnv {
  return {
    innerWidth: width,
    innerHeight: height,
    media: (q) => (silent.some((w) => q.includes(w)) ? null : yes.some((w) => q.includes(w))),
    rootFontSizePx: () => fontPx,
  };
}

/** A phone held upright, with large text, reduced motion and a dark scheme. The browser says nothing about contrast or forced colours. */
export const PHONE: DeviceEnv = envOf(320, 640, 24, ['reduce', 'coarse', 'portrait', 'dark', 'hover: none'], ['contrast', 'forced']);

/** A desktop window with every default. */
export const DESKTOP: DeviceEnv = envOf(1280, 800, 16, ['no-preference', 'fine', 'landscape', 'light', 'hover: hover', 'forced-colors: none']);

/** A browser that reports nothing at all. */
export const SILENT: DeviceEnv = {};

export interface FakeRoot extends FitRoot {
  /** Values a person typed or chose, by selector. */
  readonly fields: Record<string, { value?: string; checked?: boolean }>;
  /** Selectors that were given focus, in order. */
  readonly focused: string[];
  readonly attributes: Record<string, string>;
  /** Activates the control with this `data-action`. */
  click(action: string | null): void;
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
  };
  return root;
}

/** Lets the promises a click started run to their end. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

/** The text of a piece of markup, tags and the style block removed, entities decoded. Spaces are kept as written. */
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
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${lang === 'fr' ? 'Cette page sur votre écran' : 'This page on your screen'}</title></head><body><main><h1>${lang === 'fr' ? 'Audit écran étroit' : 'Narrow-screen audit'}</h1>${fragment}</main></body></html>`;
}
