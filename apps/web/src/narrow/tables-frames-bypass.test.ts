import { describe, expect, it } from 'vitest';
import { auditBypass, BYPASS_RULES, LONG_RUN } from './bypass.js';
import { auditFrames, FRAME_RULES, isWeakTitle } from './frames.js';
import { noFrIssues } from './expect-fr.js';
import { auditTables, isDataTable, TABLE_RULES } from './tables.js';
import type { BypassFacts, FrameFact, TableFact } from './structure.js';
import type { Entry } from './types.js';

const rules = (es: readonly Entry[]): string[] => es.map((e) => `${e.rule}:${e.status}`);

const table = (over: Partial<TableFact> = {}): TableFact => ({
  id: 'table[0]',
  rows: 3,
  cols: 3,
  headers: 3,
  emptyHeaders: 0,
  caption: true,
  named: true,
  role: '',
  scoped: 3,
  spans: false,
  nested: false,
  ...over,
});

describe('auditTables', () => {
  it('passes a named table with scoped headers', () => {
    expect(auditTables([table()])).toEqual({ checked: 1, entries: [] });
  });
  it('does not look at a table with one row or one column', () => {
    expect(auditTables([table({ rows: 1 }), table({ id: 'table[1]', cols: 1 })])).toEqual({ checked: 0, entries: [] });
  });
  it('does not report a table with no header cells or no name, which the markup check owns', () => {
    expect(auditTables([table({ headers: 0, scoped: 0 }), table({ id: 'table[1]', named: false, caption: false })]).entries).toEqual([]);
    expect(TABLE_RULES).not.toContain('no-headers');
  });
  it('fails an empty header cell', () => {
    const r = auditTables([table({ emptyHeaders: 2 })]);
    expect(rules(r.entries)).toEqual(['empty-header:fail']);
    expect(r.entries[0]?.message.en).toContain('2 header cells');
    expect(r.entries[0]?.message.fr).toContain('2 cellules');
    noFrIssues(r.entries);
  });
  it('says header cell, singular, for one empty header', () => {
    const r = auditTables([table({ emptyHeaders: 1 })]);
    expect(r.entries[0]?.message.en).toContain('1 header cell with');
    expect(r.entries[0]?.message.fr).toContain('1 cellule d’en-tête sans');
  });
  it('a table of only empty headers is reported as empty', () => {
    expect(rules(auditTables([table({ headers: 0, emptyHeaders: 3, scoped: 0 })]).entries)).toEqual(['empty-header:fail']);
  });
  it('fails a layout table that holds header cells, and passes one that does not', () => {
    expect(rules(auditTables([table({ role: 'presentation' })]).entries)).toEqual(['layout-headers:fail']);
    expect(rules(auditTables([table({ role: 'none', headers: 0, emptyHeaders: 1 })]).entries)).toEqual(['layout-headers:fail']);
    expect(auditTables([table({ role: 'presentation', headers: 0, scoped: 0 })])).toEqual({ checked: 1, entries: [] });
  });
  it('asks about merged cells with no scope or id on the headers', () => {
    expect(rules(auditTables([table({ spans: true, scoped: 0 })]).entries)).toEqual(['complex-headers:unknown']);
    expect(auditTables([table({ spans: true, scoped: 1 })]).entries).toEqual([]);
    expect(auditTables([table({ spans: false, scoped: 0 })]).entries).toEqual([]);
  });
  it('asks about a table inside a table', () => {
    const r = auditTables([table({ nested: true })]);
    expect(rules(r.entries)).toEqual(['nested:unknown']);
    noFrIssues(r.entries);
  });
  it('reports every rule at once for one bad table, in a fixed order', () => {
    const r = auditTables([table({ emptyHeaders: 1, spans: true, scoped: 0, nested: true })]);
    expect(rules(r.entries)).toEqual(['empty-header:fail', 'complex-headers:unknown', 'nested:unknown']);
  });
  it('isDataTable needs two rows, two columns and no layout role', () => {
    expect(isDataTable(table())).toBe(true);
    expect(isDataTable(table({ rows: 1 }))).toBe(false);
    expect(isDataTable(table({ cols: 1 }))).toBe(false);
    expect(isDataTable(table({ role: 'presentation' }))).toBe(false);
    expect(isDataTable(table({ role: 'grid' }))).toBe(true);
  });
  it('produces every listed rule and nothing else', () => {
    const r = auditTables([table({ id: 'a', emptyHeaders: 1, spans: true, scoped: 0, nested: true }), table({ id: 'c', role: 'presentation' })]);
    const seen = new Set(r.entries.map((e) => e.rule));
    for (const rule of TABLE_RULES) expect(seen.has(rule), rule).toBe(true);
    for (const e of r.entries) expect(TABLE_RULES).toContain(e.rule);
  });
});

const frame = (over: Partial<FrameFact> = {}): FrameFact => ({
  id: 'iframe[0]',
  tag: 'iframe',
  name: 'Route map',
  role: '',
  decorative: false,
  fallback: false,
  host: '',
  ...over,
});

describe('isWeakTitle', () => {
  it('flags generic words in both languages and a title that is only the host', () => {
    for (const w of ['iframe', 'Frame', 'Untitled', 'contenu', 'Sans titre', ' widget ']) expect(isWeakTitle(w, ''), w).toBe(true);
    expect(isWeakTitle('maps.example.org', 'maps.example.org')).toBe(true);
    expect(isWeakTitle('www.maps.example.org', 'maps.example.org')).toBe(true);
  });
  it('accepts a title about the content and never flags an empty title here', () => {
    expect(isWeakTitle('Route map of the campus', 'maps.example.org')).toBe(false);
    expect(isWeakTitle('', '')).toBe(false);
  });
});

