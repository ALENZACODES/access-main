#!/usr/bin/env node
/** Explicit, offline-only CLI. No network, background work or hidden writes. */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { scanBundle, inspectBundleFiles } from './artifact-custody-scan.mjs';
import { parseCustody, serializeCustody, issue } from './artifact-custody-core.mjs';
import { textCustodyReport, textCustodyChanges, htmlCustodyReport, csvCustodyReport,
  jsonCustodyReport } from './artifact-custody-report.mjs';

export const COMMANDS=Object.freeze(['capture','inspect','compare','check']);
const ALLOWED=Object.freeze(['--root','--manifest','--previous','--next','--format','--locale',
  '--output','--source','--licence','--retrieved-on','--tier','--build-id']);
export function parseArgs(args){
  if(!Array.isArray(args)||!COMMANDS.includes(args[0])) return {ok:false,error:'COMMAND_REQUIRED'};
  const data={command:args[0]};
  for(let i=1;i<args.length;i+=2){
    const key=args[i];const value=args[i+1];
    if(!ALLOWED.includes(key)||typeof value!=='string'||value.startsWith('--')||
        Object.hasOwn(data,key))return {ok:false,error:'ARGUMENT_INVALID'};
    data[key]=value;
  }
  if(data['--locale']!==undefined && !['en','fr'].includes(data['--locale']))return {ok:false,error:'LOCALE_INVALID'};
  if(data['--format']!==undefined && !['json','text','html','csv'].includes(data['--format']))return {ok:false,error:'FORMAT_INVALID'};
  return {ok:true,args:data};
}
export function formatFindings(problems){
  return problems.map(x=>`${x.code} ${x.path}`).join('\n')+'\n';
}
async function readManifest(path){
  if(typeof path!=='string')return {ok:false,problems:[issue('MANIFEST_PATH_REQUIRED','/')],manifest:null};
  let data;
  try { data=await readFile(resolve(path),'utf8'); }
  catch {return {ok:false,problems:[issue('MANIFEST_UNREADABLE','/')],manifest:null};}
  return parseCustody(data);
}
function report(manifest,format,locale){
  if(format==='text')return {ok:true,text:textCustodyReport(manifest,locale)};
  if(format==='html')return htmlCustodyReport(manifest,locale);
  if(format==='csv')return csvCustodyReport(manifest,locale);
  return jsonCustodyReport(manifest);
}
export async function runCustodyCli(args,io={}){
  const output=io.stdout??process.stdout;const errors=io.stderr??process.stderr;
  const parsed=parseArgs(args);
  if(!parsed.ok){errors.write(`${parsed.error}\n`);return 2;}
  const a=parsed.args;
  const command=a.command;
  const locale=a['--locale']??'en';const format=a['--format']??'json';
  let result;
  if(command==='capture'){
    if(!a['--root']){errors.write('ROOT_REQUIRED\n');return 2;}
    const tier=a['--tier']=== 'E'?'E':Number(a['--tier']);
    const provenance={source:a['--source'],licence:a['--licence'],
      retrievedOn:a['--retrieved-on'],tier};
    const scanned=await scanBundle(a['--root'],provenance,{buildId:a['--build-id']??'local-build'});
    if(!scanned.ok){errors.write(formatFindings(scanned.problems));return 2;}
    result=serializeCustody(scanned.manifest);
  }else if(command==='inspect'){
    const read=await readManifest(a['--manifest']);
    if(!read.ok){errors.write(formatFindings(read.problems));return 2;}
    result=report(read.manifest,format,locale);
  }else if(command==='compare'){
    const prev=await readManifest(a['--previous']);const next=await readManifest(a['--next']);
    if(!prev.ok||!next.ok){errors.write(formatFindings([...prev.problems,...next.problems]));return 2;}
    result={ok:true,text:textCustodyChanges(prev.manifest,next.manifest,locale)};
  }else{
    const read=await readManifest(a['--manifest']);
    if(!read.ok){errors.write(formatFindings(read.problems));return 2;}
    const checked=await inspectBundleFiles(a['--root'],read.manifest);
    if(!checked.ok){errors.write(formatFindings(checked.problems)+checked.changes.map(x=>`${x.kind} ${x.path}`).join('\n')+'\n');return 2;}
    result={ok:true,text:'PASS\n'};
  }
  if(!result.ok){errors.write(formatFindings(result.problems));return 2;}
  if(a['--output']){
    try{
      await writeFile(resolve(a['--output']),result.text,{flag:'wx',mode:0o600});
    }catch{errors.write('OUTPUT_EXISTS_OR_UNWRITABLE\n');return 2;}
  }else output.write(result.text);
  return 0;
}
const invoked=process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(invoked){
  runCustodyCli(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(()=>{
    process.stderr.write('CUSTODY_FAILURE\n');process.exitCode=2;
  });
}
