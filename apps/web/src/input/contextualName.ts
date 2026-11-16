// Accessible names for repeated controls (Edit, Delete) in a list.
// The name starts with the visible label, so a voice user can still say the
// label they see (WCAG 2.5.3 Label in Name), and adds which item it acts on,
// so screen-reader and voice users can tell one row's button from the next.

import { labelInName } from "./voiceAudit.ts";
import type { Locale } from "./voiceAudit.messages.ts";

const NBSP = "\u00a0";

/**
 * "Edit: draft 2, new place, 2026-11-15" in English and
 * "Modifier\u00a0: brouillon 2, …" in French. The visible label is kept first and
 * unchanged. If the result would not contain the visible label, or there is no
 * context, the visible label alone is returned, so the name never drifts from
 * what is on screen.
 */
export function contextualName(locale: Locale, visible: string, context: readonly (string | number | undefined | null)[]): string {
  const label = visible.trim();
  const parts = context.map((part) => (part === undefined || part === null ? "" : String(part).trim())).filter((part) => part !== "");
  if (label === "" || parts.length === 0) return label;
  const name = `${label}${locale === "fr" ? `${NBSP}:` : ":"} ${parts.join(", ")}`;
  return labelInName(label, name) === true ? name : label;
}
