import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLineEndings, slug, readableLabel, headingFromLine, fenceFromLine,
  linksInLine, imagesInLine, isTableDivider, tableColumns,
  analyzeMarkdown, normalizeLinkDestination, decodeFragment,
} from './document-outline-parser.mjs';
const parse = body => analyzeMarkdown(body);
const heads = body => parse(body).headings;
const links = body => parse(body).links;
test('CRLF normalization protects line references', () => assert.equal(normalizeLineEndings('a\r\nb'), 'a\nb'));
test('lone CR normalization protects line references', () => assert.equal(normalizeLineEndings('a\rb'), 'a\nb'));
test('normal LF remains unchanged', () => assert.equal(normalizeLineEndings('a\nb'), 'a\nb'));
test('blank lines remain present', () => assert.equal(normalizeLineEndings('a\r\n\r\nb'), 'a\n\nb'));
for (const [input,expected] of [
  ['Introduction','introduction'], ['Two Words','two-words'], ['École et café','ecole-et-cafe'],
  ['A & B','a-b'], ['Section 1.2','section-12'], ['Spaces   And Tabs','spaces-and-tabs'],
  ['Café — café','cafe-cafe'], ['<em>Visible</em>','visible'], ['OpenAI?','openai'],
  ['Example: Work','example-work'], ['42!','42'], ['FR : étude','fr-etude'],
]) test(`heading slug ${JSON.stringify(input)}`, () => assert.equal(slug(input),expected));
test('identical input produces identical slug', () => assert.equal(slug('A B'),slug('A B')));
test('slash punctuation is not turned into path', () => assert.equal(slug('A/B'),'ab'));
test('no unsafe markup remains in slug', () => assert.ok(!slug('<script>x</script>').includes('<')));
for (const label of ['Here','here','click here','Read More','MORE','ici','Cliquez ici','En savoir plus','  ']) {
  test(`generic link label rejected ${JSON.stringify(label)}`, () => assert.equal(readableLabel(label),false));
}
for (const label of ['View the route notes','Consulter les détails','Contact support','Help centre','Page 2','UNKNOWN']) {
  test(`descriptive link label accepted ${JSON.stringify(label)}`, () => assert.equal(readableLabel(label),true));
}
for (let level = 1; level <= 6; level++) {
  test(`ATX heading level ${level}`, () => assert.equal(headingFromLine(`${'#'.repeat(level)} Section`).level,level));
}
test('ATX heading permits three spaces', () => assert.equal(headingFromLine('   ## Item').level,2));
test('ATX heading rejects four spaces', () => assert.equal(headingFromLine('    ## Item'),null));
test('ATX heading rejects seven markers', () => assert.equal(headingFromLine('####### Item'),null));
test('heading can be blank to surface an issue', () => assert.equal(headingFromLine('# ').text,''));
test('heading removes optional closing markers', () => assert.equal(headingFromLine('## Name ##').text,'Name'));
test('heading extracts normalized identifier', () => assert.equal(headingFromLine('### Name!').id,'name'));
test('prose is not accidentally a heading', () => assert.equal(headingFromLine('Write #notes here'),null));
test('code fence detects backticks', () => assert.deepEqual(fenceFromLine('```js'),{mark:'`',length:3,language:'js'}));
test('code fence detects tildes', () => assert.deepEqual(fenceFromLine('~~~ts'),{mark:'~',length:3,language:'ts'}));
test('code fence demands three markers', () => assert.equal(fenceFromLine('``js'),null));
test('code fence permits four', () => assert.equal(fenceFromLine('````').length,4));
test('link parser captures readable label', () => assert.equal(linksInLine('[Help page](help.md)')[0].label,'Help page'));
test('link parser captures internal fragment', () => assert.equal(linksInLine('[Details](#details)')[0].destination,'#details'));
test('link parser ignores image notation', () => assert.deepEqual(linksInLine('![Map](map.png)'), []));
test('link parser finds two separate links', () => assert.equal(linksInLine('[One](one.md) [Two](two.md)').length,2));
test('link parser records original offset', () => assert.equal(linksInLine('Text [One](one.md)')[0].offset,5));
test('link parser ignores plain URLs', () => assert.deepEqual(linksInLine('https://example.org'), []));
test('link parser handles bracketed labels containing punctuation', () => assert.equal(linksInLine('[Help!](help.md)')[0].label,'Help!'));
test('link parser handles angle-bracketed destinations', () => assert.equal(linksInLine('[Intro](<intro.md>)')[0].destination,'intro.md'));
test('link parser strips optional quoted titles', () => assert.equal(linksInLine('[Intro](intro.md "Title")')[0].destination,'intro.md'));
test('link parser handles destination with fragment', () => assert.equal(linksInLine('[Section](intro.md#details)')[0].destination,'intro.md#details'));
test('link parser ignores malformed link missing close', () => assert.equal(linksInLine('[Help](intro.md').length,0));
test('link parser does not consume following prose', () => assert.equal(linksInLine('[Help](intro.md) now').length,1));
test('image parser preserves empty alternative', () => assert.equal(imagesInLine('![](map.png)')[0].alt,''));
test('image parser captures meaningful alt', () => assert.equal(imagesInLine('![Entrance plan](plan.png)')[0].alt,'Entrance plan'));
test('image parser captures destination', () => assert.equal(imagesInLine('![Plan](plan.png)')[0].destination,'plan.png'));
test('image parser records two images', () => assert.equal(imagesInLine('![A](a.png) ![B](b.png)').length,2));
test('image parser ignores link-only notation', () => assert.equal(imagesInLine('[Help](help.md)').length,0));
test('image parser preserves text offsets', () => assert.equal(imagesInLine('Look ![A](a.png)')[0].offset,5));
test('table divider recognizes two columns', () => assert.equal(isTableDivider('| --- | --- |'),true));
test('table divider recognizes aligned columns', () => assert.equal(isTableDivider('| :--- | ---: |'),true));
test('table divider rejects prose', () => assert.equal(isTableDivider('--- description ---'),false));
test('table divider rejects an empty line', () => assert.equal(isTableDivider(''),false));
test('table columns count pipe cells', () => assert.equal(tableColumns('| A | B | C |'),3));
test('table columns handle unframed notation', () => assert.equal(tableColumns('A | B'),2));
test('table columns handle a lone header', () => assert.equal(tableColumns('Single'),1));
test('table with two columns appears once', () => assert.equal(parse('A | B\n--- | ---\na | b').tables.length,1));
test('table records divider width', () => assert.equal(parse('A | B\n--- | ---').tables[0].dividerColumns,2));
test('table records initial line', () => assert.equal(parse('Intro\n\nA | B\n--- | ---').tables[0].line,3));
test('plain text creates no table', () => assert.equal(parse('Just prose.').tables.length,0));
test('empty body has one logical line', () => assert.equal(parse('').lines,1));
test('CRLF document counts three lines', () => assert.equal(parse('# Title\r\n\r\nText').lines,3));
test('prose only has no headings', () => assert.deepEqual(heads('Just some prose'), []));
test('ATX heading records its line number', () => assert.equal(heads('\n\n# Intro')[0].line,3));
test('setext equals marks level one', () => assert.equal(heads('Title\n=====')[0].level,1));
test('setext dash marks level two', () => assert.equal(heads('Subtitle\n---')[0].level,2));
test('setext heading records style', () => assert.equal(heads('Title\n====')[0].style,'setext'));
test('setext heading carries first-line number', () => assert.equal(heads('\nTitle\n====')[0].line,2));
test('duplicate heading anchors receive numeric suffix', () => assert.deepEqual(heads('# A\n## A\n## A').map(h=>h.anchor),['a','a-1','a-2']));
test('two different headings have different anchors', () => assert.deepEqual(heads('# A\n## B').map(h=>h.anchor),['a','b']));
test('one empty heading yields an alert', () => assert.deepEqual(parse('# ').alerts.map(e=>e.code),['EMPTY_HEADING']));
test('unclosed code fence yields an alert', () => assert.deepEqual(parse('# Title\n```js\ncode').alerts.map(e=>e.code),['UNCLOSED_FENCE']));
test('closed code fence records range', () => assert.deepEqual(parse('```js\n# no heading\n```').fences.map(x=>[x.start,x.end]),[[1,3]]));
test('headings in code fences are not audited as headings', () => assert.equal(heads('```js\n# fake\n```').length,0));
test('links in code fences do not count', () => assert.equal(links('```\n[No](x.md)\n```').length,0));
test('images in code fences do not count', () => assert.equal(parse('```\n![No](x.png)\n```').images.length,0));
test('HTML comment hides headings', () => assert.equal(heads('<!--\n# hidden\n-->').length,0));
test('HTML comment hides inline links', () => assert.equal(links('<!-- [hidden](x.md) -->').length,0));
test('HTML comment does not hide following heading', () => assert.equal(heads('<!-- note -->\n# Visible').length,1));
test('closed fence retains code language', () => assert.equal(parse('```js\ncode\n```').fences[0].language,'js'));
test('unclosed fence start line is recorded', () => assert.equal(parse('\n```\nfoo').alerts[0].line,2));
test('four-marker fence requires matching length', () => assert.equal(parse('````\nfoo\n```').alerts[0].code,'UNCLOSED_FENCE'));
test('fence delimiter type must match', () => assert.equal(parse('~~~\nfoo\n```').alerts[0].code,'UNCLOSED_FENCE'));
test('closed tilde fence does not alert', () => assert.deepEqual(parse('~~~\n#code\n~~~').alerts,[]));
test('anchors are returned in lexical order', () => assert.deepEqual(parse('# Z\n# A').anchors,['a','z']));
test('same heading does not generate duplicate anchor', () => assert.equal(new Set(parse('# A\n# A').anchors).size,2));
test('relative link is classified as relative', () => assert.equal(normalizeLinkDestination('help.md').kind,'relative'));
test('fragment link is classified as fragment', () => assert.equal(normalizeLinkDestination('#heading').kind,'fragment'));
test('https link is external', () => assert.equal(normalizeLinkDestination('https://example.org').kind,'external'));
test('http link is flagged insecure', () => assert.equal(normalizeLinkDestination('http://example.org').insecure,true));
test('https link is not insecure', () => assert.equal(normalizeLinkDestination('https://example.org').insecure,false));
test('fragment is lowercased', () => assert.equal(decodeFragment('HeAdInG'),'heading'));
test('percent encoded fragment is decoded', () => assert.equal(decodeFragment('D%C3%A9tails'),'détails'));
test('invalid percent sequence does not throw', () => assert.equal(decodeFragment('%XX'),'%xx'));
test('relative link captures fragment separately', () => assert.deepEqual(normalizeLinkDestination('docs/help.md#detail'),{kind:'relative',target:'docs/help.md',fragment:'detail'}));
test('relative link permits no fragment', () => assert.equal(normalizeLinkDestination('docs/help.md').fragment,''));
test('external URL normalizes canonical path', () => assert.equal(normalizeLinkDestination('https://example.org').target,'https://example.org/'));
for(const value of ['javascript:alert(1)','data:text/html,abc','file:///etc/passwd','mailto:a@example.org','//example.org/a','/absolute.md','../outside.md','./inside.md','x\\y.md','', '#','https://user:password@example.org']){
  const expected = value === '#' ? 'fragment' : 'invalid';
  test(`suspicious destination ${JSON.stringify(value)} yields ${expected}`,()=>assert.equal(normalizeLinkDestination(value).kind,expected));
}
for(const value of ['docs/help.md','intro.md','guide_2.md','notes/2026-11.md']){
  test(`local Markdown destination ${value} is relative`,()=>assert.equal(normalizeLinkDestination(value).kind,'relative'));
}
test('local HTML path is not trusted', () => assert.equal(normalizeLinkDestination('help.html').kind,'invalid'));
test('remote URL credentials are not trusted', () => assert.equal(normalizeLinkDestination('https://a@site.example').kind,'invalid'));
test('document parser is deterministic', () => assert.deepEqual(parse('# A\n[Help](x.md)'),parse('# A\n[Help](x.md)')));
test('document parser does not mutate the original input', () => {const s='# A\n[Help](x.md)';parse(s);assert.equal(s,'# A\n[Help](x.md)');});
