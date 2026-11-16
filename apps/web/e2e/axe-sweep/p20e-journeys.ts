/**
 * Stateful audit primitives: route transitions, dialogs, search, filters,
 * language switching, evidence persistence and backward navigation.
 * The browser spec uses these checks without writing application data.
 */
import type { Locator, Page } from "@playwright/test";
import type { AuditContext, Locale, Problem, StatusRecord } from "./p20e-policy";
import { isDay, knowledge, normalizeLocale, problem, safeStatus } from "./p20e-policy";
import { collectBrowserSnapshot } from "./p20e-browser";
export interface JourneyStep {
  readonly name: string;
  readonly pageBefore: string;
  readonly pageAfter: string;
  readonly languageBefore: string | null;
  readonly languageAfter: string | null;
  readonly titleBefore: string;
  readonly titleAfter: string;
  readonly mainBefore: string;
  readonly mainAfter: string;
  readonly focusedName: string | null;
  readonly errors: readonly string[];
}
export interface EvidenceTransition {
  readonly before: readonly StatusRecord[];
  readonly after: readonly StatusRecord[];
  readonly sourcePage: string;
  readonly destinationPage: string;
}
export interface DialogState {
  readonly open: boolean;
  readonly count: number;
  readonly accessibleName: string;
  readonly focusedInside: boolean;
  readonly backdropInert: boolean;
  readonly scrollLocked: boolean;
}
export interface SearchState {
  readonly query: string;
  readonly results: readonly string[];
  readonly statusText: string;
  readonly busy: boolean;
  readonly location: string;
}
export interface LocaleTransition {
  readonly before: Locale;
  readonly after: Locale;
  readonly href: string;
  readonly htmlLang: string;
  readonly heading: string;
  readonly evidence: readonly StatusRecord[];
}
export interface HistoryTransition {
  readonly original: string;
  readonly destination: string;
  readonly returned: string;
  readonly title: string;
  readonly language: string;
}
export interface FilterState {
  readonly selected: readonly string[];
  readonly resultCount: number;
  readonly ariaBusy: boolean;
  readonly status: string;
}
export function assertJourneyStep(step: JourneyStep, ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  if (step.errors.length > 0) {
    for (const error of step.errors) result.push(problem("journey-console", ctx, step.name, error));
  }
  if (!step.pageAfter || step.pageAfter === "about:blank") {
    result.push(problem("journey-navigation", ctx, step.name, "Journey ended without a document."));
  }
  if (!step.titleAfter.trim()) {
    result.push(problem("journey-title", ctx, step.name, "Destination has no title."));
  }
  if (!step.mainAfter.trim()) {
    result.push(problem("journey-main", ctx, step.name, "Destination has no readable main content."));
  }
  if (normalizeLocale(step.languageAfter) !== ctx.locale) {
    result.push(problem("journey-locale", ctx, step.name, "Destination language differs from the expected locale."));
  }
  if (step.focusedName !== null && !step.focusedName.trim()) {
    result.push(problem("journey-focus", ctx, step.name, "Destination focus has no accessible name."));
  }
  return result;
}
export function evidenceTransitionProblems(transition: EvidenceTransition, ctx: AuditContext, asOf: string): Problem[] {
  const result: Problem[] = [];
  const before = new Map(transition.before.map((row) => [row.id, row]));
  const after = new Map(transition.after.map((row) => [row.id, row]));
  for (const [id, prior] of before) {
    const current = after.get(id);
    if (!current) continue;
    const priorStatus = safeStatus(prior, asOf);
    const currentStatus = safeStatus(current, asOf);
    if (priorStatus === "UNKNOWN" && currentStatus !== "UNKNOWN") {
      if (current.source === prior.source && current.observedAt === prior.observedAt) {
        result.push(problem("journey-evidence-promotion", ctx, id, "An uncertain observation changed to a supported state without new source details."));
      }
    }
    if (priorStatus !== "UNKNOWN" && currentStatus !== "UNKNOWN" && priorStatus !== currentStatus) {
      if (current.observedAt === prior.observedAt && current.source === prior.source) {
        result.push(problem("journey-evidence-conflict", ctx, id, "An observation changed outcomes without a changed source or date."));
      }
    }
    if (prior.source && !current.source && knowledge(current.status) !== "UNKNOWN") {
      result.push(problem("journey-source-loss", ctx, id, "Navigation removed attribution from a stated accessibility outcome."));
    }
  }
  return result;
}
export function dialogProblems(state: DialogState, ctx: AuditContext): Problem[] {
  if (!state.open) return [];
  const result: Problem[] = [];
  if (state.count > 1) result.push(problem("dialog-stacking", ctx, "dialog", "Several modal dialogs are open at once."));
  if (!state.accessibleName.trim()) result.push(problem("dialog-name", ctx, "dialog", "Open dialog lacks an accessible name."));
  if (!state.focusedInside) result.push(problem("dialog-focus", ctx, "dialog", "Keyboard focus is outside the modal dialog."));
  if (!state.backdropInert) result.push(problem("dialog-background", ctx, "dialog", "Background can receive keyboard focus while a modal is open."));
  return result;
}
export function searchProblems(previous: SearchState, next: SearchState, ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  if (next.busy && !next.statusText.trim()) {
    result.push(problem("search-busy", ctx, "results", "Search is busy without a readable status message."));
  }
  if (previous.query !== next.query && previous.results.join("\0") !== next.results.join("\0") && !next.statusText.trim()) {
    result.push(problem("search-update", ctx, "results", "Changed search results were not announced."));
  }
  if (next.results.some((item) => !item.trim())) {
    result.push(problem("search-result-name", ctx, "results", "A search result lacks a readable name."));
  }
  return result;
}
export function filterProblems(before: FilterState, after: FilterState, ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  const changedSelection = before.selected.join("|") !== after.selected.join("|");
  if (changedSelection && before.resultCount !== after.resultCount && !after.status.trim()) {
    result.push(problem("filter-announcement", ctx, "filters", "Filter result changes were not announced."));
  }
  if (after.ariaBusy && !after.status.trim()) {
    result.push(problem("filter-busy", ctx, "filters", "Filter remains busy without a status."));
  }
  return result;
}
export function localeTransitionProblems(state: LocaleTransition, ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  if (state.before === state.after) result.push(problem("switch-no-change", ctx, state.href, "Locale switch did not change language."));
  if (normalizeLocale(state.htmlLang) !== state.after) {
    result.push(problem("switch-document", ctx, state.href, "New document language differs from the chosen locale."));
  }
  if (!state.heading.trim()) result.push(problem("switch-heading", ctx, state.href, "Localized destination has no heading."));
  for (const record of state.evidence) {
    if (knowledge(record.status) !== "UNKNOWN" && (!record.source?.trim() || !isDay(record.observedAt))) {
      result.push(problem("switch-evidence", ctx, record.id, "Switching language removed evidence attribution."));
    }
  }
  return result;
}
export function historyProblems(state: HistoryTransition, ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  if (state.returned !== state.original) {
    result.push(problem("history-return", ctx, state.returned, "Back navigation did not restore the prior route."));
  }
  if (!state.title.trim()) result.push(problem("history-title", ctx, state.returned, "Returned document lacks a title."));
  if (normalizeLocale(state.language) !== ctx.locale) {
    result.push(problem("history-language", ctx, state.returned, "Back navigation changed the document language."));
  }
  return result;
}
async function mainText(page: Page): Promise<string> {
  return page.locator("main,[role='main']").first().textContent().then((value) => value?.trim() ?? "").catch(() => "");
}
async function focusName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    return element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("title") || "";
  });
}
export async function inspectNavigation(page: Page, name: string, navigate: () => Promise<void>): Promise<JourneyStep> {
  const pageBefore = page.url();
  const languageBefore = await page.locator("html").getAttribute("lang");
  const titleBefore = await page.title();
  const mainBefore = await mainText(page);
  const errors: string[] = [];
  const onError = (error: Error): void => { errors.push(error.message); };
  page.on("pageerror", onError);
  try { await navigate(); } finally { page.off("pageerror", onError); }
  const pageAfter = page.url();
  const languageAfter = await page.locator("html").getAttribute("lang");
  const titleAfter = await page.title();
  const mainAfter = await mainText(page);
  const focusedName = await focusName(page);
  return { name, pageBefore, pageAfter, languageBefore, languageAfter,
    titleBefore, titleAfter, mainBefore, mainAfter, focusedName, errors };
}
export async function inspectDialog(page: Page): Promise<DialogState> {
  return page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll("dialog[open],[role='dialog'][aria-modal='true']"));
    const active = dialogs[dialogs.length - 1];
    if (!active) {
      return { open: false, count: 0, accessibleName: "", focusedInside: false, backdropInert: false, scrollLocked: false };
    }
    const labelledBy = active.getAttribute("aria-labelledby");
    const name = active.getAttribute("aria-label") ||
      (labelledBy ? document.getElementById(labelledBy)?.textContent : null) || "";
    const focus = document.activeElement;
    const backdropInert = Array.from(document.body.children).filter((child) => !child.contains(active)).every((child) =>
      child.hasAttribute("inert") || child.getAttribute("aria-hidden") === "true" ||
      active instanceof HTMLDialogElement && active.matches(":modal"));
    return {
      open: true, count: dialogs.length, accessibleName: name.trim(),
      focusedInside: Boolean(focus && active.contains(focus)), backdropInert,
      scrollLocked: getComputedStyle(document.body).overflow === "hidden",
    };
  });
}
export async function inspectSearch(page: Page, input: Locator): Promise<SearchState> {
  const query = await input.inputValue();
  return page.evaluate((value) => {
    const nodes = Array.from(document.querySelectorAll("[data-search-result],[role='listbox'] [role='option'],[data-result-id]"));
    const status = document.querySelector("[role='status'],[aria-live='polite']");
    return {
      query: value, results: nodes.map((node) => (node.textContent ?? "").trim()),
      statusText: status?.textContent?.trim() ?? "", busy: document.querySelector("[aria-busy='true']") !== null,
      location: location.href,
    };
  }, query);
}
export async function inspectFilters(page: Page): Promise<FilterState> {
  return page.evaluate(() => {
    const selected = Array.from(document.querySelectorAll("[aria-pressed='true'],[aria-checked='true'],input[type='checkbox']:checked"))
      .map((node) => node.getAttribute("aria-label") || node.textContent?.trim() || (node as HTMLInputElement).name || "");
    const results = document.querySelectorAll("[data-result-id],[data-search-result]");
    const status = document.querySelector("[role='status'],[aria-live='polite']");
    return { selected, resultCount: results.length, ariaBusy: document.querySelector("[aria-busy='true']") !== null,
      status: status?.textContent?.trim() ?? "" };
  });
}
export async function inspectLocaleSwitch(page: Page, target: Locale): Promise<LocaleTransition> {
  const current = normalizeLocale(await page.locator("html").getAttribute("lang")) ?? "en";
  const selector = `a[hreflang='${target}'],a[lang='${target}'],[data-locale='${target}']`;
  const link = page.locator(selector).first();
  const href = await link.getAttribute("href") ?? "";
  await link.click();
  await page.waitForLoadState("domcontentloaded");
  const snapshot = await collectBrowserSnapshot(page, target);
  return { before: current, after: target, href,
    htmlLang: snapshot.metadata.lang,
    heading: snapshot.metadata.headings.find((item) => item.level === 1 && !item.hidden)?.text ?? "",
    evidence: snapshot.evidence };
}
export async function inspectHistory(page: Page, destination: string): Promise<HistoryTransition> {
  const original = page.url();
  await page.goto(destination, { waitUntil: "domcontentloaded" });
  const actualDestination = page.url();
  await page.goBack({ waitUntil: "domcontentloaded" });
  return { original, destination: actualDestination, returned: page.url(),
    title: await page.title(), language: await page.locator("html").getAttribute("lang") ?? "" };
}
export async function inspectEvidenceAcrossNavigation(
  page: Page, locale: Locale, action: () => Promise<void>,
): Promise<EvidenceTransition> {
  const before = await collectBrowserSnapshot(page, locale);
  await action();
  const after = await collectBrowserSnapshot(page, locale);
  return { before: before.evidence, after: after.evidence,
    sourcePage: before.context.page, destinationPage: after.context.page };
}
