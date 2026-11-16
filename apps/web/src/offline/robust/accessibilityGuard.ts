import { DASHBOARD_COPY } from "./offlineCopy.ts";

export const MIN_TARGET_PX = 44;

/** A native control with a visibly usable target size and label. */
export function createOfflineAction(
  documentRef: Document,
  text: string,
): HTMLButtonElement {
  if (!text.trim()) throw new TypeError("An action needs a visible label");
  const button = documentRef.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.style.minHeight = `${MIN_TARGET_PX}px`;
  button.style.minWidth = `${MIN_TARGET_PX}px`;
  button.style.padding = "8px 12px";
  button.style.margin = "4px";
  return button;
}

export type CopyAuditFinding =
  | "missing-language"
  | "missing-string"
  | "disallowed-claim"
  | "french-colon"
  | "french-punctuation"
  | "french-apostrophe";

/**
 * Run on the actual copy mounted by the offline shell. Any future change
 * that removes a translation or adds an unsupported claim fails its test.
 */
export function auditOfflineCopy(
  copy: Readonly<Record<"en" | "fr", Readonly<Record<string, string>>>> = DASHBOARD_COPY,
): readonly CopyAuditFinding[] {
  const findings: CopyAuditFinding[] = [];
  const english = copy.en;
  const french = copy.fr;
  if (!english || !french) return ["missing-language"];
  for (const key of new Set([...Object.keys(english), ...Object.keys(french)])) {
    if (!english[key]?.trim() || !french[key]?.trim()) {
      findings.push("missing-string");
    }
  }
  for (const language of [english, french]) {
    for (const value of Object.values(language)) {
      if (/(?:verified|vérifié(?:e|s|es)?|real-time|partnership|guarantee(?:d|s)?|aaa-conformant)/iu.test(value)) {
        findings.push("disallowed-claim");
      }
    }
  }
  for (const value of Object.values(french)) {
    if (/(?<!\u00a0):/.test(value)) findings.push("french-colon");
    if (/(?<!\u202f)[;!?]/.test(value)) findings.push("french-punctuation");
    if (value.includes("'")) findings.push("french-apostrophe");
  }
  return findings;
}
