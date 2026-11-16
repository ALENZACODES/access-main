import { auditReflow, auditTargets, type Box } from './audit.js';
import { auditContrast } from './contrast.js';
import { auditCopy, auditCopyDict } from './copylint.js';
import { auditFocusObscured } from './focus.js';
import { lintHtml } from './htmllint.js';
import { auditI18n, type Dict, type ParityOptions } from './i18n.js';
import {
  focusProbeInPage,
  htmlInPage,
  MAX_ELEMENTS,
  snapshotInPage,
  textSpacingProbeInPage,
  TEXT_SPACING_CSS,
  type ElSnap,
  type FocusProbe,
  type Snapshot,
  type TextSpacingResult,
} from './inpage.js';
import { auditKeyboard, probeKeyboard, type KeyboardPage, type KeyboardProbe } from './keyboard.js';
import { auditLanguage, auditNames } from './names.js';
import { checkOfflineReload, offlineCheckResult, type OfflineContext, type OfflinePage } from './offline.js';
import { INTERACTIVE_SELECTOR, type PageLike } from './page.js';
import { auditMotion, DEFAULT_PROFILE, motionProbeInPage, type MediaOptions, type MotionResult, type Profile } from './profiles.js';
import { addCheck, buildRouteAudit, entriesFromFindings, makeReport, type AuditReport, type RouteAudit } from './report.js';
import { auditTargetSpacing } from './spacing.js';
import { auditTextSpacing } from './textspacing.js';

export interface RouteInputs {
  readonly snapshot: Snapshot;
  /** Left out when focus was not probed (for example in the in-app panel). */
  readonly focus?: readonly FocusProbe[];
  readonly textSpacing?: TextSpacingResult;
  /** Page markup for the static checks. */
  readonly html?: string;
  readonly motion?: { readonly result: MotionResult; readonly reduced: boolean };
  readonly keyboard?: KeyboardProbe;
  /** True when the browser overrides colours, so contrast cannot be judged. */
  readonly skipContrast?: boolean;
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
  const kb = input.keyboard ? auditKeyboard(input.keyboard) : null;
  const results: Parameters<typeof buildRouteAudit>[2] = {
    reflow: { checked: boxes.length + 1, entries: mapped.reflow },
    'target-size': { checked: boxes.length, entries: mapped.targets },
    'target-spacing': auditTargetSpacing(snapshot.interactive.map((e) => ({ id: e.id, ...e.rect }))),
    ...(input.skipContrast ? {} : { contrast: auditContrast(snapshot.texts) }),
    name: names,
    'label-in-name': labels,
    language: auditLanguage(snapshot.doc),
    copy: auditCopy(snapshot.texts),
    ...(input.focus ? { 'focus-obscured': auditFocusObscured(input.focus) } : {}),
    ...(input.textSpacing ? { 'text-spacing': auditTextSpacing(input.textSpacing) } : {}),
    ...(input.html !== undefined ? { 'static-html': lintHtml(input.html) } : {}),
    ...(input.motion ? { motion: auditMotion(input.motion.result, input.motion.reduced) } : {}),
    ...(kb ? { keyboard: kb.keyboard, 'focus-visible': kb.focusVisible } : {}),
  };
  return buildRouteAudit(route, viewportWidth, results, snapshot.unmeasured, snapshot.truncated);
}

/** Playwright's Page fits this. emulateMedia and keyboard are optional. */
export interface FullPage extends PageLike, OfflinePage {
  emulateMedia?(options: MediaOptions): Promise<unknown>;
  readonly keyboard?: { press(key: string): Promise<unknown> };
}

export type AuditPage = FullPage;

export interface RunOptions {
  readonly viewportWidth?: number;
  readonly focusMax?: number;
  readonly swTimeoutMs?: number;
  /** Tab presses for the keyboard walk. 0 turns it off. */
  readonly keyboardMax?: number;
}

const joinUrl = (base: string, route: string): string =>
  base.replace(/\/+$/, '') + (route.startsWith('/') ? route : `/${route}`);

export interface LoadedOptions extends RunOptions {
  readonly profile?: Profile;
  /** Walk the page with the Tab key. Only the first profile of a route does this. */
  readonly keyboard?: boolean;
}

