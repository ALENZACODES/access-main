import { describe, expect, it } from 'vitest';
import { ALT_LONG, auditImages, hasPrefix, IMAGE_RULES, isFilename } from './images.js';
import { auditLinks, LINK_RULES, looksLikeUrl, targetKey, URL_TEXT_MIN } from './links.js';
import { noFrIssues } from './expect-fr.js';
import type { AnchorFact, PictureFact } from './structure.js';
import type { Entry } from './types.js';

const rules = (es: readonly Entry[]): string[] => es.map((e) => `${e.rule}:${e.status}`);

const link = (over: Partial<AnchorFact> = {}): AnchorFact => ({
  id: 'a[0]',
  name: 'Opening hours',
  href: '/hours',
  newTab: false,
  announcesNewTab: false,
  file: null,
  announcesFile: false,
  ...over,
});

describe('targetKey and looksLikeUrl', () => {
  it('ignores the fragment, a trailing slash and case', () => {
    expect(targetKey('/Hours/#top')).toBe('/hours');
    expect(targetKey(' /hours/// ')).toBe('/hours');
    expect(targetKey('https://X.org/a#b')).toBe('https://x.org/a');
  });
  it('recognises a web address and not a phrase', () => {
    expect(looksLikeUrl('https://example.org/page')).toBe(true);
    expect(looksLikeUrl('www.example.org')).toBe(true);
    expect(looksLikeUrl('Visit www.example.org today')).toBe(false);
    expect(looksLikeUrl('Opening hours')).toBe(false);
  });
});

describe('auditLinks', () => {
  it('passes clear links and counts every one', () => {
    expect(auditLinks([link(), link({ id: 'a[1]', name: 'Contact', href: '/contact' })])).toEqual({ checked: 2, entries: [] });
  });
  it('asks about two links with one name that go to different places, once per name', () => {
    const r = auditLinks([link({ name: 'Details', href: '/a' }), link({ id: 'a[1]', name: 'details ', href: '/b' }), link({ id: 'a[2]', name: 'Details', href: '/c' })]);
    expect(rules(r.entries)).toEqual(['same-name-different-target:unknown']);
    expect(r.entries[0]?.id).toBe('a[0]');
    expect(r.entries[0]?.message.en).toContain('3 links');
    expect(r.entries[0]?.message.en).toContain('3 different places');
    expect(r.entries[0]?.message.fr).toContain('3 liens');
    noFrIssues(r.entries);
  });
  it('does not ask when the same name goes to the same place, even with a fragment or a slash', () => {
    expect(auditLinks([link({ name: 'Hours', href: '/h' }), link({ id: 'a[1]', name: 'Hours', href: '/h/#x' })]).entries).toEqual([]);
  });
  it('ignores in-page links, empty names and address names when it compares names', () => {
    expect(auditLinks([link({ name: 'Top', href: '#a' }), link({ id: 'a[1]', name: 'Top', href: '#b' }), link({ id: 'a[2]', name: '', href: '/x' }), link({ id: 'a[3]', name: '', href: '/y' })]).entries).toEqual([]);
  });
  it('asks about a new tab with no warning, and passes one that says it', () => {
    const r = auditLinks([link({ newTab: true }), link({ id: 'a[1]', newTab: true, announcesNewTab: true })]);
    expect(rules(r.entries)).toEqual(['new-tab-unannounced:unknown']);
    expect(r.entries[0]?.id).toBe('a[0]');
    noFrIssues(r.entries);
  });
  it('asks about a long address used as the link text, and not a short one', () => {
    const long = 'https://example.org/a/very/long/address/for/a/page';
    expect(long.length).toBeGreaterThanOrEqual(URL_TEXT_MIN);
    expect(rules(auditLinks([link({ name: long, href: '/x' })]).entries)).toEqual(['url-as-text:unknown']);
    expect(auditLinks([link({ name: 'https://x.org', href: '/x' })]).entries).toEqual([]);
  });
  it('asks about a link to a file that does not say so, and names the kind', () => {
    const r = auditLinks([link({ name: 'Annual report', href: '/r.pdf', file: 'pdf' }), link({ id: 'a[1]', name: 'Annual report (PDF)', href: '/r2.pdf', file: 'pdf', announcesFile: true }), link({ id: 'a[2]', name: 'Form', href: '/f', file: 'file' })]);
    expect(rules(r.entries)).toEqual(['file-unannounced:unknown', 'file-unannounced:unknown']);
    expect(r.entries[0]?.message.en).toContain('PDF file');
    expect(r.entries[0]?.message.fr).toContain('fichier PDF');
    expect(r.entries[1]?.message.en).toContain('a file and');
    noFrIssues(r.entries);
  });
  it('never fails a link, only asks', () => {
    const r = auditLinks([link({ newTab: true, file: 'pdf', name: 'https://example.org/a/very/long/address/for/a/page' })]);
    expect(r.entries.length).toBe(3);
    expect(r.entries.every((e) => e.status === 'unknown')).toBe(true);
  });
  it('produces every listed rule and nothing else', () => {
    const r = auditLinks([link({ name: 'Go', href: '/a', newTab: true, file: 'pdf' }), link({ id: 'a[1]', name: 'Go', href: '/b' }), link({ id: 'a[2]', name: 'https://example.org/a/very/long/address/for/a/page', href: '/c' })]);
    const seen = new Set(r.entries.map((e) => e.rule));
    for (const rule of LINK_RULES) expect(seen.has(rule), rule).toBe(true);
    for (const e of r.entries) expect(LINK_RULES).toContain(e.rule);
  });
});