describe('auditFrames', () => {
  it('passes a titled frame and counts it', () => {
    expect(auditFrames([frame()])).toEqual({ checked: 1, entries: [] });
  });
  it('asks about a generic title, and leaves a missing title to the markup check', () => {
    const weak = auditFrames([frame({ name: 'iframe' })]);
    expect(rules(weak.entries)).toEqual(['frame-title-weak:unknown']);
    expect(weak.entries[0]?.message.en).toContain('“iframe”');
    noFrIssues(weak.entries);
    expect(auditFrames([frame({ name: '' })]).entries).toEqual([]);
  });
  it('skips decorative embeds and does not count them', () => {
    expect(auditFrames([frame({ name: '', decorative: true }), frame({ id: 'canvas[0]', tag: 'canvas', name: '', decorative: true })])).toEqual({ checked: 0, entries: [] });
  });
  it('asks about a canvas with no name and no text, and passes one with either', () => {
    expect(rules(auditFrames([frame({ id: 'canvas[0]', tag: 'canvas', name: '' })]).entries)).toEqual(['canvas-fallback:unknown']);
    expect(auditFrames([frame({ id: 'canvas[1]', tag: 'canvas', name: '', fallback: true })]).entries).toEqual([]);
    expect(auditFrames([frame({ id: 'canvas[2]', tag: 'canvas', name: 'Chart' })]).entries).toEqual([]);
  });
  it('asks about an object or embed with no name and no text', () => {
    const r = auditFrames([frame({ id: 'object[0]', tag: 'object', name: '' }), frame({ id: 'embed[0]', tag: 'embed', name: '', fallback: true })]);
    expect(rules(r.entries)).toEqual(['object-fallback:unknown']);
    noFrIssues(r.entries);
  });
  it('produces every listed rule and nothing else', () => {
    const r = auditFrames([frame({ id: 'b', name: 'frame' }), frame({ id: 'd', tag: 'canvas', name: '' }), frame({ id: 'e', tag: 'object', name: '' })]);
    const seen = new Set(r.entries.map((e) => e.rule));
    for (const rule of FRAME_RULES) expect(seen.has(rule), rule).toBe(true);
    for (const e of r.entries) expect(FRAME_RULES).toContain(e.rule);
  });
});

const good: BypassFacts = { mains: 1, h1: ['h1[0]'], controlsBeforeMain: 4, skip: { id: 'a[0]', first: true, targetFound: true } };

describe('auditBypass', () => {
  it('passes a page with a working first skip link and one top heading', () => {
    expect(auditBypass(good)).toEqual({ checked: 2, entries: [] });
  });
  it('fails a skip link that points nowhere, without also asking about its place', () => {
    const r = auditBypass({ ...good, skip: { id: 'a[0]', first: false, targetFound: false } });
    expect(rules(r.entries)).toEqual(['skip-target-missing:fail']);
    noFrIssues(r.entries);
  });
  it('asks about a skip link that is not the first control', () => {
    const r = auditBypass({ ...good, skip: { id: 'a[2]', first: false, targetFound: true } });
    expect(rules(r.entries)).toEqual(['skip-not-first:unknown']);
    expect(r.entries[0]?.id).toBe('a[2]');
    noFrIssues(r.entries);
  });
  it('asks about a long run of controls before the content when there is no skip link', () => {
    const r = auditBypass({ ...good, skip: null, controlsBeforeMain: LONG_RUN });
    expect(rules(r.entries)).toEqual(['no-skip-long-run:unknown']);
    expect(r.entries[0]?.message.en).toContain(`${LONG_RUN} links or buttons`);
    noFrIssues(r.entries);
  });
  it('does not ask below the limit, with a skip link, or on a page with no main', () => {
    expect(auditBypass({ ...good, skip: null, controlsBeforeMain: LONG_RUN - 1 }).entries).toEqual([]);
    expect(auditBypass({ ...good, controlsBeforeMain: 50 }).entries).toEqual([]);
    expect(auditBypass({ ...good, mains: 0, skip: null, controlsBeforeMain: 50 }).entries).toEqual([]);
  });
  it('asks about more than one top heading, and names the second', () => {
    const r = auditBypass({ ...good, h1: ['h1[0]', 'h1[1]', 'h1[2]'] });
    expect(rules(r.entries)).toEqual(['many-h1:unknown']);
    expect(r.entries[0]?.id).toBe('h1[1]');
    expect(r.entries[0]?.message.en).toContain('3 headings');
    noFrIssues(r.entries);
  });
  it('leaves main, h1 and heading order to the markup check', () => {
    expect(auditBypass({ mains: 0, h1: [], controlsBeforeMain: 0, skip: null }).entries).toEqual([]);
  });
  it('produces every listed rule and nothing else', () => {
    const entries = [
      ...auditBypass({ ...good, skip: { id: 's', first: false, targetFound: false }, h1: ['a', 'b'] }).entries,
      ...auditBypass({ ...good, skip: { id: 's', first: false, targetFound: true } }).entries,
      ...auditBypass({ ...good, skip: null, controlsBeforeMain: 20 }).entries,
    ];
    const seen = new Set(entries.map((e) => e.rule));
    for (const rule of BYPASS_RULES) expect(seen.has(rule), rule).toBe(true);
    for (const e of entries) expect(BYPASS_RULES).toContain(e.rule);
  });
});