/** Audits the page the browser is on now. Use after goto or setContent. */
export async function auditLoadedPage(page: FullPage, label: string, opts: LoadedOptions = {}): Promise<RouteAudit> {
  const profile = opts.profile ?? DEFAULT_PROFILE;
  const width = opts.viewportWidth ?? profile.viewport.width;
  const snapshot = await page.evaluate(snapshotInPage, { selector: INTERACTIVE_SELECTOR, maxElements: MAX_ELEMENTS });
  const html = await page.evaluate(htmlInPage, null);
  const motion = await page.evaluate(motionProbeInPage, null);
  const focus = await page.evaluate(focusProbeInPage, { selector: INTERACTIVE_SELECTOR, max: opts.focusMax ?? 60 });
  const textSpacing = await page.evaluate(textSpacingProbeInPage, { css: TEXT_SPACING_CSS, maxElements: MAX_ELEMENTS });
  const kbMax = opts.keyboardMax ?? 80;
  const keyboard =
    opts.keyboard !== false && kbMax > 0 && page.keyboard
      ? await probeKeyboard(page as KeyboardPage, INTERACTIVE_SELECTOR, kbMax)
      : undefined;
  return auditSnapshot(label, width, {
    snapshot,
    focus,
    textSpacing,
    html,
    motion: { result: motion, reduced: profile.media.reducedMotion === 'reduce' },
    ...(keyboard ? { keyboard } : {}),
    ...(profile.skipContrast ? { skipContrast: true } : {}),
  });
}

export async function auditRoute(page: FullPage, baseUrl: string, route: string, opts: LoadedOptions = {}): Promise<RouteAudit> {
  await page.goto(joinUrl(baseUrl, route));
  return auditLoadedPage(page, route, opts);
}

export interface RunInput {
  readonly page: FullPage;
  /** Give a context to also run the offline reload check. */
  readonly context?: OfflineContext;
  readonly baseUrl: string;
  readonly routes: readonly string[];
  readonly options?: RunOptions;
  /** Defaults to the 320px profile only. */
  readonly profiles?: readonly Profile[];
  readonly i18n?: { readonly en: Dict; readonly fr: Dict; readonly options?: ParityOptions };
  /** Extra routes already audited elsewhere, such as HTML files or data files. */
  readonly extra?: readonly RouteAudit[];
  readonly now: Date;
}

export async function runAudit(input: RunInput): Promise<AuditReport> {
  const profiles = input.profiles && input.profiles.length > 0 ? input.profiles : [DEFAULT_PROFILE];
  const routes: RouteAudit[] = [];
  for (const route of input.routes) {
    for (let p = 0; p < profiles.length; p++) {
      const profile = profiles[p] as Profile;
      const width = input.options?.viewportWidth ?? profile.viewport.width;
      await input.page.setViewportSize({ width, height: profile.viewport.height });
      if (input.page.emulateMedia) await input.page.emulateMedia(profile.media);
      await input.page.goto(joinUrl(input.baseUrl, route));
      const label = profiles.length > 1 ? `${route} [${profile.id}]` : route;
      let audit = await auditLoadedPage(input.page, label, { ...input.options, profile, keyboard: p === 0 });
      if (input.context && p === 0) {
        const r = await checkOfflineReload(input.page, input.context, joinUrl(input.baseUrl, route), input.options?.swTimeoutMs);
        audit = addCheck(audit, 'offline', offlineCheckResult(route, r, input.options?.swTimeoutMs));
      }
      routes.push(audit);
    }
  }
  if (input.i18n) {
    routes.push(
      buildRouteAudit('strings', null, {
        i18n: auditI18n(input.i18n.en, input.i18n.fr, input.i18n.options),
        copy: addCopy(input.i18n.en, input.i18n.fr),
      }),
    );
  }
  routes.push(...(input.extra ?? []));
  return makeReport(routes, input.now);
}

function addCopy(en: Dict, fr: Dict): ReturnType<typeof auditCopyDict> {
  const a = auditCopyDict(Object.fromEntries(Object.entries(en).map(([k, v]) => [`en:${k}`, v])));
  const b = auditCopyDict(Object.fromEntries(Object.entries(fr).map(([k, v]) => [`fr:${k}`, v])));
  return { checked: a.checked + b.checked, entries: [...a.entries, ...b.entries] };
}

/** Audits the document the code is running in. Does not move focus or change styles. */
export function selfAudit(now: Date): AuditReport {
  const snapshot = snapshotInPage({ selector: INTERACTIVE_SELECTOR, maxElements: MAX_ELEMENTS });
  const html = htmlInPage(null);
  const loc = (globalThis as unknown as { location?: { pathname?: string } }).location;
  const route = loc?.pathname ?? '(current page)';
  return makeReport([auditSnapshot(route, snapshot.doc.innerWidth, { snapshot, html })], now);
}
