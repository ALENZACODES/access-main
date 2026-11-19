import { afterEach, describe, expect, it } from 'vitest';
import { ARIA_RULES } from './aria.js';
import { CONSTRAINT_RULES } from './constraints.js';
import { LIST_RULES } from './lists.js';
import { SECTIONING_RULES } from './sectioning.js';
import { STATE_RULES } from './states.js';
import { SYMBOL_RULES } from './symbols.js';
import { renderJunit, renderSarif } from './ci.js';
import { scanCopy } from './copylint.js';
import { CSS_RULE_IDS } from './cssrules.js';
import { noFrIssues } from './expect-fr.js';
import { HREF_RULES } from './hrefs.js';
import { snapshotInPage } from './inpage.js';
import { OBSOLETE_RULES } from './obsolete.js';
import { INTERACTIVE_SELECTOR } from './page.js';
import { REFERENCE_RULES } from './references.js';
import { makeReport, totals } from './report.js';
import { auditSnapshot, markupResults, selfAudit } from './run.js';
import {
  SAMPLE_ARIA_HTML,
  SAMPLE_CONSTRAINTS_HTML,
  SAMPLE_CSS_HTML,
  SAMPLE_HREFS_HTML,
  SAMPLE_LISTS_HTML,
  SAMPLE_OBSOLETE_HTML,
  SAMPLE_REFERENCES_HTML,
  SAMPLE_SECTIONING_HTML,
  SAMPLE_STATES_HTML,
  SAMPLE_SYMBOLS_HTML,
  sampleEntries,
} from './samples.js';
import { selectChecks } from './select.js';
import { installDom, type Installed } from './testkit.js';
import { CHECK_LABELS, CHECK_ORDER, CHECK_SC, type CheckId } from './types.js';

const MINE: readonly CheckId[] = ['aria', 'references', 'hrefs', 'css', 'obsolete', 'states', 'lists', 'sectioning', 'constraints', 'symbols'];

