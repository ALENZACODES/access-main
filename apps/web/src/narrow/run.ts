import { auditReflow, auditTargets, REFLOW_WIDTH_PX, type Box } from './audit.js';
import { auditContrast } from './contrast.js';
import { auditFocusObscured } from './focus.js';
import { auditI18n, type Dict, type ParityOptions } from './i18n.js';
import {
  focusProbeInPage,
  MAX_ELEMENTS,
  snapshotInPage,
  textSpacingProbeInPage,
  TEXT_SPACING_CSS,
  type ElSnap,
  type FocusProbe,
  type Snapshot,
  type TextSpacingResult,
} from './inpage.js';
import { auditLanguage, auditNames } from './names.js';
import { checkOfflineReload, offlineCheckResult, type OfflineContext, type OfflinePage } from './offline.js';
import { INTERACTIVE_SELECTOR, type PageLike } from './page.js';
import { addCheck, buildRouteAudit, entriesFromFindings, makeReport, type AuditReport, type RouteAudit } from './report.js';
import { auditTargetSpacing } from './spacing.js';
import { auditTextSpacing } from './textspacing.js';

export interface RouteInputs {
  readonly snapshot: Snapshot;
  /** Left out when focus was not probed (for example in the in-app panel). */
  readonly focus?: readonly FocusProbe[];
  readonly textSpacing?: TextSpacingResult;
}

export function boxOf(e: ElSnap): Box {
  return {
    id: e.id,
    left: e.rect.left,
    right: e.rect.right,
    width: e.rect.right - e.rect.left,
    height: e.rect.bottom - e.rect.top,
  };
}

/** Turns measurements of one page into a route audit. Pure. */
export function auditSnapshot(route: string, viewportWidth: number, input: RouteInputs): RouteAudit {
  const { snapshot } = input;
  const boxes = snapshot.interactive.map(boxOf);
  const reflowFindings = auditReflow(boxes, snapshot.doc.scrollWidth, snapshot.doc.clientWidth, viewportWidth);
  const targetFindings = auditTargets(boxes);
  const mapped = entriesFromFindings([...reflowFindings, ...targetFindings]);
  const { names, labels } = auditNames(snapshot.interactive);
  const results: Parameters<typeof buildRouteAudit>[2] = {
    reflow: { checked: boxes.length + 1, entries: mapped.reflow },
    'target-size': { checked: boxes.length, entries: mapped.targets },
    'target-spacing': auditTargetSpacing(snapshot.interactive.map((e) => ({ id: e.id, ...e.rect }))),
    contrast: auditContrast(snapshot.texts),
    name: names,
    'label-in-name': labels,
    language: auditLanguage(snapshot.doc),
    ...(input.focus ? { 'focus-obscured': auditFocusObscured(input.focus) } : {}),
    ...(input.textSpacing ? { 'text-spacing': auditTextSpacing(input.textSpacing) } : {}),
  };
  return buildRouteAudit(route, viewportWidth, results, snapshot.unmeasured, snapshot.truncated);
}

export interface AuditPage extends PageLike, OfflinePage {}

export interface RunOptions {
  readonly viewportWidth?: number;
  readonly focusMax?: number;
  readonly swTimeoutMs?: number;
}

const joinUrl = (base: string, route: string): string =>
  base.replace(/\/+$/, '') + (route.startsWith('/') ? route : `/${route}`);

export async function auditRoute(
  page: AuditPage,
  baseUrl: string,
  route: string,
  opts: RunOptions = {},
): Promise<RouteAudit> {
  const width = opts.viewportWidth ?? REFLOW_WIDTH_PX;
  await page.goto(joinUrl(baseUrl, route));
  const snapshot = await page.evaluate(snapshotInPage, { selector: INTERACTIVE_SELECTOR, maxElements: MAX_ELEMENTS });
  const focus = await page.evaluate(focusProbeInPage, { selector: INTERACTIVE_SELECTOR, max: opts.focusMax ?? 60 });
  const textSpacing = await page.evaluate(textSpacingProbeInPage, { css: TEXT_SPACING_CSS, maxElements: MAX_ELEMENTS });
  return auditSnapshot(route, width, { snapshot, focus, textSpacing });
}

export interface RunInput {
  readonly page: AuditPage;
  /** Give a context to also run the offline reload check. */
  readonly context?: OfflineContext;
  readonly baseUrl: string;
  readonly routes: readonly string[];
  readonly options?: RunOptions;
  readonly i18n?: { readonly en: Dict; readonly fr: Dict; readonly options?: ParityOptions };
  readonly now: Date;
}

export async function runAudit(input: RunInput): Promise<AuditReport> {
  const width = input.options?.viewportWidth ?? REFLOW_WIDTH_PX;
  await input.page.setViewportSize({ width, height: 800 });
  const routes: RouteAudit[] = [];
  for (const route of input.routes) {
    let audit = await auditRoute(input.page, input.baseUrl, route, input.options);
    if (input.context) {
      const r = await checkOfflineReload(input.page, input.context, joinUrl(input.baseUrl, route), input.options?.swTimeoutMs);
      audit = addCheck(audit, 'offline', offlineCheckResult(route, r, input.options?.swTimeoutMs));
    }
    routes.push(audit);
  }
  if (input.i18n) {
    routes.push(buildRouteAudit('strings', null, { i18n: auditI18n(input.i18n.en, input.i18n.fr, input.i18n.options) }));
  }
  return makeReport(routes, input.now);
}

/** Audits the document the code is running in. Does not move focus or change styles. */
export function selfAudit(now: Date): AuditReport {
  const snapshot = snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: MAX_ELEMENTS });
  const loc = (globalThis as unknown as { location?: { pathname?: string } }).location;
  const route = loc?.pathname ?? '(current page)';
  return makeReport([auditSnapshot(route, snapshot.doc.innerWidth, { snapshot })], now);
}