const img = (over: Partial<PictureFact> = {}): PictureFact => ({ id: 'img[0]', alt: 'A step-free entrance', broken: false, linkText: '', ...over });

describe('isFilename and hasPrefix', () => {
  it('recognises file names and camera names', () => {
    for (const a of ['photo.jpg', 'logo.SVG', 'IMG_1234', 'DSC0042', 'screenshot 2026', 'capture-12', 'x.webp']) expect(isFilename(a), a).toBe(true);
    for (const a of ['Step-free entrance', 'Photo of the entrance', 'Image 1 of the plan', 'jpg files explained']) expect(isFilename(a), a).toBe(false);
  });
  it('recognises “image of” in English and French', () => {
    for (const a of ['Image of a ramp', 'a photo of the door', 'Picture showing stairs', 'Image de la rampe', 'Une photo du hall', 'Capture d’écran du plan', 'Illustration montrant une porte']) expect(hasPrefix(a), a).toBe(true);
    for (const a of ['A ramp at the main door', 'Imagery of care', 'Rampe d’accès']) expect(hasPrefix(a), a).toBe(false);
  });
});

describe('auditImages', () => {
  it('passes an image with a good alt and counts it', () => {
    expect(auditImages([img(), img({ id: 'img[1]', alt: '' }), img({ id: 'img[2]', alt: null })])).toEqual({ checked: 3, entries: [] });
  });
  it('fails an image that did not load, even with an empty alt', () => {
    const r = auditImages([img({ broken: true }), img({ id: 'img[1]', broken: true, alt: '' }), img({ id: 'img[2]', broken: true, alt: null })]);
    expect(rules(r.entries)).toEqual(['broken:fail', 'broken:fail', 'broken:fail']);
    noFrIssues(r.entries);
  });
  it('fails an alt that is a file name, and does not also ask about it', () => {
    const r = auditImages([img({ alt: 'IMG_1234.jpg' })]);
    expect(rules(r.entries)).toEqual(['alt-filename:fail']);
    noFrIssues(r.entries);
  });
  it('asks about a generic alt in English and French', () => {
    const r = auditImages([img({ alt: 'Image' }), img({ id: 'img[1]', alt: ' Photographie ' }), img({ id: 'img[2]', alt: 'logo' })]);
    expect(rules(r.entries)).toEqual(['alt-generic:unknown', 'alt-generic:unknown', 'alt-generic:unknown']);
    noFrIssues(r.entries);
  });
  it('asks about an alt that starts by naming the kind of picture', () => {
    const r = auditImages([img({ alt: 'Image of a ramp' }), img({ id: 'img[1]', alt: 'Une photo du hall' })]);
    expect(rules(r.entries)).toEqual(['alt-prefix:unknown', 'alt-prefix:unknown']);
    noFrIssues(r.entries);
  });
  it('asks about an alt that repeats the text of the link around it', () => {
    const r = auditImages([img({ alt: 'Opening hours', linkText: ' opening  hours ' }), img({ id: 'img[1]', alt: 'Opening hours', linkText: 'Contact' })]);
    expect(rules(r.entries)).toEqual(['alt-redundant:unknown']);
    expect(r.entries[0]?.id).toBe('img[0]');
    noFrIssues(r.entries);
  });
  it('asks about a very long alt, and not one at the limit', () => {
    expect(rules(auditImages([img({ alt: 'x'.repeat(ALT_LONG + 1) })]).entries)).toEqual(['alt-long:unknown']);
    expect(auditImages([img({ alt: 'x'.repeat(ALT_LONG) })]).entries).toEqual([]);
    noFrIssues(auditImages([img({ alt: 'x'.repeat(ALT_LONG + 1) })]).entries);
  });
  it('reports a broken image and its bad alt together', () => {
    expect(rules(auditImages([img({ broken: true, alt: 'photo.png' })]).entries)).toEqual(['broken:fail', 'alt-filename:fail']);
  });
  it('leaves a missing alt to the markup check', () => {
    expect(auditImages([img({ alt: null })]).entries).toEqual([]);
    expect(IMAGE_RULES).not.toContain('no-alt');
  });
  it('produces every listed rule and nothing else', () => {
    const r = auditImages([
      img({ broken: true, alt: 'a.png' }),
      img({ id: 'b', alt: 'image' }),
      img({ id: 'c', alt: 'Photo of a ramp' }),
      img({ id: 'd', alt: 'Hours', linkText: 'Hours' }),
      img({ id: 'e', alt: 'y'.repeat(200) }),
    ]);
    const seen = new Set(r.entries.map((e) => e.rule));
    for (const rule of IMAGE_RULES) expect(seen.has(rule), rule).toBe(true);
    for (const e of r.entries) expect(IMAGE_RULES).toContain(e.rule);
  });
});