const GOOD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hours</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0}
a:focus-visible,button:focus-visible{outline:3px solid #0b4f9c;outline-offset:2px}
.fade{transition:opacity .2s}
@media (prefers-reduced-motion: reduce){.fade{transition:none}}
</style></head><body>
<a href="#main">Skip to content</a>
<header><nav aria-label="Main"><a href="/" aria-current="page">Home</a> <a href="/map">Map</a></nav></header>
<main id="main"><h1>Hours</h1>
<p>Call <a href="tel:+14165550100">416-555-0100</a> or <a href="mailto:help@example.org">write to us</a>. See <a href="#mon">Monday</a>.</p>
<table><caption>Opening hours</caption><tr><th id="day">Day</th><th id="open">Open</th></tr><tr><td headers="day" id="mon">Monday</td><td headers="open">9 to 5</td></tr></table>
<button type="button" aria-expanded="false" aria-controls="more">More</button>
<form action="/search"><label for="q">Search</label><input id="q" name="q" list="towns"><datalist id="towns"><option value="Ottawa"></datalist><button>Search</button></form>
<ul><li>Ramp at the side door</li><li>Lift in the back hall</li></ul>
<img src="plan.png" alt="Floor plan" width="320" height="200">
</main><footer><a href="/help">Help</a></footer></body></html>`;

let dom: Installed | null = null;
afterEach(() => {
  dom?.uninstall();
  dom = null;
});

describe('check tables', () => {
  it('list the ten markup checks once each, with labels in both languages and a criterion', () => {
    for (const id of MINE) {
      expect(CHECK_ORDER.filter((c) => c === id)).toHaveLength(1);
      expect(CHECK_LABELS[id].en.trim()).not.toBe('');
      expect(CHECK_LABELS[id].fr.trim()).not.toBe('');
      expect(CHECK_LABELS[id].fr).not.toBe(CHECK_LABELS[id].en);
      expect(CHECK_SC[id]).toMatch(/^\d\.\d\.\d+$/);
    }
    expect(CHECK_SC.aria).toBe('4.1.2');
    expect(CHECK_SC.references).toBe('1.3.1');
    expect(CHECK_SC.hrefs).toBe('2.4.4');
    expect(CHECK_SC.css).toBe('2.4.7');
    expect(CHECK_SC.obsolete).toBe('1.3.1');
    expect(CHECK_SC.states).toBe('4.1.2');
    expect(CHECK_SC.lists).toBe('1.3.1');
    expect(CHECK_SC.sectioning).toBe('1.3.1');
    expect(CHECK_SC.constraints).toBe('3.3.2');
    expect(CHECK_SC.symbols).toBe('1.1.1');
  });
  it('has no check id twice and a label for every id in the order', () => {
    expect(new Set(CHECK_ORDER).size).toBe(CHECK_ORDER.length);
    for (const id of CHECK_ORDER) expect(CHECK_LABELS[id], id).toBeDefined();
  });
});

describe('markupResults', () => {
  it('runs the ten checks and nothing else', () => {
    expect(Object.keys(markupResults('<p>x</p>')).sort()).toEqual([...MINE].sort());
  });
  it('finds nothing on a good page and says how much it read', () => {
    const r = markupResults(GOOD);
    for (const id of MINE) expect(r[id]?.entries, id).toEqual([]);
    expect(r['aria']?.checked).toBe(3);
    expect(r['references']?.checked).toBe(5);
    expect(r['hrefs']?.checked).toBe(7);
    expect(r['css']?.checked).toBe(4);
    expect(r['obsolete']?.checked).toBeGreaterThan(30);
    expect(r['states']?.checked).toBe(1);
    expect(r['lists']?.checked).toBe(1);
    expect(r['sectioning']?.checked).toBe(3);
    expect(r['constraints']?.checked).toBe(2);
    expect(r['symbols']?.checked).toBeGreaterThan(15);
  });
  it('tags every entry with its own check', () => {
    const all = SAMPLE_REFERENCES_HTML + SAMPLE_HREFS_HTML + SAMPLE_CSS_HTML + SAMPLE_OBSOLETE_HTML + SAMPLE_STATES_HTML + SAMPLE_LISTS_HTML + SAMPLE_SECTIONING_HTML + SAMPLE_CONSTRAINTS_HTML + SAMPLE_SYMBOLS_HTML + SAMPLE_ARIA_HTML;
    let seen = 0;
    for (const [id, result] of Object.entries(markupResults(all))) {
      for (const e of result?.entries ?? []) {
        expect(e.check, e.rule).toBe(id);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(40);
  });
});

describe('auditSnapshot', () => {
  const snap = (): ReturnType<typeof snapshotInPage> => snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 100 });
  it('adds the markup checks only when markup is given', () => {
    dom = installDom([{ tag: 'p', text: 'hello' }]);
    const without = auditSnapshot('/x', 320, { snapshot: snap() }).checks.map((c) => c.check);
    for (const id of MINE) expect(without).not.toContain(id);
    const withHtml = auditSnapshot('/x', 320, { snapshot: snap(), html: '<a href="#">Menu</a><div role="buton">x</div><center>y</center><style>*{outline:0}</style><a href="#gone">z</a>' });
    expect(withHtml.checks.map((c) => c.check)).toEqual(expect.arrayContaining([...MINE]));
    const mine = withHtml.entries.filter((e) => MINE.includes(e.check)).map((e) => `${e.check}/${e.rule}:${e.status}`);
    expect(mine.sort()).toEqual(['aria/unknown-role:fail', 'css/outline-reset:unknown', 'hrefs/placeholder-href:unknown', 'obsolete/presentational-element:unknown', 'references/fragment-missing:fail']);
  });
  it('counts the failures in the totals and keeps unknown apart', () => {
    dom = installDom([{ tag: 'p', text: 'hello' }]);
    const route = auditSnapshot('/x', 320, { snapshot: snap(), html: '<div role="buton">x</div><a href="#">Menu</a>' });
    const report = selectChecks(makeReport([route], new Date('2026-11-19T00:00:00Z')), { only: ['aria', 'hrefs'], skip: [] });
    const sum = totals(report.routes);
    expect(sum.failed).toBe(1);
    expect(sum.unknown).toBeGreaterThanOrEqual(1);
  });
});

describe('CI output', () => {
  const report = () => {
    dom = installDom([{ tag: 'p', text: 'hello' }]);
    const route = auditSnapshot('/x', 320, { snapshot: snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: 100 }), html: SAMPLE_HREFS_HTML + SAMPLE_ARIA_HTML });
    return selectChecks(makeReport([route], new Date('2026-11-19T00:00:00Z')), { only: ['aria', 'hrefs'], skip: [] });
  };
  it('turns the new rules into SARIF with a level that follows the status', () => {
    const sarif = JSON.parse(renderSarif(report())) as { runs: { results: { ruleId: string; level: string }[] }[] };
    const results = sarif.runs[0]?.results ?? [];
    expect(results.find((r) => r.ruleId === 'hrefs/tel-format')?.level).toBe('error');
    expect(results.find((r) => r.ruleId === 'aria/unknown-role')?.level).toBe('error');
    expect(results.find((r) => r.ruleId === 'hrefs/placeholder-href')?.level).not.toBe('error');
  });
  it('writes them to JUnit as well', () => {
    const xml = renderJunit(report());
    expect(xml).toContain('tel-format');
    expect(xml).toContain('unknown-role');
  });
});

describe('selfAudit', () => {
  it('runs the markup checks on the live document and leaves it alone', () => {
    dom = installDom([{ tag: 'main', children: [{ tag: 'h1', text: 'Help' }, { tag: 'p', text: 'Opening hours are posted at the door.' }] }]);
    const before = dom.world.styleElements;
    const route = selfAudit(new Date('2026-11-19T12:00:00Z')).routes[0];
    expect(route?.checks.map((c) => c.check)).toEqual(expect.arrayContaining([...MINE]));
    expect(route?.entries.filter((e) => MINE.includes(e.check))).toEqual([]);
    expect(dom.world.styleElements).toBe(before);
  });
});

describe('the sample set', () => {
  const all = sampleEntries();
  const rulesOf = (check: CheckId): Set<string | undefined> => new Set(all.filter((e) => e.check === check).map((e) => e.rule));
  it('has an entry for each rule of the ten checks', () => {
    for (const r of ARIA_RULES) expect(rulesOf('aria').has(r), `aria ${r}`).toBe(true);
    for (const r of REFERENCE_RULES) expect(rulesOf('references').has(r), `references ${r}`).toBe(true);
    for (const r of HREF_RULES) expect(rulesOf('hrefs').has(r), `hrefs ${r}`).toBe(true);
    for (const r of CSS_RULE_IDS) expect(rulesOf('css').has(r), `css ${r}`).toBe(true);
    for (const r of OBSOLETE_RULES) expect(rulesOf('obsolete').has(r), `obsolete ${r}`).toBe(true);
    for (const r of STATE_RULES) expect(rulesOf('states').has(r), `states ${r}`).toBe(true);
    for (const r of LIST_RULES) expect(rulesOf('lists').has(r), `lists ${r}`).toBe(true);
    for (const r of SECTIONING_RULES) expect(rulesOf('sectioning').has(r), `sectioning ${r}`).toBe(true);
    for (const r of CONSTRAINT_RULES) expect(rulesOf('constraints').has(r), `constraints ${r}`).toBe(true);
    for (const r of SYMBOL_RULES) expect(rulesOf('symbols').has(r), `symbols ${r}`).toBe(true);
  });
  it('has clean French, and both languages differ', () => {
    noFrIssues(all.filter((e) => MINE.includes(e.check)));
  });
  it('uses none of the wording the App keeps out of user copy', () => {
    for (const e of all.filter((x) => MINE.includes(x.check))) {
      expect(scanCopy(e.message.en).map((h) => h.rule.id), `${e.check}/${e.rule} en`).toEqual([]);
      expect(scanCopy(e.message.fr).map((h) => h.rule.id), `${e.check}/${e.rule} fr`).toEqual([]);
      expect(`${e.message.en} ${e.message.fr}`, `${e.check}/${e.rule}`).not.toMatch(/verif|vérif/iu);
    }
  });
  it('gives every rule its own message', () => {
    const mine = all.filter((e) => MINE.includes(e.check));
    const byRule = new Map<string, string>();
    for (const e of mine) if (!byRule.has(`${e.check}/${e.rule}`)) byRule.set(`${e.check}/${e.rule}`, e.message.en);
    expect(new Set(byRule.values()).size).toBe(byRule.size);
  });
  it('ends every message with a full stop in both languages', () => {
    for (const e of all.filter((x) => MINE.includes(x.check))) {
      expect(e.message.en.trim().endsWith('.'), `${e.rule} en`).toBe(true);
      expect(e.message.fr.trim().endsWith('.'), `${e.rule} fr`).toBe(true);
    }
  });
});
