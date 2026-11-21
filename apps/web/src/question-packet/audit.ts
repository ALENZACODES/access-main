import { packetFindings, safeUrl, validDate, type Locale, type Packet, type Question, type Stop } from './model.ts';
export type AuditCategory = 'MISSING_ANSWER' | 'MISSING_SOURCE' | 'SOURCE_DATE' | 'MISSING_REVIEW' | 'CONFLICT' | 'INVALID_FIELD';
export interface AuditIssue { readonly code: AuditCategory; readonly stopId: string; readonly questionId: string;
  readonly path: string; readonly description: string; readonly severity: 'error' | 'review' }
export interface AuditResult { readonly issues: readonly AuditIssue[]; readonly errors: number; readonly reviews: number;
  readonly complete: number; readonly questions: number; readonly unknown: number }
export function answerQuality(question: Question): 'UNKNOWN' | 'UNSOURCED' | 'FOLLOW_UP' | 'RECORDED' {
  if(question.answer==='UNKNOWN')return 'UNKNOWN';
  if(question.source.name==='UNKNOWN'||question.source.licence==='UNKNOWN'||question.source.tier==='UNKNOWN')return 'UNSOURCED';
  if(question.review!=='RECORDED')return 'FOLLOW_UP';
  return 'RECORDED';
}
export function questionAudit(stop: Stop, q: Question, locale: Locale): AuditIssue[] {
  const issues:AuditIssue[]=[];
  const issue=(code:AuditCategory,path:string,description:string,severity:'error'|'review'='review')=>{
    issues.push({code,stopId:stop.id,questionId:q.id,path,description,severity});
  };
  const root=`stops/${stop.id}/questions/${q.id}`;
  if(q.answer==='UNKNOWN')issue('MISSING_ANSWER',`${root}/answer`,locale==='en'?'Answer remains UNKNOWN.':'La réponse reste UNKNOWN.');
  if(q.answer!=='UNKNOWN'&&(
    q.source.tier==='UNKNOWN'||q.source.name==='UNKNOWN'||q.source.licence==='UNKNOWN'
  ))issue('MISSING_SOURCE',`${root}/source`,locale==='en'?'Reported answer has incomplete provenance.':'La réponse consignée présente une source incomplète.');
  if(q.source.date!=='UNKNOWN'&&!validDate(q.source.date))issue('SOURCE_DATE',`${root}/source/date`,locale==='en'?'Source date is malformed.':'La date de la source est invalide.','error');
  if(q.source.url!=='UNKNOWN'&&!safeUrl(q.source.url))issue('INVALID_FIELD',`${root}/source/url`,locale==='en'?'Source URL is not an allowed HTTPS URL.':'L’adresse de la source n’est pas une adresse HTTPS autorisée.','error');
  if(q.answer!=='UNKNOWN'&&q.review==='UNKNOWN')issue('MISSING_REVIEW',`${root}/review`,locale==='en'?'Follow-up status has not been recorded.':'Le statut du suivi n’est pas consigné.');
  if(q.answer==='NOT_APPLICABLE'&&q.review==='NEEDS_RECHECK')issue('CONFLICT',`${root}/review`,locale==='en'?'Not applicable was reported but recheck remains requested.':'Sans objet a été consigné, mais un nouveau contrôle reste demandé.');
  return issues;
}
export function auditPacket(packet: Packet, locale: Locale): AuditResult {
  const issues:AuditIssue[]=[];let complete=0,questions=0,unknown=0;
  for(const stop of packet.stops)for(const q of stop.questions){
    questions+=1;
    if(q.answer==='UNKNOWN')unknown+=1;
    if(answerQuality(q)==='RECORDED')complete+=1;
    issues.push(...questionAudit(stop,q,locale));
  }
  for(const finding of packetFindings(packet).filter(f=>f.severity==='error')){
    issues.push({code:'INVALID_FIELD',stopId:'UNKNOWN',questionId:'UNKNOWN',path:finding.path,
      description:`${finding.code}: ${finding.path}`,severity:'error'});
  }
  return {issues,errors:issues.filter(x=>x.severity==='error').length,reviews:issues.filter(x=>x.severity==='review').length,complete,questions,unknown};
}
export function auditText(report: AuditResult, locale: Locale): string {
  const title=locale==='en'?'Evidence review for local questions':'Examen des éléments des questions locales';
  const lines=[title,`${report.questions} questions | ${report.unknown} UNKNOWN | ${report.errors} errors | ${report.reviews} review items`];
  for(const issue of report.issues)lines.push(`${issue.severity.toUpperCase()} | ${issue.stopId}/${issue.questionId} | ${issue.description} | ${issue.path}`);
  return lines.join('\n');
}
export function auditGroupByStop(report: AuditResult): Map<string,AuditIssue[]> {
  const groups=new Map<string,AuditIssue[]>();
  for(const issue of report.issues){const current=groups.get(issue.stopId)??[];groups.set(issue.stopId,[...current,issue]);}
  return groups;
}
export function changesNeeded(report: AuditResult):boolean {return report.errors>0||report.reviews>0;}
