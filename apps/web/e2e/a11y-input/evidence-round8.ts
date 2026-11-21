import { expect, type Page } from "@playwright/test";

export interface EvidenceFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

export interface OfflineObservation {
  readonly url: string;
  readonly onlineLabel: string;
  readonly reachable: boolean;
  readonly primaryHeading: string;
  readonly recovered: boolean;
}

/**
 * Explicit evidence records must include provenance. The unknown state is a
 * first-class result and must never be replaced by a guessed accessible state.
 */
export async function inspectEvidenceRecords(page: Page): Promise<EvidenceFinding[]> {
  return page.evaluate(() => {
    const findings: EvidenceFinding[] = [];
    const records = Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-evidence-record],[data-a11y-evidence]",
    ));
    for (const [index, node] of records.entries()) {
      const target = node.id ? `#${node.id}` : `evidence[${index}]`;
      const source = node.getAttribute("data-source")?.trim();
      const licence = node.getAttribute("data-licence")?.trim();
      const date = node.getAttribute("data-observed-date")?.trim() ||
        node.getAttribute("data-date")?.trim();
      if (!source) findings.push({ code: "evidence-source", target,
        detail: "Evidence record is missing its source" });
      if (!licence) findings.push({ code: "evidence-licence", target,
        detail: "Evidence record is missing its licence" });
      const dateFormat = Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date));
      const parsed = dateFormat ? new Date(`${date}T00:00:00Z`) : null;
      const calendarValid = parsed !== null && !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === date;
      if (!calendarValid) {
        findings.push({ code: "evidence-date", target,
          detail: "Evidence record is missing a valid observation date" });
      }
      const state = node.getAttribute("data-accessibility-state") ||
        node.getAttribute("data-accessibility-status");
      if (state !== null && !["UNKNOWN", "REPORTED", "DOCUMENTED"].includes(state)) {
        findings.push({ code: "evidence-state", target,
          detail: `Unsupported accessibility state ${state}` });
      }
      const unknown = node.hasAttribute("data-a11y-unknown") || state === "UNKNOWN";
      if (unknown && node.getAttribute("data-inferred") === "true") {
        findings.push({ code: "evidence-inferred-unknown", target,
          detail: "Unknown accessibility details cannot be inferred" });
      }
      if (node.hasAttribute("data-a11y-unknown") && state !== "UNKNOWN") {
        findings.push({ code: "evidence-promoted-unknown", target,
          detail: "Marked UNKNOWN record has a conflicting state" });
      }
      const status = node.getAttribute("data-a11y-status-label");
      if (status && unknown && !/unknown|inconnu|inconnue/i.test(status)) {
        findings.push({ code: "evidence-unknown-label", target,
          detail: "Unknown evidence is represented as a known outcome" });
      }
      const quality = node.getAttribute("data-a11y-quality") ?? "";
      if (/^assumed$|^guessed$/i.test(quality)) {
        findings.push({ code: "evidence-assumed-quality", target,
          detail: "Assumptions cannot replace a recorded observation" });
      }
    }
    return findings;
  });
}

/** Inspect only opt-in localized copy, not URLs, timestamps or code labels. */
export async function inspectLocalizedCopy(page: Page): Promise<EvidenceFinding[]> {
  return page.evaluate(() => {
    if (!document.documentElement.lang.toLowerCase().startsWith("fr")) return [];
    const findings: EvidenceFinding[] = [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-a11y-localized-copy]"));
    for (const [index, node] of nodes.entries()) {
      const target = node.id ? `#${node.id}` : `copy[${index}]`;
      const text = node.textContent ?? "";
      if (text.includes("'")) findings.push({ code: "fr-curly-apostrophe", target,
        detail: "French contractions use U+2019" });
      const colon = /\S:(?=\s|\S)/u;
      if (colon.test(text) && !text.includes("\u00a0:")) findings.push({
        code: "fr-nbsp-colon", target, detail: "French colons use U+00A0",
      });
      for (const punct of [";", "!", "?"]) {
        const escaped = punct === "?" ? "\\?" : punct;
        const misplaced = new RegExp("[^\\u202f]" + escaped, "u");
        if (misplaced.test(text)) findings.push({ code: "fr-nnbsp-punctuation", target,
          detail: `French ${punct} needs U+202F` });
      }
      const opening = /«(?!\u202f)/u;
      const closing = /(?<!\u202f)»/u;
      if (opening.test(text) || closing.test(text)) findings.push({
        code: "fr-guillemets-spacing", target,
        detail: "French guillemets require U+202F inside",
      });
    }
    return findings;
  });
}

/** Check that optional offline-status metadata does not claim more than is known. */
export async function inspectOfflineClaims(page: Page): Promise<EvidenceFinding[]> {
  return page.evaluate(() => {
    const findings: EvidenceFinding[] = [];
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-offline-status]",
    ));
    for (const [index, node] of nodes.entries()) {
      const target = node.id ? `#${node.id}` : `offline[${index}]`;
      const state = node.getAttribute("data-a11y-offline-status");
      if (!state || !["available", "unavailable", "UNKNOWN"].includes(state)) {
        findings.push({ code: "offline-status-invalid", target,
          detail: `Unexpected offline state ${state}` });
      }
      if (state === "UNKNOWN" && node.getAttribute("data-offline-guessed") === "true") {
        findings.push({ code: "offline-unknown-assumed", target,
          detail: "Offline capability cannot be inferred" });
      }
      const source = node.getAttribute("data-source");
      if (state === "available" && !source?.trim()) {
        findings.push({ code: "offline-source-missing", target,
          detail: "Available offline claim lacks recorded source" });
      }
    }
    return findings;
  });
}

/** URL-preserving offline probe. Only run when a route opts into offline support. */
export async function probeWarmOfflineRoute(page: Page): Promise<OfflineObservation> {
  const context = page.context();
  const url = page.url();
  await expect(page.getByRole("main")).toHaveCount(1);
  const heading = (await page.getByRole("heading", { level: 1 }).first().textContent())?.trim() ?? "";
  let reachable = false;
  let recovered = false;
  let onlineLabel = "UNKNOWN";
  try {
    await context.setOffline(true);
    try {
      const response = await page.reload({ waitUntil: "domcontentloaded", timeout: 6_000 });
      reachable = response?.ok() ?? false;
      onlineLabel = (await page.locator("[data-a11y-offline-status]").first()
        .getAttribute("data-a11y-offline-status").catch(() => null)) ?? "UNKNOWN";
    } catch {
      reachable = false;
    }
  } finally {
    await context.setOffline(false);
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    recovered = response?.ok() ?? false;
  }
  return { url, onlineLabel, reachable, primaryHeading: heading, recovered };
}

export async function assertWarmOfflineRoute(page: Page): Promise<void> {
  const observation = await probeWarmOfflineRoute(page);
  expect(observation.primaryHeading.length).toBeGreaterThan(0);
  expect(observation.reachable, `${observation.url} warmed offline route`).toBe(true);
  expect(observation.recovered, `${observation.url} online recovery`).toBe(true);
}

/** Static audits are safe on every page and do not touch application data. */
export async function auditEvidenceRoute(page: Page): Promise<EvidenceFinding[]> {
  return [
    ...await inspectEvidenceRecords(page),
    ...await inspectLocalizedCopy(page),
    ...await inspectOfflineClaims(page),
  ];
}
