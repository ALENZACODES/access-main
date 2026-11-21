/**
 * Read-only custody manifest for a locally assembled offline web bundle.
 * A hash proves byte equality to a recorded copy, not accessibility or accuracy.
 * No discovery, requests, permissions, timers, or local profile storage occur here.
 */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { isOpenLicence, isValidDate } from './site-audit.mjs';

export const CUSTODY_VERSION = 1;
export const CUSTODY_STATES = Object.freeze(['UNKNOWN', 'PRESENT', 'MISSING', 'CHANGED']);
export const CUSTODY_TYPES = Object.freeze(['html', 'script', 'style', 'image', 'font', 'json', 'other']);
export const CUSTODY_LIMITS = Object.freeze({ maxFiles: 12000, maxBytes: 100_000_000,
  maxFileBytes: 50_000_000, maxPathLength: 1024, maxIssues: 500, maxDepth: 48 });
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA = /^[a-f\d]{64}$/u;
const TYPES = new Set(CUSTODY_TYPES);
const STATES = new Set(CUSTODY_STATES);
const DANGEROUS = new Set(['__proto__', 'prototype', 'constructor']);
const PRIVATE = new Set(['password', 'token', 'cookie', 'healthcard', 'medication',
  'email', 'telephone', 'phone', 'personname', 'geolocation', 'privatekey', 'secret',
  'apikey', 'address', 'diagnosis', 'birthdate', 'oauth', 'accesstoken']);

