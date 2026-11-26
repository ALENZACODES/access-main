/** Source-only bilingual documentation coverage and editorial workload, not a readability or accuracy score. */
import { UNKNOWN, validateManifest, lexical } from './document-outline-contract.mjs';
import { analyzeMarkdown, normalizeLinkDestination } from './document-outline-parser.mjs';
const sorted = rows => rows.sort((a,b)=>lexical(a.pairId??a.id,b.pairId??b.id));
export function documentMetrics(document) {
  const parsed = analyzeMarkdown(document.body);
  const prose = document.body.split('\n').filter(line => !/^\s*(?:#|>|\||```|~~~|<!--)/u.test(line)).join(' ');
  const words = prose.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const paragraphs = document.body.split(/\n\s*\n/gu).map(p=>p.trim()).filter(Boolean);
  return { id: document.id, language: document.language, path: document.path, pairId: document.pairId ?? UNKNOWN,
    headings: parsed.headings.length, links: parsed.links.length, images: parsed.images.length,
    tables: parsed.tables.length, fencedCode: parsed.fences.length, paragraphs: paragraphs.length,
    approximateWords: words.length, source: document.source, licence: document.licence,
    retrievedOn: document.retrievedOn, tier: document.tier, state: document.state };
}
export function groupsByPair(documents) {
  const map = new Map();
  for (const doc of documents) {
    const key = doc.pairId ?? doc.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(doc);
  }
  return map;
}
export function languageCoverage(documents) {
  const records = [...groupsByPair(documents)].map(([pairId,group])=>{
    const en=group.filter(d=>d.language==='en'),fr=group.filter(d=>d.language==='fr');
    return { pairId, english:en.map(d=>d.id).sort(lexical), french:fr.map(d=>d.id).sort(lexical),
      coverage: en.length===1 && fr.length===1 ? 'paired' : en.length===0 || fr.length===0 ? 'missing-language' : 'duplicate-language' };
  });
  return sorted(records);
}
export function translationOutlineDrift(documents) {
  const rows = [];
  for (const row of languageCoverage(documents)) {
    if (row.coverage !== 'paired') continue;
    const en=documents.find(d=>d.id===row.english[0]),fr=documents.find(d=>d.id===row.french[0]);
    const a=analyzeMarkdown(en.body),b=analyzeMarkdown(fr.body);
    const left=a.headings.map(h=>h.level),right=b.headings.map(h=>h.level);
    const drift=left.length!==right.length || left.some((level,i)=>level!==right[i]);
    rows.push({ pairId:row.pairId, english:en.id, french:fr.id,
      englishOutline:left, frenchOutline:right, status:drift?'review':'structurally-aligned' });
  }
  return sorted(rows);
}
export function localizedLinks(documents) {
  const byPath = new Map(documents.map(d=>[d.path,d]));
  const rows = [];
  for (const doc of documents) {
    for (const link of analyzeMarkdown(doc.body).links) {
      const dest=normalizeLinkDestination(link.destination);
      if (dest.kind!=='relative') continue;
      const target=byPath.get(dest.target);
      if (!target) continue;
      if (doc.language !== target.language) rows.push({ from:doc.id, to:target.id,
        sourceLanguage:doc.language, targetLanguage:target.language, line:link.line,
        status:'cross-language-link', note:UNKNOWN });
    }
  }
  return rows.sort((a,b)=>lexical(a.from,b.from)||a.line-b.line);
}
export function coverageReview(manifest, { today='2026-11-21' }={}) {
  const validated=validateManifest(manifest,{today});
  if(!validated.ok)return validated;
  const documents=manifest.documents.map(documentMetrics).sort((a,b)=>lexical(a.path,b.path));
  const pairs=languageCoverage(manifest.documents);
  const outlines=translationOutlineDrift(manifest.documents);
  const crossLanguage=localizedLinks(manifest.documents);
  const counts={ paired:pairs.filter(p=>p.coverage==='paired').length,
    missingLanguage:pairs.filter(p=>p.coverage==='missing-language').length,
    duplicateLanguage:pairs.filter(p=>p.coverage==='duplicate-language').length,
    outlineReview:outlines.filter(o=>o.status==='review').length,
    crossLanguageLinks:crossLanguage.length };
  return {ok:true,value:{capturedOn:manifest.capturedOn,documents,pairs,outlines,crossLanguage,counts,
    caution:'Counts describe supplied Markdown structure only; UNKNOWN remains UNKNOWN.'}};
}
