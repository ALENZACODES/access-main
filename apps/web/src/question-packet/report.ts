import { packetFindings, summary, type Locale, type Packet, type Question, type Stop } from './model.ts';
import { answerLabel, labels, reviewLabel, tierLabel, topicLabel } from './copy.ts';
export interface HandoffRow { readonly stop: string; readonly question: string; readonly topic: string; readonly answer: string;
 readonly details: string; readonly review: string; readonly sourceName: string; readonly sourceUrl: string; readonly licence: string;
 readonly sourceDate: string; readonly tier: string; readonly evidenceGap: boolean }
export function handoffRow(stop: Stop, question: Question, locale: Locale): HandoffRow {
  return {stop:stop.title[locale], question:question.prompt[locale], topic:topicLabel(locale,question.topic),
    answer:answerLabel(locale,question.answer),details:question.details[locale],review:reviewLabel(locale,question.review),
    sourceName:question.source.name,sourceUrl:question.source.url,licence:question.source.licence,
    sourceDate:question.source.date,tier:tierLabel(locale,question.source.tier),
    evidenceGap:question.answer==='UNKNOWN'||question.source.tier==='UNKNOWN'||question.review!=='RECORDED'};
}
export function handoffRows(packet: Packet, locale: Locale): HandoffRow[] {
  return packet.stops.flatMap(stop=>stop.questions.map(question=>handoffRow(stop,question,locale)));
}
export function csvCell(value: string): string {
  // Neutralize spreadsheet formulas, including after leading ASCII whitespace.
  const escaped=/^[\s\uFEFF]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${escaped.replaceAll('"','""')}"`;
}
export function exportCsv(packet: Packet, locale: Locale): string {
  const header=['Stop','Question','Topic','Answer','Details','Follow-up','Source','Source URL','Licence','Source date','Source type','Evidence gap'];
  const body=handoffRows(packet,locale).map(r=>[
    r.stop,r.question,r.topic,r.answer,r.details,r.review,r.sourceName,r.sourceUrl,r.licence,r.sourceDate,r.tier,r.evidenceGap?'YES':'NO',
  ]);
  return '\uFEFF'+[header,...body].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function exportText(packet: Packet, locale: Locale): string {
  const c=labels(locale),stats=summary(packet),lines=[packet.title[locale],c.safety,c.local,
    `${c.questions}: ${stats.questions}`,`${c.unknown}: ${stats.unknown}`,`${c.toContact}: ${stats.toContact}`,`${c.toRecheck}: ${stats.toRecheck}`,''];
  for(const [i,stop] of packet.stops.entries()) {
    lines.push(`${i+1}. ${stop.title[locale]}`);
    for(const question of stop.questions) {
      lines.push(`  ${question.prompt[locale]}`,`  ${c.answer}: ${answerLabel(locale,question.answer)}`,
        `  ${question.details[locale]}`,`  ${c.review}: ${reviewLabel(locale,question.review)}`,
        `  ${c.provenance}: ${question.source.name} | ${question.source.licence} | ${question.source.date} | ${question.source.url}`);
    }
    lines.push('');
  }
  lines.push(c.cannotInfer);
  return lines.join('\n');
}
export function exportJson(packet: Packet): string { return JSON.stringify(packet,null,2)+'\n'; }
export function safeFilename(locale: Locale, format: 'json' | 'csv' | 'txt'): string {return `accessibility-questions-${locale}.${format}`;}
export function reportQuality(packet: Packet): { safeToExport: boolean; errorCodes: readonly string[]; openGaps: number } {
  const findings=packetFindings(packet);const s=summary(packet);
  return {safeToExport:!findings.some(f=>f.severity==='error'),errorCodes:findings.filter(f=>f.severity==='error').map(f=>f.code),openGaps:s.gapIds.length};
}