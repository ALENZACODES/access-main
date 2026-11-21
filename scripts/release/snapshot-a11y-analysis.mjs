/** Assess observable interaction evidence; absence of evidence is UNKNOWN. */
import { inspectSnapshots, fingerprintSnapshots } from './snapshot-a11y-contract.mjs';

export const RULES = Object.freeze(['TARGET_44', 'ACCESSIBLE_NAME', 'TAB_REACHABLE', 'FOCUS_VISIBLE', 'KEYBOARD_ACTIVATION', 'ANNOUNCEMENTS', 'OFFLINE_SHELL', 'STORAGE_READ', 'ASSET_AVAILABILITY']);
export function joinStates(values) {
  if (!Array.isArray(values) || values.length === 0) return 'UNKNOWN';
  if (values.includes('FAIL')) return 'FAIL';
  if (values.includes('UNKNOWN')) return 'UNKNOWN';
  return values.every(v=>v==='PASS') ? 'PASS' : 'UNKNOWN';
}
export function finding(code,path,status,detail='') {
  return { code,path,status,detail };
}
export function metricState(raw, minimum = 44) {
  if (raw === 'UNKNOWN' || raw == null) return 'UNKNOWN';
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 'UNKNOWN';
  return raw >= minimum ? 'PASS' : 'FAIL';
}
export function controlReview(control, captureId) {
  const base = `/captures/${captureId}/controls/${control.id}`;
  const name = control.name === 'UNKNOWN' ? 'UNKNOWN' : control.name.trim().length ? 'PASS' : 'FAIL';
  const bounds = joinStates([metricState(control.bounds.width), metricState(control.bounds.height)]);
  const expected = control.role === 'link' ? ['enter'] : control.role === 'button' || control.role === 'checkbox' || control.role === 'switch' ? ['enter','space'] : [];
  const activation = expected.length ? joinStates(expected.map(key => control.keyboard[key] ?? 'UNKNOWN')) : 'UNKNOWN';
  const rules = {
    TARGET_44: bounds,
    ACCESSIBLE_NAME: name,
    TAB_REACHABLE: control.tabReachable,
    FOCUS_VISIBLE: control.focusVisible,
    KEYBOARD_ACTIVATION: activation,
  };
  const issues = [];
  for (const [rule,status] of Object.entries(rules)) {
    if (status !== 'PASS') issues.push(finding(rule, `${base}/${rule}`, status));
  }
  return { id: control.id, role: control.role, rules, overall: joinStates(Object.values(rules)), issues };
}
export function announcementReview(item, captureId) {
  const path = `/captures/${captureId}/announcements/${item.id}`;
  const status = joinStates([item.text === 'UNKNOWN' ? 'UNKNOWN' : 'PASS', item.announced]);
  const issues = status === 'PASS' ? [] : [finding('ANNOUNCEMENT',path,status)];
  return { id:item.id,live:item.live,status,issues };
}
export function captureReview(capture) {
  const controls = capture.controls.map(k=>controlReview(k,capture.id));
  const announcements = capture.announcements.map(a=>announcementReview(a,capture.id));
  const rules = {
    TARGET_44: joinStates(controls.map(c=>c.rules.TARGET_44)),
    ACCESSIBLE_NAME: joinStates(controls.map(c=>c.rules.ACCESSIBLE_NAME)),
    TAB_REACHABLE: joinStates(controls.map(c=>c.rules.TAB_REACHABLE)),
    FOCUS_VISIBLE: joinStates(controls.map(c=>c.rules.FOCUS_VISIBLE)),
    KEYBOARD_ACTIVATION: joinStates(controls.map(c=>c.rules.KEYBOARD_ACTIVATION)),
    ANNOUNCEMENTS: joinStates(announcements.map(a=>a.status)),
    OFFLINE_SHELL: capture.offlineShell,
    STORAGE_READ: capture.storageReadable,
    ASSET_AVAILABILITY: joinStates(capture.assets.map(a=>a.available)),
  };
  const findings = [...controls.flatMap(c=>c.issues),...announcements.flatMap(a=>a.issues)];
  for(const key of ['OFFLINE_SHELL','STORAGE_READ','ASSET_AVAILABILITY']) if(rules[key]!=='PASS') findings.push(finding(key,`/captures/${capture.id}/${key}`,rules[key]));
  const overall = joinStates(Object.values(rules));
  return { id:capture.id,route:capture.route,language:capture.language,environment:capture.environment,provenance:{...capture.provenance},controls,announcements,rules,overall,findings };
}
export function summarizeReviews(reviews) {
  const states = { PASS:0, FAIL:0, UNKNOWN:0 };
  const rules = Object.fromEntries(RULES.map(x=>[x,{PASS:0,FAIL:0,UNKNOWN:0}]));
  for(const capture of reviews) {
    states[capture.overall] += 1;
    for(const [rule,status] of Object.entries(capture.rules)) rules[rule][status] += 1;
  }
  return {total:reviews.length,states,rules,reviewRequired:states.FAIL+states.UNKNOWN};
}
export function analyzeSnapshots(value, options={}) {
  const checked = inspectSnapshots(value, options);
  if(!checked.ok) return {ok:false,problems:checked.problems,reviews:[],summary:null,fingerprint:null};
  const reviews = value.captures.map(captureReview).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const fingerprint = fingerprintSnapshots(value, options).sha256;
  return {ok:true,problems:[],reviews,summary:summarizeReviews(reviews),fingerprint};
}
export function captureKey(capture) {return `${capture.route}|${capture.language}|${capture.environment}`;}
export function languageParity(value, options={}) {
  const analysis=analyzeSnapshots(value,options);
  if(!analysis.ok) return {ok:false,problems:analysis.problems,pairs:[],issues:[]};
  const byRoute=new Map();
  for(const c of analysis.reviews) {
    const key=`${c.route}|${c.environment}`;
    if(!byRoute.has(key)) byRoute.set(key,{route:c.route,environment:c.environment,en:[],fr:[]});
    byRoute.get(key)[c.language].push(c);
  }
  const issues=[];
  const pairs=[];
  for(const entry of [...byRoute.values()].sort((a,b)=>a.route.localeCompare(b.route,'en')||a.environment.localeCompare(b.environment,'en'))) {
    if(entry.en.length===0||entry.fr.length===0){
      issues.push(finding('LANGUAGE_MISSING',entry.route,'UNKNOWN',entry.environment));
      pairs.push({route:entry.route,environment:entry.environment,status:'UNKNOWN',missing:entry.en.length?'fr':'en'});
      continue;
    }
    const en=entry.en[0];const fr=entry.fr[0];
    const enIds=new Set(en.controls.map(x=>x.id));const frIds=new Set(fr.controls.map(x=>x.id));
    const missingEn=[...frIds].filter(x=>!enIds.has(x)).sort();
    const missingFr=[...enIds].filter(x=>!frIds.has(x)).sort();
    for(const id of missingEn) issues.push(finding('CONTROL_MISSING_EN',`${entry.route}/${id}`,'UNKNOWN'));
    for(const id of missingFr) issues.push(finding('CONTROL_MISSING_FR',`${entry.route}/${id}`,'UNKNOWN'));
    const status = missingEn.length||missingFr.length ? 'UNKNOWN' : joinStates([en.overall,fr.overall]);
    pairs.push({route:entry.route,environment:entry.environment,status,missingEn,missingFr});
  }
  return {ok:true,problems:[],pairs,issues};
}
export function coverageMatrix(value, options={}) {
  const analyzed=analyzeSnapshots(value,options);
  if(!analyzed.ok) return {ok:false,problems:analyzed.problems,rows:[],summary:null};
  const routes=[...new Set(analyzed.reviews.map(x=>x.route))].sort();
  const environments=['online','offline','limited'];
  const rows=[];
  for(const route of routes) for(const language of ['en','fr']) for(const environment of environments) {
    const matched=analyzed.reviews.filter(x=>x.route===route&&x.language===language&&x.environment===environment);
    const status=joinStates(matched.map(x=>x.overall));
    rows.push({route,language,environment,status,captures:matched.length});
  }
  return {ok:true,problems:[],rows,summary:{total:rows.length,missing:rows.filter(r=>!r.captures).length,fail:rows.filter(r=>r.status==='FAIL').length,unknown:rows.filter(r=>r.status==='UNKNOWN').length}};
}
export function compareReviews(before,after,options={}) {
  const old=analyzeSnapshots(before,options);
  const newer=analyzeSnapshots(after,options);
  const problems=[...old.problems.map(x=>({...x,side:'before'})),...newer.problems.map(x=>({...x,side:'after'}))];
  if(problems.length) return {ok:false,problems,changes:[],summary:null};
  const left=new Map(old.reviews.map(x=>[x.id,x]));const right=new Map(newer.reviews.map(x=>[x.id,x]));
  const ids=[...new Set([...left.keys(),...right.keys()])].sort();
  const changes=[];
  for(const id of ids){
    const a=left.get(id), b=right.get(id);
    if(!a||!b){changes.push({id,kind:a?'REMOVED':'ADDED',previous:a?.overall??'UNKNOWN',next:b?.overall??'UNKNOWN',review:'UNKNOWN'});continue;}
    if(a.overall!==b.overall) changes.push({id,kind:'OUTCOME_CHANGED',previous:a.overall,next:b.overall,review:b.overall==='FAIL'?'FAIL':'UNKNOWN'});
    for(const rule of RULES) if(a.rules[rule]!==b.rules[rule]) changes.push({id,kind:'RULE_CHANGED',rule,previous:a.rules[rule],next:b.rules[rule],review:b.rules[rule]==='FAIL'?'FAIL':'UNKNOWN'});
    if(JSON.stringify(a.provenance)!==JSON.stringify(b.provenance)) changes.push({id,kind:'PROVENANCE_CHANGED',previous:'UNKNOWN',next:'UNKNOWN',review:'UNKNOWN'});
  }
  return {ok:true,problems:[],changes,summary:{total:changes.length,fail:changes.filter(x=>x.review==='FAIL').length,unknown:changes.filter(x=>x.review==='UNKNOWN').length}};
}
