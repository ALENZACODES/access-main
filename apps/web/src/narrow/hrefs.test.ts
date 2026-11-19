import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditHrefs, HREF_RULES, isPlaceholderHref, mailtoProblems, MIN_TEL_DIGITS, telProblem } from './hrefs.js';
import { SAMPLE_HREFS_HTML } from './samples.js';

const found = (html: string): string[] => auditHrefs(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('telProblem', () => {
  it.each(['tel:+14165550100', 'tel:416-555-0100', 'tel:(416)555-0100', 'tel:1.800.555.0100', 'tel:211', 'tel:911', 'tel:+1-416-555-0100;ext=22', 'TEL:4165550100', ' tel:4165550100 '])(
    '%s is well formed',
    (href) => {
      expect(telProblem(href)).toBeNull();
    },
  );
  it.each([
    ['tel:', 'empty'],
    ['tel:;ext=22', 'empty'],
    ['tel:416 555 0100', 'characters'],
    ['tel:416%20555%200100', 'characters'],
    ['tel:1-800-FLOWERS', 'characters'],
    ['tel:4165550100 ext 2', 'characters'],
    ['tel:416+5550100', 'plus'],
    ['tel:++14165550100', 'plus'],
    ['tel:12', 'short'],
    ['tel:+', 'short'],
  ] as const)('%s has the problem %s', (href, problem) => {
    expect(telProblem(href)).toBe(problem);
  });
  it('accepts three digit service numbers', () => {
    expect(MIN_TEL_DIGITS).toBe(3);
  });
});

describe('mailtoProblems', () => {
  it.each(['mailto:help@example.org', 'mailto:a@example.org,b@example.org', 'mailto:help@example.org?subject=Hours', 'mailto:first.last+tag@mail.example.co.uk', 'mailto:?subject=Hours', 'mailto:help%40example.org'])(
    '%s is well formed',
    (href) => {
      expect(mailtoProblems(href)).toEqual([]);
    },
  );
  it('returns the addresses that are not', () => {
    expect(mailtoProblems('mailto:')).toEqual(['']);
    expect(mailtoProblems('mailto:help')).toEqual(['help']);
    expect(mailtoProblems('mailto:help at example.org')).toEqual(['help at example.org']);
    expect(mailtoProblems('mailto:a@example.org,b@example')).toEqual(['b@example']);
    expect(mailtoProblems('mailto:a@@example.org')).toEqual(['a@@example.org']);
    expect(mailtoProblems('mailto:help@example.org.')).toEqual(['help@example.org.']);
  });
});

describe('isPlaceholderHref', () => {
  it('is true for an empty href and a lone hash only', () => {
    expect(isPlaceholderHref('')).toBe(true);
    expect(isPlaceholderHref(' # ')).toBe(true);
    expect(isPlaceholderHref('#a')).toBe(false);
    expect(isPlaceholderHref('/')).toBe(false);
  });
});

describe('phone and email links', () => {
  it('fails a phone link with spaces and shows the href', () => {
    const e = auditHrefs('<a href="tel:416 555 0100">Call the desk</a>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['tel-format', 'fail', 'a@L1']]);
    expect(e[0]?.message.en).toContain('“tel:416 555 0100”');
    expect(e[0]?.message.en).toContain('spaces, letters');
    expect(e[0]?.message.fr).toContain('des espaces, des lettres');
  });
  it('gives a different reason for each phone problem', () => {
    const reasons = ['tel:', 'tel:416 555', 'tel:41+6555', 'tel:41'].map((h) => auditHrefs(`<a href="${h}">Call</a>`).entries[0]?.message.en ?? '');
    expect(new Set(reasons).size).toBe(4);
    expect(reasons[0]).toContain('holds no number');
    expect(reasons[2]).toContain('plus sign');
    expect(reasons[3]).toContain('fewer than 3 digits');
  });
  it('passes good phone links', () => {
    expect(found('<a href="tel:+14165550100">Call</a><a href="tel:211">211</a>')).toEqual([]);
  });
  it('fails an email link with a broken or missing address', () => {
    const e = auditHrefs('<a href="mailto:help at example.org">Email us</a>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['mailto-format:fail']);
    expect(e[0]?.message.en).toContain('“help at example.org”');
    const none = auditHrefs('<a href="mailto:">Email us</a>').entries[0];
    expect(none?.rule).toBe('mailto-format');
    expect(none?.message.en).toContain('no address');
    expect(none?.message.fr).toContain('aucune adresse');
  });
  it('passes good email links and one with no recipient', () => {
    expect(found('<a href="mailto:help@example.org?subject=Hi">Email</a><a href="mailto:?subject=Hi">Share</a>')).toEqual([]);
  });
});

describe('links that are not links', () => {
  it('asks about a script in the href, in any case', () => {
    expect(found('<a href="javascript:void(0)">Open</a>')).toEqual(['script-href:unknown']);
    expect(found('<a href=" JavaScript:open()">Open</a>')).toEqual(['script-href:unknown']);
  });
  it('asks about an empty href and a lone hash, and says which', () => {
    const e = auditHrefs('<a href="#">Menu</a>\n<a href="">More</a>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['placeholder-href:unknown', 'placeholder-href:unknown']);
    expect(e[0]?.message.en).toContain('an href of #');
    expect(e[1]?.message.en).toContain('an empty href');
    expect(e[1]?.message.fr).toContain('un href vide');
  });
  it('asks about an anchor with words and no href', () => {
    const e = auditHrefs('<a>Details</a>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['no-href:unknown']);
    expect(e[0]?.message.en).toContain('“Details”');
  });
  it('leaves named anchors, current-page and disabled links, roles and inline handlers alone', () => {
    expect(found('<a id="hours"></a><a name="top"></a>')).toEqual([]);
    expect(found('<a aria-current="page">Home</a>')).toEqual([]);
    expect(found('<a role="link" aria-disabled="true">Next</a>')).toEqual([]);
    expect(found('<a role="button" tabindex="0">Open</a>')).toEqual([]);
    expect(found('<a onclick="go()">Go</a>')).toEqual([]);
  });
  it('passes ordinary links', () => {
    expect(found('<a href="/map">Map</a><a href="https://example.org/a b">Site</a><a href="#hours">Hours</a><a href="sms:+14165550100">Text</a>')).toEqual([]);
  });
  it('skips links hidden from everyone or from assistive technology', () => {
    expect(auditHrefs('<div hidden><a href="#">Menu</a></div><div aria-hidden="true"><a href="tel:1">x</a></div>')).toEqual({ checked: 0, entries: [] });
  });
});

describe('two links to one place', () => {
  it('asks when an image link sits next to a text link to the same place', () => {
    const e = auditHrefs('<p><a href="/map"><img src="m.png" alt=""></a>\n<a href="/map">Map</a></p>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['adjacent-duplicate', 'unknown', 'a@L2']]);
    expect(e[0]?.message.en).toContain('“/map”');
  });
  it('works with the text link first and with an svg', () => {
    expect(found('<p><a href="/map">Map</a><a href="/map"><svg aria-hidden="true"></svg></a></p>')).toEqual(['adjacent-duplicate:unknown']);
  });
  it('does not ask for two text links, two image links, different places or links apart', () => {
    expect(found('<p><a href="/map">Map</a><a href="/map">Open the map</a></p>')).toEqual([]);
    expect(found('<p><a href="/a"><img src="a.png" alt="A"></a><a href="/a"><img src="b.png" alt="B"></a></p>')).toEqual([]);
    expect(found('<p><a href="/a"><img src="a.png" alt=""></a><a href="/b">Map</a></p>')).toEqual([]);
    expect(found('<p><a href="/map"><img src="a.png" alt=""></a><span>or</span><a href="/map">Map</a></p>')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts every visible anchor and area', () => {
    expect(auditHrefs('<a href="/a">a</a><a>b</a><map name="m"><area href="/c" alt="c"></map><p>d</p>').checked).toBe(3);
  });
  it('keeps the order of the file', () => {
    const e = auditHrefs('<a href="#">a</a>\n<a href="tel:1">b</a>\n<a href="javascript:x()">c</a>').entries;
    expect(e.map((x) => x.rule)).toEqual(['placeholder-href', 'tel-format', 'script-href']);
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditHrefs(SAMPLE_HREFS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...HREF_RULES].sort());
    noFrIssues(e);
  });
  it('fails only what it measured', () => {
    for (const e of auditHrefs(SAMPLE_HREFS_HTML).entries) {
      expect(e.status, e.rule).toBe(e.rule === 'tel-format' || e.rule === 'mailto-format' ? 'fail' : 'unknown');
    }
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<a href=', '<a href="tel:%E0%A4%A">x</a>', '<a href="mailto:%">x</a>', '<a><a><a>']) expect(() => auditHrefs(html)).not.toThrow();
  });
});
