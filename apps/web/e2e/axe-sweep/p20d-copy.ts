import type { Page } from "@playwright/test";
import { finding, frenchTypographyFindings, languageOf, type Finding, type Language } from "./p20d-contracts";

export interface TextRun {
  readonly text: string;
  readonly parent: string;
  readonly locale: Language | null;
  readonly exposed: boolean;
}

export interface CopyAudit {
  readonly url: string;
  readonly language: Language | null;
  readonly runs: readonly TextRun[];
  readonly totalCharacters: number;
}

/**
 * Inspect only author-visible DOM text nodes. Script, style, template,
 * code, hidden elements, and editable field values are not user copy.
 */
export async function collectVisibleCopy(page: Page): Promise<CopyAudit> {
  const result = await page.evaluate(() => {
    const root = document.querySelector("main, [role='main']") ?? document.body;
    const output: Array<{ text: string; parent: string; locale: "en" | "fr" | null; exposed: boolean }> = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest("script, style, noscript, template, code, pre, textarea, [contenteditable='true']")) continue;
      if (parent.closest("[hidden], [inert], [aria-hidden='true']")) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (parent.getClientRects().length === 0) continue;
      const value = (node.nodeValue ?? "").replace(/\s+/g, (part) =>
        part.includes("\u00a0") || part.includes("\u202f") ? part : " ",
      ).trim();
      if (!value) continue;
      const explicitLanguage = parent.closest("[lang]")?.getAttribute("lang") ??
        document.documentElement.getAttribute("lang");
      const candidate = explicitLanguage?.trim().toLowerCase().split("-")[0];
      const locale = candidate === "en" || candidate === "fr" ? candidate : null;
      output.push({ text: value, parent: parent.tagName.toLowerCase(), locale, exposed: true });
    }
    return {
      language: document.documentElement.getAttribute("lang"),
      runs: output,
      totalCharacters: output.reduce((sum, run) => sum + run.text.length, 0),
    };
  });
  return {
    url: page.url(),
    language: languageOf(result.language),
    runs: result.runs,
    totalCharacters: result.totalCharacters,
  };
}

const OVERCLAIMS: readonly { readonly pattern: RegExp; readonly rule: string }[] = [
  { pattern: /\bverified\b/i, rule: "copy-unsubstantiated-assurance" },
  { pattern: /\bvérifié(?:e|es|s)?\b/i, rule: "copy-unsubstantiated-assurance" },
  { pattern: /\breal[- ]time\b/i, rule: "copy-temporal-overclaim" },
  { pattern: /\b(?:partnership|partenariat)\b/i, rule: "copy-affiliation-overclaim" },
  { pattern: /\b(?:guarantee|guaranteed|garantie|garanti(?:e|s|es)?)\b/i, rule: "copy-outcome-overclaim" },
  { pattern: /\bAAA[- ]conformant\b/i, rule: "copy-conformance-overclaim" },
];

export function overclaimFindings(text: string, url: string): Finding[] {
  const issues: Finding[] = [];
  for (const { pattern, rule } of OVERCLAIMS) {
    if (pattern.test(text)) issues.push(finding(rule, url, text.slice(0, 120)));
  }
  return issues;
}

/**
 * Check each run independently to avoid treating a punctuation boundary
 * between two HTML elements as a typographic error.
 */
export function copyFindings(snapshot: CopyAudit): Finding[] {
  const issues: Finding[] = [];
  if (snapshot.totalCharacters === 0) {
    issues.push(finding("empty-main-copy", snapshot.url, "No visible main-region text"));
  }
  for (const run of snapshot.runs) {
    if (!run.exposed) continue;
    issues.push(...overclaimFindings(run.text, snapshot.url));
    if (run.locale === "fr") {
      // Ignore common visual URL and time tokens; audit surrounding prose.
      if (!/https?:\/\/|\b\d{1,2}:\d{2}\b/.test(run.text)) {
        issues.push(...frenchTypographyFindings(run.text, snapshot.url));
      }
      if (/\b(?:Unknown|Unavailable|Loading)\b/.test(run.text)) {
        issues.push(finding("fr-untranslated-state", snapshot.url, run.text.slice(0, 100)));
      }
    }
    if (run.locale === "en" && /\b(?:Inconnu|Indisponible|Chargement)\b/.test(run.text)) {
      issues.push(finding("en-untranslated-state", snapshot.url, run.text.slice(0, 100)));
    }
  }
  return issues;
}

export function copySummary(snapshot: CopyAudit): string {
  return `${snapshot.url}: ${snapshot.language ?? "UNKNOWN"} / ${snapshot.runs.length} text nodes`;
}
