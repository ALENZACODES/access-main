import type { BriefDocument } from "./recoverySupportBrief";
export type BriefPrivacyCode = "email" | "phone" | "credential" | "link-with-token";
export interface BriefPrivacyFinding {
  readonly path: string;
  readonly code: BriefPrivacyCode;
  readonly advice: "review-before-export";
}
export interface BriefPrivacyReport {
  readonly findings: readonly BriefPrivacyFinding[];
  readonly safeToShare: boolean;
  readonly contentReady: false;
}
const email = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu;
const phone = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/u;
const key = /(?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]/iu;
const urlToken = /https?:\/\/\S+[?&](?:token|key|secret|auth)=/iu;
/** Read-only, conservative privacy lint for manual exports; it never sends or masks user data. */
export function briefPrivacyCodes(text: string): BriefPrivacyCode[] {
  const codes: BriefPrivacyCode[] = [];
  if (email.test(text)) codes.push("email");
  if (phone.test(text)) codes.push("phone");
  if (key.test(text)) codes.push("credential");
  if (urlToken.test(text)) codes.push("link-with-token");
  return codes;
}
export function auditBriefPrivacy(document: BriefDocument): BriefPrivacyReport {
  const findings: BriefPrivacyFinding[] = [];
  const inspect = (path: string, value: string): void => {
    for (const code of briefPrivacyCodes(value)) {
      findings.push({ path, code, advice: "review-before-export" });
    }
  };
  for (const brief of document.briefs) {
    inspect(`briefs:${brief.id}:title`, brief.title);
    inspect(`briefs:${brief.id}:source`, brief.source.name);
    inspect(`briefs:${brief.id}:reference`, brief.source.reference);
  }
  for (const observation of document.observations) {
    inspect(`observations:${observation.id}:summary`, observation.summary);
    inspect(`observations:${observation.id}:source`, observation.source.name);
    inspect(`observations:${observation.id}:reference`, observation.source.reference);
  }
  for (const question of document.questions) {
    inspect(`questions:${question.id}:question`, question.question);
    inspect(`questions:${question.id}:response`, question.response);
    inspect(`questions:${question.id}:source`, question.source.name);
    inspect(`questions:${question.id}:reference`, question.source.reference);
  }
  for (const event of document.events) {
    inspect(`events:${event.id}:note`, event.note);
  }
  return { findings, safeToShare: findings.length === 0, contentReady: false };
}
/** Export is an explicit user action and stops when obvious contact details are present. */
export function briefExportAllowed(document: BriefDocument): boolean {
  return auditBriefPrivacy(document).safeToShare;
}
