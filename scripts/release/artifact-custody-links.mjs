/** Static local-reference audit. No network and no implied runtime assertions. */
import { posix } from 'node:path';
import { cleanPath, issue, validateCustody } from './artifact-custody-core.mjs';

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu;
const ASSET_ATTR = /\b(?:src|href|poster|data|xlink:href)\s*=\s*(["'])(.*?)\1/giu;
const CSS_URL = /\burl\(\s*(?:(["'])(.*?)\1|([^)'"\s]+))\s*\)/giu;
const CSS_IMPORT = /@import\s+(?:(["'])(.*?)\1|url\(\s*(["']?)(.*?)\3\s*\))/giu;
const SRCSET = /\bsrcset\s*=\s*(["'])(.*?)\1/giu;

function cleanReference(value, from) {
  if(typeof value!=='string') return {path:null,code:'REFERENCE_INVALID'};
  const trimmed=value.trim();
  if(!trimmed || trimmed.startsWith('#')) return {path:null,code:null};
  if(REMOTE.test(trimmed)) return {path:null,code:'EXTERNAL_ASSET'};
  if(trimmed.startsWith('data:')||trimmed.startsWith('blob:')) return {path:null,code:'INLINE_ASSET'};
  const raw=trimmed.split(/[?#]/u)[0];
  if(raw==='') return {path:null,code:null};
  if(raw.includes('\\')||raw.includes('%')||[...raw].some(c=>c.codePointAt(0)<32)){
    return {path:null,code:'REFERENCE_UNSAFE'};
  }
  const base=posix.dirname(from);
  const candidate=raw.startsWith('/')?raw.slice(1):posix.normalize(posix.join(base,raw));
  if(candidate===''||candidate.startsWith('../')||candidate==='..'||candidate.startsWith('/')) {
    return {path:null,code:'REFERENCE_UNSAFE'};
  }
  const path=cleanPath(candidate);
  return path?{path,code:null}:{path:null,code:'REFERENCE_UNSAFE'};
}
export function resolveAssetReference(value,from){
  return cleanReference(value,from);
}
/** Find references by HTML attributes and CSS urls; ignores fragment-only links. */
export function extractAssetReferences(source,from) {
  if(typeof source!=='string') return [];
  const values=[];
  const push=(v)=>{if(typeof v==='string') values.push(v);};
  for(const match of source.matchAll(ASSET_ATTR)){push(match[2]);}
  for(const match of source.matchAll(CSS_URL)){push(match[2]??match[3]);}
  for(const match of source.matchAll(CSS_IMPORT)){push(match[2]??match[4]);}
  for(const match of source.matchAll(SRCSET)){
    const parts=match[2].split(',');
    for(const part of parts){push(part.trim().split(/\s+/u)[0]);}
  }
  return [...new Set(values.map(value=>cleanReference(value,from).path).filter(Boolean))].sort();
}
export function inspectRawReferences(source,from) {
  const found=[];
  if(typeof source!=='string') return [issue('SOURCE_NOT_TEXT',`/${from}`)];
  const values=[];
  for(const match of source.matchAll(ASSET_ATTR)) values.push(match[2]);
  for(const match of source.matchAll(CSS_URL)) values.push(match[2]??match[3]);
  for(const match of source.matchAll(CSS_IMPORT)) values.push(match[2]??match[4]);
  for(const match of source.matchAll(SRCSET)) for(const part of match[2].split(',')) values.push(part.trim().split(/\s+/u)[0]);
  for(const value of values){
    const result=cleanReference(value,from);
    if(result.code && result.code!=='INLINE_ASSET') found.push(issue(result.code,`/${from}`));
  }
  return found;
}
export function edgesFor(manifest){
  return manifest.files.flatMap(entry=>(entry.references??[]).map(target=>({from:entry.path,to:target})));
}
/** A reference graph check is structural; a connected path is not proof of availability. */
export function graphCustody(manifest,options={}) {
  const check=validateCustody(manifest,options);
  if(!check.ok) return {ok:false,problems:check.problems,edges:[],reachable:[],orphans:[]};
  const problems=[];
  const files=new Map(manifest.files.map(x=>[x.path,x]));
  const edges=edgesFor(manifest).sort((a,b)=>a.from.localeCompare(b.from,'en')||a.to.localeCompare(b.to,'en'));
  for(const edge of edges){
    if(!files.has(edge.to)) problems.push(issue('REFERENCE_MISSING',`/${edge.from}`));
    else if(files.get(edge.to).state!=='PRESENT') problems.push(issue('REFERENCE_NOT_PRESENT',`/${edge.from}`));
    if(edge.from===edge.to) problems.push(issue('SELF_REFERENCE',`/${edge.from}`));
  }
  const roots=manifest.files.filter(f=>f.kind==='html' && (f.path==='index.html'||f.path.endsWith('/index.html'))).map(f=>f.path).sort();
  if(!roots.length) problems.push(issue('OFFLINE_ENTRY_MISSING','/files'));
  const adjacent=new Map(manifest.files.map(x=>[x.path,[]]));
  for(const {from,to} of edges) if(adjacent.has(from)&&adjacent.has(to))adjacent.get(from).push(to);
  const reached=new Set();
  const pending=[...roots];
  while(pending.length){
    const path=pending.pop();
    if(reached.has(path))continue;
    reached.add(path);
    for(const child of adjacent.get(path)??[])pending.push(child);
  }
  const orphans=[...files.keys()].filter(path=>!reached.has(path)).sort();
  for(const orphan of orphans) problems.push(issue('UNREFERENCED_ASSET',`/${orphan}`,'warning'));
  const cycles=[];const active=new Set();const done=new Set();
  // Iterative DFS prevents stack exhaustion from deep, untrusted link graphs.
  for(const root of [...files.keys()].sort()){
    if(done.has(root))continue;
    const frames=[{node:root,index:0}];
    active.add(root);
    while(frames.length){
      const frame=frames.at(-1);
      const children=adjacent.get(frame.node)??[];
      if(frame.index>=children.length){
        active.delete(frame.node);done.add(frame.node);frames.pop();continue;
      }
      const child=children[frame.index++];
      if(active.has(child)){
        cycles.push([frame.node,child]);continue;
      }
      if(done.has(child))continue;
      active.add(child);frames.push({node:child,index:0});
    }
  }
  for(const cycle of cycles) problems.push(issue('REFERENCE_CYCLE',`/${cycle[0]}`));
  const ok=problems.every(p=>p.severity!=='error');
  return {ok,problems,edges,reachable:[...reached].sort(),orphans,roots};
}
export function reachableAssetSummary(manifest,options={}){
  const graph=graphCustody(manifest,options);
  if(!graph.ok)return {ok:false,problems:graph.problems,summary:null};
  const map=new Map(manifest.files.map(x=>[x.path,x]));
  let bytes=0;
  const byKind={};
  for(const path of graph.reachable){
    const item=map.get(path);
    if(!item)continue;
    bytes+=item.bytes;
    byKind[item.kind]=(byKind[item.kind]??0)+1;
  }
  return {ok:true,problems:graph.problems,summary:{reachableFiles:graph.reachable.length,
    totalFiles:manifest.files.length,bytes,byKind}};
}
