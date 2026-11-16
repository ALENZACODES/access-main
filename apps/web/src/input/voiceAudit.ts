// Pure audit helpers for voice-control and switch/touch residual gaps.
// WCAG 2.5.3 Label in Name (A) and the App's 44 px minimum target size.
// No DOM access: callers pass plain descriptors (e.g. from a Playwright run).

import { formatIssue, type IssueKind, type Locale } from "./voiceAudit.messages";

export const MIN_TARGET_PX = 44;

export interface ControlDescriptor {
  id: string;
  /** Text a sighted user sees on the control. Empty/undefined = icon only. */
  visibleText?: string;
  /** Computed accessible name. Undefined = not known. */
  accessibleName?: string;
  /** Rendered size in CSS px. Undefined = not measured (UNKNOWN). */
  width?: number;
  height?: number;
}

export interface AuditIssue {
  id: string;
  kind: IssueKind;
}

/** Lower-case, NFKC, punctuation and all whitespace (incl. U+00A0/U+202F) -> single space. */
export function normalizeLabel(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * true when the visible label appears in the accessible name as whole words.
 * null when it cannot be decided (no visible text, or name not provided).
 */
export function labelInName(
  visibleText: string | undefined,
  accessibleName: string | undefined,
): boolean | null {
  if (visibleText === undefined || accessibleName === undefined) return null;
  const label = normalizeLabel(visibleText);
  if (label === "") return null;
  return ` ${normalizeLabel(accessibleName)} `.includes(` ${label} `);
}

function isSize(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export function auditControls(controls: readonly ControlDescriptor[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const c of controls) {
    if (labelInName(c.visibleText, c.accessibleName) === false) {
      issues.push({ id: c.id, kind: "label-not-in-name" });
    }
    if (!isSize(c.width) || !isSize(c.height)) {
      issues.push({ id: c.id, kind: "target-size-unknown" });
    } else if (c.width < MIN_TARGET_PX || c.height < MIN_TARGET_PX) {
      issues.push({ id: c.id, kind: "target-too-small" });
    }
  }
  return issues;
}

export function describeIssues(
  controls: readonly ControlDescriptor[],
  locale: Locale,
): string[] {
  const byId = new Map(controls.map((c) => [c.id, c] as const));
  return auditControls(controls).map((i) => {
    const c = byId.get(i.id);
    return formatIssue(locale, i.kind, c?.visibleText || c?.accessibleName || i.id);
  });
}
