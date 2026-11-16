import { expect, type Page } from "@playwright/test";

export interface PreferenceFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

/**
 * Text-only enlargement is approximated by browser font-size emulation.
 * It detects visible clipping and overlap of key controls after enlargement;
 * this is an aid, not a substitution for browser zoom review.
 */
export async function auditTextEnlargement(page: Page): Promise<PreferenceFinding[]> {
  const findings: PreferenceFinding[] = [];
  const before = await page.evaluate(() => {
    const root = document.documentElement;
    return { inlineFont: root.style.fontSize, scrollWidth: root.scrollWidth };
  });
  try {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const result = await page.evaluate(() => {
      const findings: { code: string; target: string; detail: string }[] = [];
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(
        "button, a[href], label, input, select, textarea, h1, h2, h3",
      ));
      for (const [index, element] of candidates.entries()) {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" ||
            element.closest("[hidden],[inert]")) continue;
        const bounds = element.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) continue;
        const target = element.id || `${element.localName}[${index}]`;
        if (element.scrollWidth > element.clientWidth + 2 &&
            style.overflowX === "hidden" && style.textOverflow !== "ellipsis") {
          findings.push({ code: "text-clipped-horizontally", target, detail: String(element.scrollWidth) });
        }
        if (element.scrollHeight > element.clientHeight + 2 && style.overflowY === "hidden") {
          findings.push({ code: "text-clipped-vertically", target, detail: String(element.scrollHeight) });
        }
      }
      return findings;
    });
    findings.push(...result);
  } finally {
    await page.evaluate((font) => { document.documentElement.style.fontSize = font; }, before.inlineFont);
  }
  return findings;
}

/**
 * A page that explicitly requests reduced motion must respect the preference
 * for opt-in decorative animation targets. Native progress affordances may
 * remain animated because stopping them can misrepresent an active operation.
 */
export async function auditReducedMotion(page: Page): Promise<PreferenceFinding[]> {
  const findings: PreferenceFinding[] = [];
  const original = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const issues = await page.evaluate(() => {
      const issues: { code: string; target: string; detail: string }[] = [];
      const elements = document.querySelectorAll<HTMLElement>("[data-a11y-decorative-motion]");
      for (const [index, element] of Array.from(elements).entries()) {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const target = element.id || `motion[${index}]`;
        const durations = style.animationDuration.split(",").map((value) => value.trim());
        const iteration = style.animationIterationCount.split(",").map((value) => value.trim());
        for (let i = 0; i < durations.length; i += 1) {
          const duration = durations[i];
          const seconds = duration.endsWith("ms") ? Number.parseFloat(duration) / 1000 :
            Number.parseFloat(duration);
          const iterationCount = iteration[i] ?? iteration[0];
          if (seconds > 0.1 && iterationCount === "infinite") {
            issues.push({ code: "continuous-decorative-motion", target, detail: duration });
          }
        }
        const transition = style.transitionDuration.split(",").map((value) => value.trim());
        if (transition.some((duration) => {
          const time = Number.parseFloat(duration);
          return duration.endsWith("ms") ? time > 100 : time > 0.1;
        })) {
          issues.push({ code: "long-decorative-transition", target, detail: style.transitionDuration });
        }
      }
      return issues;
    });
    findings.push(...issues);
  } finally {
    await page.emulateMedia({ reducedMotion: original ? "reduce" : "no-preference" });
  }
  return findings;
}

export async function assertInputPreferences(page: Page): Promise<void> {
  const text = await auditTextEnlargement(page);
  expect(text, "Enlarged text must not be clipped").toEqual([]);
  const motion = await auditReducedMotion(page);
  expect(motion, "Reduced-motion preference").toEqual([]);
}