export function issue(code, path, severity = 'error') {
  return Object.freeze({ code, path, severity });
}
export function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
}
export function safeId(value) {
  return typeof value === 'string' && SAFE_NAME.test(value) && !DANGEROUS.has(value.toLowerCase());
}
export function cleanPath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > CUSTODY_LIMITS.maxPathLength) return null;
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\') || value.includes('\0')) return null;
  if ([...value].some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)) return null;
  if (value.includes('?') || value.includes('#') || value.includes(':')) return null;
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || DANGEROUS.has(part.toLowerCase()))) return null;
  if (parts.length > CUSTODY_LIMITS.maxDepth) return null;
  if (parts.some((part) => part.includes('%') || part.endsWith('.') || part.endsWith(' '))) return null;
  return parts.join('/');
}
export function classifyPath(path) {
  const ext = path.toLowerCase().split('.').at(-1);
  if (['html','htm'].includes(ext)) return 'html';
  if (['js','mjs'].includes(ext)) return 'script';
  if (ext === 'css') return 'style';
  if (['svg','png','webp','jpg','jpeg','gif','avif','ico'].includes(ext)) return 'image';
  if (['woff','woff2','ttf','otf'].includes(ext)) return 'font';
  if (['json','webmanifest','geojson'].includes(ext)) return 'json';
  return 'other';
}
export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
export function stableEntries(entries) {
  return [...entries].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function utf8Size(value) {
  return Buffer.byteLength(value, 'utf8');
}
export function pathPointer(value) {
  return String(value).replace(/~/g,'~0').replace(/\//g,'~1');
}
export function sensitiveFieldPaths(value, base = '', seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value !== 'object') return [];
  if (depth > CUSTODY_LIMITS.maxDepth) return [issue('DEPTH_LIMIT', base || '/')];
  if (seen.has(value)) return [issue('CYCLIC_DATA', base || '/')];
  seen.add(value);
  const out = [];
  const entries = Array.isArray(value) ? value.map((v,i) => [String(i),v]) : Object.entries(value);
  for (const [key,child] of entries) {
    const location = `${base}/${pathPointer(key)}`;
    const normalized = key.toLowerCase().replace(/[-_]/gu,'');
    if (PRIVATE.has(normalized) || DANGEROUS.has(key.toLowerCase())) out.push(issue('PRIVATE_FIELD',location));
    else out.push(...sensitiveFieldPaths(child,location,seen,depth+1));
  }
  seen.delete(value);
  return out;
}
export function checkProvenance(provenance, base = '/provenance') {
  const out = [];
  if (!isRecord(provenance)) return [issue('SOURCE_METADATA_REQUIRED',base)];
  if (typeof provenance.source !== 'string' || !provenance.source.trim() || provenance.source.length > 2000) {
    out.push(issue('SOURCE_REQUIRED', `${base}/source`));
  } else if (/^[a-z][\w+.-]*:/iu.test(provenance.source)) {
    try {
      const url = new URL(provenance.source);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
          url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
        out.push(issue('SOURCE_URL_UNSAFE', `${base}/source`));
      }
    } catch { out.push(issue('SOURCE_URL_UNSAFE', `${base}/source`)); }
  }
  if (!isOpenLicence(provenance.licence)) out.push(issue('LICENCE_REQUIRED',`${base}/licence`));
  if (!isValidDate(provenance.retrievedOn)) out.push(issue('DATE_REQUIRED',`${base}/retrievedOn`));
  if (![0,1,2,3,4,'E'].includes(provenance.tier)) out.push(issue('TIER_REQUIRED',`${base}/tier`));
  return out;
}
export function checkEntry(entry, index = 0, limits = CUSTODY_LIMITS) {
  const where = `/files/${index}`;
  if (!isRecord(entry)) return [issue('ENTRY_INVALID',where)];
  const out = [];
  out.push(...checkProvenance(entry.provenance, `${where}/provenance`));
  const path = cleanPath(entry.path);
  if (!path) out.push(issue('PATH_UNSAFE',`${where}/path`));
  if (!TYPES.has(entry.kind) || path && entry.kind !== classifyPath(path)) out.push(issue('KIND_INVALID',`${where}/kind`));
  if (!STATES.has(entry.state)) out.push(issue('STATE_INVALID',`${where}/state`));
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > limits.maxFileBytes) {
    out.push(issue('SIZE_INVALID',`${where}/bytes`));
  }
  if (entry.state === 'PRESENT' || entry.state === 'CHANGED') {
    if (typeof entry.sha256 !== 'string' || !SHA.test(entry.sha256)) out.push(issue('DIGEST_REQUIRED',`${where}/sha256`));
  } else if (entry.sha256 !== null) {
    out.push(issue('ABSENT_DIGEST', `${where}/sha256`));
  }
  if (entry.state !== 'PRESENT' && entry.state !== 'UNKNOWN') out.push(issue('STATE_REQUIRES_REVIEW',`${where}/state`,'warning'));
  if (entry.references !== undefined && (!Array.isArray(entry.references) ||
      entry.references.length > 1000 || entry.references.some((ref) => cleanPath(ref) === null))) {
    out.push(issue('REFERENCES_INVALID',`${where}/references`));
  }
  return out;
}
export function boundedLimits(options = {}) {
  const out = {};
  for (const [key,max] of Object.entries(CUSTODY_LIMITS)) {
    const candidate = options[key];
    out[key] = candidate === undefined ? max : Number.isSafeInteger(candidate) && candidate > 0 && candidate <= max ? candidate : null;
  }
  return Object.values(out).some(x=>x===null) ? null : out;
}
/** Validation is fail closed: warnings never erase errors, and UNKNOWN is not a pass. */
export function validateCustody(manifest, options = {}) {
  const limits = boundedLimits(options);
  if (!limits) return { ok: false, problems: [issue('LIMITS_INVALID','/')], manifest: null };
  const problems = sensitiveFieldPaths(manifest);
  if (!isRecord(manifest) || manifest.version !== CUSTODY_VERSION || !Array.isArray(manifest.files)) {
    return { ok: false, problems: [...problems,issue('MANIFEST_INVALID','/')],manifest:null };
  }
  if (manifest.files.length > limits.maxFiles) return { ok:false, problems:[...problems,issue('FILE_LIMIT','/files')],manifest:null };
  if (!safeId(manifest.buildId)) problems.push(issue('BUILD_ID_INVALID','/buildId'));
  problems.push(...checkProvenance(manifest.provenance));
  const keys = new Set(['version','buildId','provenance','files']);
  for (const key of Object.keys(manifest)) if (!keys.has(key)) problems.push(issue('EXTRA_FIELD',`/${pathPointer(key)}`));
  const seen = new Set();
  let total = 0;
  for (const [index,entry] of manifest.files.entries()) {
    problems.push(...checkEntry(entry,index,limits));
    const path = cleanPath(entry?.path);
    if (path) {
      const key = path.toLowerCase();
      if (seen.has(key)) problems.push(issue('PATH_COLLISION',`/files/${index}/path`));
      seen.add(key);
    }
    total += Number.isSafeInteger(entry?.bytes) ? entry.bytes : 0;
    if (total > limits.maxBytes) problems.push(issue('TOTAL_SIZE_LIMIT','/files'));
  }
  const errors = problems.filter(x=>x.severity === 'error');
  const safeProblems = problems.slice(0,limits.maxIssues);
  if (problems.length > limits.maxIssues) safeProblems.push(issue('ISSUE_LIMIT','/'));
  return { ok:errors.length===0 && problems.length<=limits.maxIssues,problems:safeProblems,
    manifest:errors.length===0?manifest:null };
}
export function canonicalCustody(manifest) {
  return { version: CUSTODY_VERSION, buildId: manifest.buildId,
    provenance: { source:manifest.provenance.source, licence:manifest.provenance.licence,
      retrievedOn:manifest.provenance.retrievedOn, tier:manifest.provenance.tier },
    files:stableEntries(manifest.files).map(item=>({path:item.path,kind:item.kind,bytes:item.bytes,
      sha256:item.sha256,state:item.state,
      provenance:{source:item.provenance.source,licence:item.provenance.licence,
        retrievedOn:item.provenance.retrievedOn,tier:item.provenance.tier},
      ...(item.references===undefined?{}:{references:[...item.references].sort()})})) };
}
export function custodyFingerprint(manifest, options={}) {
  const check = validateCustody(manifest,options);
  if (!check.ok) return { ok:false, problems:check.problems, fingerprint:null };
  return {ok:true,problems:[],fingerprint:`sha256:${sha256(JSON.stringify(canonicalCustody(manifest)))}`};
}
export function compareCustody(previous,next,options={}) {
  const a=validateCustody(previous,options); const b=validateCustody(next,options);
  if (!a.ok||!b.ok) return {ok:false,problems:[...a.problems.map(x=>({...x,snapshot:'previous'})),
    ...b.problems.map(x=>({...x,snapshot:'next'}))],changes:[],summary:null};
  const before=new Map(previous.files.map(x=>[x.path,x]));
  const after=new Map(next.files.map(x=>[x.path,x]));
  const all=[...new Set([...before.keys(),...after.keys()])].sort();
  const changes=[];
  for(const path of all){
    const older=before.get(path);const newer=after.get(path);
    if(!older) changes.push({path,kind:'ADDED',before:null,after:newer});
    else if(!newer) changes.push({path,kind:'REMOVED',before:older,after:null});
    else {
      const fields=['sha256','bytes','kind','state','references','provenance'];
      for(const key of fields){
        const x=['references','provenance'].includes(key)?JSON.stringify(older[key]??[]):older[key];
        const y=['references','provenance'].includes(key)?JSON.stringify(newer[key]??[]):newer[key];
        if(x!==y) changes.push({path,kind:`${key.toUpperCase()}_CHANGED`,before:older,after:newer});
      }
    }
  }
  for(const field of ['source','licence','retrievedOn','tier']){
    if(previous.provenance[field]!==next.provenance[field]) changes.push({path:'/',kind:`SOURCE_${field.toUpperCase()}_CHANGED`,before:null,after:null});
  }
  changes.sort((x,y)=>x.path.localeCompare(y.path,'en')||x.kind.localeCompare(y.kind,'en'));
  return {ok:true,problems:[],changes,summary:{added:changes.filter(x=>x.kind==='ADDED').length,
    removed:changes.filter(x=>x.kind==='REMOVED').length,changed:changes.length}};
}
export function parseCustody(text,options={}) {
  if(typeof text!=='string'||utf8Size(text)>CUSTODY_LIMITS.maxBytes) return {ok:false,problems:[issue('INPUT_LIMIT','/')],manifest:null};
  let value;
  try{value=JSON.parse(text);}catch{return {ok:false,problems:[issue('INVALID_JSON','/')],manifest:null};}
  return validateCustody(value,options);
}
export function serializeCustody(manifest, options={}) {
  const check=validateCustody(manifest,options);
  return check.ok?{ok:true,problems:[],text:JSON.stringify(canonicalCustody(manifest),null,2)+'\n'}:
    {ok:false,problems:check.problems,text:null};
}
