/** Documentation page navigation graph. Reads only supplied Markdown and paths. */
import { lexical, validateManifest, UNKNOWN } from './document-outline-contract.mjs';
import { analyzeMarkdown, normalizeLinkDestination } from './document-outline-parser.mjs';
const compare = (a, b) => lexical(a.path ?? a, b.path ?? b);
export function graphIndex(manifest) {
  const pathToDoc = new Map(manifest.documents.map(d => [d.path, d]));
  const outgoing = new Map(), incoming = new Map();
  for (const d of manifest.documents) { outgoing.set(d.id, new Set()); incoming.set(d.id, new Set()); }
  const unresolved = [], external = [];
  for (const d of manifest.documents) {
    for (const link of analyzeMarkdown(d.body).links) {
      const dest = normalizeLinkDestination(link.destination);
      if (dest.kind === 'external') { external.push({ from: d.id, url: dest.target, line: link.line }); continue; }
      if (dest.kind !== 'relative') continue;
      const target = pathToDoc.get(dest.target);
      if (!target) { unresolved.push({ from: d.id, path: dest.target, line: link.line }); continue; }
      if (!outgoing.has(d.id) || !incoming.has(target.id)) continue;
      outgoing.get(d.id).add(target.id);
      incoming.get(target.id).add(d.id);
    }
  }
  return { outgoing: new Map([...outgoing].map(([id, v]) => [id, [...v].sort(lexical)])),
    incoming: new Map([...incoming].map(([id, v]) => [id, [...v].sort(lexical)])),
    unresolved: unresolved.sort((a,b) => lexical(a.from,b.from)||a.line-b.line),
    external: external.sort((a,b) => lexical(a.from,b.from)||a.line-b.line) };
}
export function reachableDocuments(manifest, roots) {
  const index = graphIndex(manifest);
  const seen = new Set(), pending = [...roots].sort(lexical);
  while (pending.length) {
    const id = pending.shift();
    if (seen.has(id) || !index.outgoing.has(id)) continue;
    seen.add(id);
    for (const child of index.outgoing.get(id)) if (!seen.has(child)) pending.push(child);
  }
  return [...seen].sort(lexical);
}
export function disconnectedDocuments(manifest, roots) {
  const visited = new Set(reachableDocuments(manifest, roots));
  return manifest.documents.filter(d => !visited.has(d.id)).map(d => d.id).sort(lexical);
}
export function shortestDocumentPath(manifest, start, finish) {
  const graph = graphIndex(manifest);
  if (!graph.outgoing.has(start) || !graph.outgoing.has(finish)) return null;
  const queue = [[start]], seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift(), current = path[path.length - 1];
    if (current === finish) return path;
    for (const child of graph.outgoing.get(current)) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push([...path, child]);
    }
  }
  return null;
}
export function stronglyConnectedDocuments(manifest) {
  const graph = graphIndex(manifest), components = [], ids = [...graph.outgoing.keys()].sort(lexical);
  const indices = new Map(), lows = new Map(), stack = [], onStack = new Set();
  let counter = 0;
  const visit = id => {
    indices.set(id,counter);lows.set(id,counter);counter += 1;
    stack.push(id);onStack.add(id);
    for(const next of graph.outgoing.get(id)) {
      if(!indices.has(next)) { visit(next);lows.set(id,Math.min(lows.get(id),lows.get(next))); }
      else if(onStack.has(next)) lows.set(id,Math.min(lows.get(id),indices.get(next)));
    }
    if(lows.get(id)===indices.get(id)) {
      const component=[];
      while(true) {const node=stack.pop();onStack.delete(node);component.push(node);if(node===id)break;}
      components.push(component.sort(lexical));
    }
  };
  for(const id of ids) if(!indices.has(id)) visit(id);
  return components.sort((a,b)=>lexical(a[0],b[0]));
}
export function bilingualNavigation(manifest) {
  const graph = graphIndex(manifest), byId = new Map(manifest.documents.map(d => [d.id,d]));
  const entries = [];
  for (const doc of manifest.documents) {
    const links = graph.outgoing.get(doc.id);
    const crossLanguage = links.filter(id => byId.get(id).language !== doc.language);
    const sameLanguage = links.filter(id => byId.get(id).language === doc.language);
    entries.push({ id: doc.id, path: doc.path, language: doc.language,
      sameLanguage, crossLanguage, incoming: graph.incoming.get(doc.id) });
  }
  return entries.sort(compare);
}
export function inspectNavigation(manifest, { roots = [], today = '2026-11-21' } = {}) {
  const valid = validateManifest(manifest,{today});
  if (!valid.ok) return { ok: false, errors: valid.errors };
  if (!Array.isArray(roots) || roots.some(id=>typeof id!=='string')) return { ok:false, errors:[{code:'ROOTS',path:'roots'}] };
  const graph=graphIndex(manifest), components=stronglyConnectedDocuments(manifest);
  return { ok:true, value:{ roots: [...new Set(roots)].sort(lexical),
    reachable:reachableDocuments(manifest,roots), disconnected:disconnectedDocuments(manifest,roots),
    components:components.filter(c=>c.length>1), unresolved:graph.unresolved, external:graph.external,
    documents:bilingualNavigation(manifest), caution: UNKNOWN } };
}
