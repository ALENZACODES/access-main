import type { CauseKind, RegionKind } from './overflow.js';

/**
 * Small pages that each overflow in one known way, and pages that do not.
 * The browser test loads them at 320 CSS pixels and compares what the probe
 * finds with what is written here.
 */

export interface OverflowFixture {
  readonly name: string;
  readonly body: string;
  readonly css?: string;
  /** The causes the page should give, as `kind id`. Empty for a page that fits. */
  readonly causes: readonly `${CauseKind} ${string}`[];
  /** The regions that scroll sideways, as `kind id`. */
  readonly regions?: readonly `${RegionKind} ${string}`[];
  /** `rtl` for a page written right to left. */
  readonly dir?: 'rtl';
}

const WORDS = 'Opening hours and how to get here by bus, by train or on foot. ';
const LONG_URL = 'https://example.org/a/very/long/address/with/no/space/in/it/at/all/that/goes/on/and/on';

export const OVERFLOW_FIXTURES: readonly OverflowFixture[] = [
  { name: 'fits', body: `<h1>Hours</h1><p>${WORDS.repeat(4)}</p><ul><li>One</li><li>Two</li></ul>`, causes: [] },
  { name: 'fixed-width', body: `<div id="card" style="width:600px"><p>${WORDS}</p></div>`, causes: ['fixed-width div#card[0]'] },
  { name: 'fixed-width-nested', body: `<main><section><div id="inner" style="width:480px"><p>${WORDS}</p><p>${WORDS}</p></div></section></main>`, causes: ['fixed-width div#inner[0]'] },
  { name: 'min-width', body: `<div id="panel" style="min-width:500px"><p>${WORDS}</p></div>`, causes: ['min-width div#panel[0]'] },
  { name: 'body-width', css: 'body{width:700px}', body: `<p>${WORDS}</p>`, causes: ['fixed-width body'] },
  { name: 'long-word', body: `<p id="link">See ${LONG_URL} for more.</p>`, causes: ['long-word p#link[0]'] },
  { name: 'long-word-inline', body: `<p id="para">See <a href="/x"><strong>${LONG_URL}</strong></a> for more.</p>`, causes: ['long-word p#para[0]'] },
  { name: 'long-word-wraps', css: 'p{overflow-wrap:anywhere}', body: `<p>See ${LONG_URL} for more.</p>`, causes: [] },
  { name: 'nowrap', body: `<p id="line" style="white-space:nowrap">${WORDS.repeat(3)}</p>`, causes: ['nowrap p#line[0]'] },
  { name: 'nowrap-heading', body: `<h1 id="title" style="white-space:nowrap">A page title that is far too long to fit on one line of a phone</h1>`, causes: ['nowrap h1#title[0]'] },
  { name: 'preformatted', body: `<pre id="code">const answer = computeTheAnswerToEverything(input, options, { verbose: true, retries: 3 });</pre>`, causes: ['preformatted pre#code[0]'] },
  { name: 'image', body: `<p><img id="photo" alt="A ramp at the main door" width="800" height="200" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></p>`, causes: ['media img#photo[0]'] },
  { name: 'image-shrinks', css: 'img{max-width:100%;height:auto}', body: `<p><img alt="A ramp at the main door" width="800" height="200" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></p>`, causes: [] },
  { name: 'iframe', body: `<iframe id="map" title="Map" width="640" height="200" srcdoc="<p>Map</p>"></iframe>`, causes: ['media iframe#map[0]'] },
  {
    name: 'table',
    body: `<table id="hours"><caption>Hours</caption><tr>${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => `<th scope="col" style="padding:8px 16px">${d}</th>`).join('')}</tr><tr>${'<td>9&nbsp;to&nbsp;5</td>'.repeat(7)}</tr></table>`,
    causes: ['table table#hours[0]'],
  },
  {
    name: 'flex-nowrap',
    body: `<div id="row" style="display:flex">${['One', 'Two', 'Three', 'Four'].map((t) => `<a href="/${t}" style="flex:none;width:120px">${t}</a>`).join('')}</div>`,
    causes: ['flex-nowrap div#row[0]'],
  },
  {
    name: 'flex-wraps',
    body: `<div style="display:flex;flex-wrap:wrap">${['One', 'Two', 'Three', 'Four'].map((t) => `<a href="/${t}" style="flex:none;width:120px">${t}</a>`).join('')}</div>`,
    causes: [],
  },
  { name: 'grid-columns', body: `<div id="grid" style="display:grid;grid-template-columns:200px 200px 200px;gap:10px"><p>One</p><p>Two</p><p>Three</p></div>`, causes: ['grid-columns div#grid[0]'] },
  { name: 'grid-shrinks', body: `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px"><p>One</p><p>Two</p><p>Three</p></div>`, causes: [] },
  { name: 'positioned', css: 'body{position:relative}', body: `<p>${WORDS}</p><div id="badge" style="position:absolute;top:0;left:300px;width:100px">New</div>`, causes: ['positioned div#badge[0]'] },
  { name: 'offset-margin', body: `<div id="pushed" style="margin-left:200px;margin-right:-200px"><p>${WORDS}</p></div>`, causes: ['offset div#pushed[0]'] },
  { name: 'offset-relative', body: `<div id="moved" style="position:relative;left:120px"><p>${WORDS}</p></div>`, causes: ['offset div#moved[0]'] },
  { name: 'inline-block', body: `<span id="chip" style="display:inline-block;width:400px">Chip</span>`, causes: ['wide-box span#chip[0]'] },
  { name: 'hidden-far-left', body: `<a href="#main" style="position:absolute;left:-9999px">Skip</a><main id="main"><p>${WORDS}</p></main>`, causes: [] },
  { name: 'clipped', body: `<div style="overflow:hidden"><div style="width:600px"><p>${WORDS}</p></div></div>`, causes: [] },
  { name: 'two-causes', body: `<div id="a" style="width:500px"><p>${WORDS}</p></div><p id="b" style="white-space:nowrap">${WORDS.repeat(2)}</p>`, causes: ['fixed-width div#a[0]', 'nowrap p#b[1]'] },
  {
    name: 'region-table',
    body: `<div id="scroller" tabindex="0" role="region" aria-label="Hours" style="overflow-x:auto"><table style="width:600px"><caption>Hours</caption><tr><th scope="col">Day</th><th scope="col">Open</th></tr><tr><td>Monday</td><td>9 to 5</td></tr></table></div>`,
    causes: [],
    regions: ['region-content div#scroller[0]'],
  },
  { name: 'region-code', body: `<pre id="block" style="overflow-x:auto">const answer = computeTheAnswerToEverything(input, options, { verbose: true, retries: 3 });</pre>`, causes: [], regions: ['region-content pre#block[0]'] },
  { name: 'region-text', body: `<div id="wide" style="overflow-x:auto"><p style="width:700px">${WORDS.repeat(3)}</p></div>`, causes: [], regions: ['region-text div#wide[0]'] },
  { name: 'region-fits', body: `<div style="overflow-x:auto"><p>${WORDS}</p></div>`, causes: [] },
  { name: 'rtl-fixed-width', dir: 'rtl', body: `<div id="card" style="width:600px"><p>${WORDS}</p></div>`, causes: ['fixed-width div#card[0]'] },
  { name: 'rtl-fits', dir: 'rtl', body: `<p>${WORDS.repeat(3)}</p>`, causes: [] },
];

/** A whole page for a fixture, with a viewport and no margin, so the numbers are easy to read. */
export function fixturePage(f: OverflowFixture): string {
  return (
    `<!doctype html><html lang="en"${f.dir ? ` dir="${f.dir}"` : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${f.name}</title><style>body{margin:0;font:16px/1.5 sans-serif}${f.css ?? ''}</style></head><body>${f.body}</body></html>`
  );
}
