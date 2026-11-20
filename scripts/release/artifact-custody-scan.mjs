/** Read-only filesystem capture of a local offline build without following symlinks. */
import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { classifyPath, cleanPath, sha256, validateCustody, CUSTODY_LIMITS, issue } from './artifact-custody-core.mjs';
import { extractAssetReferences, inspectRawReferences } from './artifact-custody-links.mjs';

export const SCAN_EXTENSIONS = Object.freeze(['html','htm','css','js','mjs','json','webmanifest',
  'svg','png','webp','jpg','jpeg','gif','avif','ico','woff','woff2','ttf','otf','txt','pdf']);
const EXTENSIONS = new Set(SCAN_EXTENSIONS);

export function safeRoot(root) {
  if (typeof root !== 'string' || !root.trim() || root.includes('\0')) return null;
  return resolve(root);
}
export function relativeAsset(root, candidate) {
  const rel = relative(root,candidate);
  if (rel.startsWith('..'+sep)||rel==='..'||rel.startsWith(sep)) return null;
  return cleanPath(rel.split(sep).join('/'));
}
export function fileExtension(path) {
  return path.toLowerCase().split('/').at(-1).split('.').at(-1);
}
export function acceptedExtension(path) {
  return EXTENSIONS.has(fileExtension(path));
}
function bytesToString(value) {
  return new TextDecoder('utf-8',{fatal:true}).decode(value);
}
export function inspectAssetBytes(path, bytes) {
  const kind = classifyPath(path);
  const problems=[];
  let text=null;
  if(['html','style','script','json'].includes(kind) || fileExtension(path)==='svg') {
    try{text=bytesToString(bytes);}catch{problems.push(issue('INVALID_UTF8',`/${path}`));}
    if(text!==null && text.includes('\uFFFD')) problems.push(issue('REPLACEMENT_CHARACTER',`/${path}`));
  }
  if(kind==='html' && text!==null && !/<html\b/iu.test(text)) problems.push(issue('HTML_ROOT_MISSING',`/${path}`));
  if(kind==='json' && text!==null){
    try{JSON.parse(text);}catch{problems.push(issue('INVALID_JSON',`/${path}`));}
  }
  if(text!==null && (kind==='html'||kind==='style')) {
    problems.push(...inspectRawReferences(text,path));
  }
  const references=text!==null && (kind==='html'||kind==='style')?
    extractAssetReferences(text,path):[];
  return {problems,references};
}
/**
 * Capture is always explicit. A pathname is not proof that a resource can be
 * used offline on a particular device. Scanning refuses links and unknown file kinds.
 */
export async function scanBundle(root, provenance, options={}) {
  const resolved=safeRoot(root);
  if(!resolved) return {ok:false,problems:[issue('ROOT_INVALID','/')],manifest:null};
  const limits={...CUSTODY_LIMITS,...options};
  const problems=[]; const files=[]; let total=0;
  let rootStat;
  try{rootStat=await lstat(resolved);}catch{return {ok:false,problems:[issue('ROOT_UNREADABLE','/')],manifest:null};}
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()){
    return {ok:false,problems:[issue('ROOT_NOT_DIRECTORY','/')],manifest:null};
  }
  const walk=async (absolute,depth)=>{
    if(depth>limits.maxDepth){problems.push(issue('DEPTH_LIMIT','/'));return;}
    let names;
    try{names=(await readdir(absolute)).sort();}catch{problems.push(issue('DIRECTORY_UNREADABLE','/'));return;}
    for(const name of names){
      const full=join(absolute,name);
      const path=relativeAsset(resolved,full);
      if(!path){problems.push(issue('PATH_UNSAFE',`/${name}`));continue;}
      let st;
      try{st=await lstat(full);}catch{problems.push(issue('FILE_UNREADABLE',`/${path}`));continue;}
      if(st.isSymbolicLink()){problems.push(issue('SYMLINK_REJECTED',`/${path}`));continue;}
      if(st.isDirectory()){await walk(full,depth+1);continue;}
      if(!st.isFile()){problems.push(issue('SPECIAL_FILE_REJECTED',`/${path}`));continue;}
      if(!acceptedExtension(path)){problems.push(issue('UNSUPPORTED_EXTENSION',`/${path}`));continue;}
      if(files.length>=limits.maxFiles){problems.push(issue('FILE_LIMIT','/files'));return;}
      if(st.size>limits.maxFileBytes){problems.push(issue('FILE_SIZE_LIMIT',`/${path}`));continue;}
      total+=st.size;
      if(total>limits.maxBytes){problems.push(issue('TOTAL_SIZE_LIMIT','/files'));return;}
      let contents;
      try{contents=await readFile(full);}catch{problems.push(issue('FILE_UNREADABLE',`/${path}`));continue;}
      if(Buffer.byteLength(contents)!==st.size){problems.push(issue('SIZE_RACE',`/${path}`));continue;}
      const inspection=inspectAssetBytes(path,contents);
      problems.push(...inspection.problems);
      files.push({path,kind:classifyPath(path),bytes:contents.length,sha256:sha256(contents),
        state:'PRESENT',provenance:{source:provenance.source,licence:provenance.licence,
          retrievedOn:provenance.retrievedOn,tier:provenance.tier},...(inspection.references.length?{references:inspection.references}: {})});
    }
  };
  await walk(resolved,0);
  const manifest={version:1,buildId:options.buildId??'local-build',provenance,files};
  const review=validateCustody(manifest);
  problems.push(...review.problems);
  const ok=problems.every(x=>x.severity!=='error');
  return {ok,problems,manifest:ok?manifest:null,summary:{files:files.length,bytes:total}};
}
export async function inspectBundleFiles(root, manifest) {
  const check=validateCustody(manifest);
  if(!check.ok) return {ok:false,problems:check.problems,changes:[]};
  const problems=[]; const changes=[];
  const base=safeRoot(root);
  if(!base) return {ok:false,problems:[issue('ROOT_INVALID','/')],changes:[]};
  for(const item of manifest.files){
    const full=resolve(base,item.path);
    if(!relativeAsset(base,full)){problems.push(issue('PATH_UNSAFE',`/${item.path}`));continue;}
    let st;
    try{st=await lstat(full);}catch{changes.push({path:item.path,kind:'MISSING'});continue;}
    if(st.isSymbolicLink()||!st.isFile()){problems.push(issue('NOT_REGULAR_FILE',`/${item.path}`));continue;}
    if(st.size> CUSTODY_LIMITS.maxFileBytes){problems.push(issue('FILE_SIZE_LIMIT',`/${item.path}`));continue;}
    let bytes;
    try{bytes=await readFile(full);}catch{problems.push(issue('FILE_UNREADABLE',`/${item.path}`));continue;}
    const digest=sha256(bytes);
    if(digest!==item.sha256||bytes.length!==item.bytes) changes.push({path:item.path,kind:'CHANGED'});
  }
  return {ok:problems.length===0 && changes.length===0,problems,changes};
}
