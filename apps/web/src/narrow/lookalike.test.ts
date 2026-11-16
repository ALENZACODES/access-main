import { describe, expect, it } from 'vitest';
import { auditLookalike, LOOKALIKE_RULES, MAX_FAKE_HEADING_WORDS } from './lookalike.js';
import { noFrIssues } from './expect-fr.js';

const rules = (html: string): string[] => auditLookalike(html).entries.map((e) => `${e.rule}`);

describe('fake-heading', () => {
  it('flags a paragraph that holds only a short bold line', () => {
    expect(rules('<p><strong>Getting here</strong></p>')).toEqual(['fake-heading']);
    expect(rules('<div><b>Opening hours</b></div>')).toEqual(['fake-heading']);
  });
  it('does not flag bold inside running text', () => {
    expect(rules('<p>Please <strong>call first</strong> before you come.</p>')).toEqual([]);
  });
  it('does not flag a bold sentence or one ending in punctuation', () => {
    expect(rules('<p><strong>Call us today.</strong></p>')).toEqual([]);
    expect(rules('<p><strong>Are you coming?</strong></p>')).toEqual([]);
  });
  it('does not flag a long bold line', () => {
    const words = Array.from({ length: MAX_FAKE_HEADING_WORDS + 1 }, (_, i) => `w${i}`).join(' ');
    expect(rules(`<p><strong>${words}</strong></p>`)).toEqual([]);
    const ok = Array.from({ length: MAX_FAKE_HEADING_WORDS }, (_, i) => `w${i}`).join(' ');
    expect(rules(`<p><strong>${ok}</strong></p>`)).toEqual(['fake-heading']);
  });
  it('does not flag bold in a label, a button, a cell or a real heading', () => {
    for (const p of ['label', 'button', 'td', 'li', 'h2', 'summary']) {
      expect(rules(`<${p}><p><strong>Name</strong></p></${p}>`), p).toEqual([]);
    }
  });
  it('does not flag a paragraph with text beside the bold', () => {
    expect(rules('<p>Note <strong>Hours</strong></p>')).toEqual([]);
  });
});

describe('fake-list', () => {
  it('flags three paragraphs that start with bullets', () => {
    expect(rules('<div><p>• Ramp</p><p>• Lift</p><p>• Stairs</p></div>')).toEqual(['fake-list']);
  });
  it('flags numbered lines and dashes', () => {
    expect(rules('<div><p>1. One</p><p>2. Two</p><p>3. Three</p></div>')).toEqual(['fake-list']);
    expect(rules('<div><div>- a b</div><div>- c d</div><div>- e f</div></div>')).toEqual(['fake-list']);
  });
  it('does not flag two lines', () => {
    expect(rules('<div><p>• Ramp</p><p>• Lift</p></div>')).toEqual([]);
  });
  it('does not flag a run that a normal paragraph breaks', () => {
    expect(rules('<div><p>• a b</p><p>• c d</p><p>Plain text</p><p>• e f</p></div>')).toEqual([]);
  });
  it('flags one paragraph that lists with bullets and line breaks', () => {
    expect(rules('<p>• Ramp<br>• Lift<br>• Stairs<br>• Door</p>')).toEqual(['fake-list']);
  });
  it('does not flag a real list', () => {
    expect(rules('<ul><li>Ramp</li><li>Lift</li><li>Stairs</li></ul>')).toEqual([]);
  });
  it('reports a run once', () => {
    expect(rules('<div><p>• a b</p><p>• c d</p><p>• e f</p><p>• g h</p></div>')).toHaveLength(1);
  });
  it('says how many lines there were', () => {
    const e = auditLookalike('<div><p>• a b</p><p>• c d</p><p>• e f</p><p>• g h</p></div>').entries[0]!;
    expect(e.message.en).toContain('4 paragraphs');
    expect(e.message.fr).toContain('4 paragraphes');
  });
});

describe('empty-paragraph', () => {
  it('flags an empty paragraph', () => {
    expect(rules('<main><p></p></main>')).toEqual(['empty-paragraph']);
  });
  it('flags a paragraph with only a non-breaking space', () => {
    expect(rules('<main><p>&nbsp;</p></main>')).toEqual(['empty-paragraph']);
  });
  it('does not flag an empty div, which is often a mount point', () => {
    expect(rules('<div id="root"></div>')).toEqual([]);
  });
  it('does not flag a paragraph with an image', () => {
    expect(rules('<p><img src="a.png" alt="A"></p>')).toEqual([]);
  });
});

describe('results', () => {
  it('has every finding UNKNOWN, labelled and in clean French', () => {
    const r = auditLookalike('<main><p><strong>Getting here</strong></p><p>• a b</p><p>• c d</p><p>• e f</p><p></p></main>');
    expect(new Set(r.entries.map((e) => e.rule))).toEqual(new Set(LOOKALIKE_RULES));
    for (const e of r.entries) {
      expect(e.status).toBe('unknown');
      expect(e.check).toBe('lookalike');
      expect(e.id).toMatch(/@L\d+$/);
    }
    noFrIssues(r.entries);
  });
  it('counts the blocks it looked at', () => {
    expect(auditLookalike('<p>a</p><p>b</p><div>c</div>').checked).toBe(3);
  });
  it('is clean on empty markup', () => {
    expect(auditLookalike('')).toEqual({ checked: 0, entries: [] });
  });
});
