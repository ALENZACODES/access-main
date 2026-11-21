/** Explicit, offline-only command for UI interaction snapshots. */
import { Buffer } from 'node:buffer';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSnapshots } from './snapshot-a11y-contract.mjs';
import { byFormat, exportChanges, exportCoverage } from './snapshot-a11y-report.mjs';
import { compareReviews } from './snapshot-a11y-analysis.mjs';

export const COMMANDS=Object.freeze(['review','coverage','compare']);
export const FORMATS=Object.freeze(['text','html','csv','json']);
const MAX_INPUT=8_000_000;
const MAX_OUTPUT=12_000_000;
function error(code){return {ok:false,code};}
export function parseCliArgs(argv){
 const args={command:'review',input:null,previous:null,output:null,language:'en',format:'text',today:undefined};
 if(!Array.isArray(argv))return error('ARGS');
 const tokens=[...argv];
 if(tokens[0]&&!tokens[0].startsWith('--'))args.command=tokens.shift();
 if(!COMMANDS.includes(args.command))return error('COMMAND');
 const allowed=new Set(['input','previous','output','language','format','today']);
 const seen=new Set();
 for(let i=0;i<tokens.length;i+=2){
  const flag=tokens[i],value=tokens[i+1];
  if(typeof flag!=='string'||!flag.startsWith('--')||typeof value!=='string'||value.startsWith('--'))return error('OPTION');
  const key=flag.slice(2);
  if(!allowed.has(key)||seen.has(key))return error('OPTION');
  seen.add(key);args[key]=value;
 }
 if(!args.input||args.command==='compare'&&!args.previous)return error('INPUT');
 if(!['en','fr'].includes(args.language))return error('LANGUAGE');
 if(!FORMATS.includes(args.format))return error('FORMAT');
 if(args.command==='compare'&&args.format!=='text')return error('FORMAT');
 if(args.command==='coverage'&&args.format!=='text')return error('FORMAT');
 return {ok:true,args};
}
export function safeOutputPath(root,file){
 if(typeof file!=='string'||!file.trim()||file.includes('\0'))return null;
 const dest=resolve(root,file);
 const rel=relative(root,dest);
 if(rel===''||rel==='.'||rel.startsWith('..')||isAbsolute(rel))return null;
 return dest;
}
async function requireOrdinaryFile(file){
 const resolved=resolve(file);
 const stat=await lstat(resolved);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_INPUT)throw new Error('FILE');
 const parent=await realpath(dirname(resolved));
 if(parent!==dirname(resolved))throw new Error('SYMLINK_PARENT');
 return resolved;
}
export async function readSnapshotFile(file,options={}){
 try{
  const path=await requireOrdinaryFile(file);
  const data=await readFile(path);
  if(data.length>MAX_INPUT)return {ok:false,value:null,problems:[{code:'INPUT_LIMIT',path:'/'}]};
  return parseSnapshots(data.toString('utf8'),options);
 }catch{return {ok:false,value:null,problems:[{code:'INPUT_FILE',path:'/'}]};}
}
function errorCodes(problems){return problems.map(p=>p.code).join(', ')||'UNKNOWN';}
export async function runSnapshotCli(argv,io={}){
 const stdout=io.stdout??process.stdout,stderr=io.stderr??process.stderr;
 const parsed=parseCliArgs(argv);
 if(!parsed.ok){stderr.write(`Argument error: ${parsed.code}\n`);return 2;}
 const args=parsed.args;
 const options=args.today?{today:args.today}:{};
 const first=await readSnapshotFile(args.input,options);
 if(!first.ok){stderr.write(`Input error: ${errorCodes(first.problems)}\n`);return 2;}
 let output;
 if(args.command==='compare'){
  const second=await readSnapshotFile(args.previous,options);
  if(!second.ok){stderr.write(`Input error: ${errorCodes(second.problems)}\n`);return 2;}
  const comparison=compareReviews(second.value,first.value,options);
  if(!comparison.ok){stderr.write(`Review error: ${errorCodes(comparison.problems)}\n`);return 2;}
  output=exportChanges(second.value,first.value,args.language,options);
 } else if(args.command==='coverage')output=exportCoverage(first.value,args.language,options);
 else output=byFormat(first.value,args.format,args.language,options);
 if(!output.ok||typeof output.text!=='string'){stderr.write(`Report error: ${errorCodes(output.problems)}\n`);return 2;}
 if(Buffer.byteLength(output.text,'utf8')>MAX_OUTPUT){stderr.write('Output error: REPORT_LIMIT\n');return 2;}
 if(args.output){
  const root=io.cwd??process.cwd();
  const destination=safeOutputPath(root,args.output);
  if(!destination){stderr.write('Output error: PATH\n');return 2;}
  try{
   const canonicalParent=await realpath(dirname(destination));
   if(canonicalParent!==dirname(destination))throw new Error('SYMLINK_PARENT');
   await writeFile(destination,output.text,{flag:'wx',mode:0o600,encoding:'utf8'});
  }catch{stderr.write('Output error: WRITE\n');return 2;}
 }else stdout.write(output.text);
 return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const code=await runSnapshotCli(process.argv.slice(2));
 process.exitCode=code;
}
