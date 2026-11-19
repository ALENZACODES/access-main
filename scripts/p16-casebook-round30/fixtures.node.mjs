/** Synthetic test-only observations. No external accessibility claims. */
export const TODAY = "2026-11-19";
export const copy = (en="Step-free entrance",fr="Entrée sans marches")=>({en,fr});
export const reference = (overrides={})=>({
  id:"source-one",publisher:"Public publisher",url:"https://example.org/data",licence:"CC BY 4.0",
  collectedOn:"2026-11-18",tier:"PRIMARY",claim:"SUPPORTED",...overrides,
});
export const cache = (overrides={})=>({
  state:"PRESENT",path:"/offline/cases/case-one.json",capturedOn:"2026-11-18",bytes:1200,...overrides,
});
export const caseRecord = (overrides={})=>({
  id:"case-one",recordKey:"entrance-one",state:"RESOLVED",severity:"normal",evidence:"SUPPORTED",
  createdOn:"2026-11-17",updatedOn:"2026-11-18",title:copy(),summary:copy("Source-backed description","Description selon la source"),
  references:[reference()],cache:cache(),...overrides,
});
export const secondCase = (overrides={})=>caseRecord({
  id:"case-two",recordKey:"entrance-two",cache:cache({path:"/offline/cases/case-two.json"}),...overrides,
});
export const event = (overrides={})=>({
  id:"event-one",caseId:"case-one",type:"OPEN",occurredOn:"2026-11-17",sequence:1,...overrides,
});
export const secondEvent = (overrides={})=>event({
  id:"event-two",type:"RESOLVE",occurredOn:"2026-11-18",sequence:2,toState:"RESOLVED",...overrides,
});
export const clone = value=>JSON.parse(JSON.stringify(value));
export const findingCodes = items=>items.map(item=>item.code);
