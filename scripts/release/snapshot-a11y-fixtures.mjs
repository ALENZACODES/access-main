/** Synthetic UI captures only. No real-place measurements or personal records. */
export const TODAY='2026-11-20';
export const provenance=()=>({source:'https://example.org/documentation',licence:'CC0-1.0',retrievedOn:TODAY,tier:0});
export const control=(id='submit',overrides={})=>({
 id,role:'button',name:'Save',bounds:{width:48,height:48},focusVisible:'PASS',tabReachable:'PASS',keyboard:{enter:'PASS',space:'PASS'},...overrides,
});
export const announcement=(id='saved',overrides={})=>({id,text:'Changes saved',live:'polite',announced:'PASS',...overrides});
export const asset=(path='assets/app.js',overrides={})=>({path,available:'PASS',...overrides});
export const capture=(id='sample-en',overrides={})=>({
 id,route:'/example',language:'en',environment:'offline',provenance:provenance(),controls:[control()],announcements:[announcement()],offlineShell:'PASS',storageReadable:'PASS',assets:[asset()],...overrides,
});
export const document=(...captures)=>({version:1,captures:captures.length?captures:[capture()]});
export const pair=()=>document(capture('en'),capture('fr',{language:'fr',controls:[control()]}));
export const clone=value=>JSON.parse(JSON.stringify(value));
