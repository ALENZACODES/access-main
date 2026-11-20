import { auditReflow, auditTargets, type Box } from './audit.js';
import { auditConsistency, type RouteFacts } from './consistency.js';
import { siteResults } from './sitefiles.js';
import { readSite, type SitePage } from './sitepages.js';
import { auditForms } from './forms.js';
import { auditAuth } from './auth.js';
import { auditStatus } from './status.js';
import { auditMedia } from './media.js';
import { auditClipping, auditFixedSpace } from './layoutspace.js';
import { semanticsInPage, type SemanticFacts } from './semantics.js';
import { auditLangParts, langBlocksInPage, type LangBlocks } from './langparts.js';
import { auditBypass } from './bypass.js';
import { auditFrames } from './frames.js';
import { auditImages } from './images.js';
import { auditLinks } from './links.js';
import { auditPurpose } from './purpose.js';
import { structureInPage, type StructureFacts } from './structure.js';
import { auditLookalike } from './lookalike.js';
import { auditAria } from './aria.js';
import { auditCss } from './cssrules.js';
import { auditHrefs } from './hrefs.js';
import { auditObsolete } from './obsolete.js';
import { auditReferences } from './references.js';
import { auditConstraints } from './constraints.js';
import { auditLists } from './lists.js';
import { auditSectioning } from './sectioning.js';
import { auditStates } from './states.js';
import { auditSymbols } from './symbols.js';
import { auditDocument } from './docmeta.js';
import { auditIdentifiers } from './identifiers.js';
import { auditLabels } from './labels.js';
import { auditNameWords } from './namewords.js';
import { auditTableMarkup } from './tablemarkup.js';
import { auditFocusables } from './focusables.js';
import { auditImageMarkup } from './imagemarkup.js';
import { auditLocaleMarkup } from './localemarkup.js';
import { auditOverlays } from './overlays.js';
import { auditTyping } from './typing.js';
import { auditRegions, regionsInPage, type RegionFacts } from './regions.js';
import { auditGenerated, generatedInPage, type GeneratedFacts } from './generated.js';
import { auditHandlers } from './handlers.js';
import { auditHeadings } from './headings.js';
import { auditLocale } from './locale.js';
import { auditOrder, orderInPage, type OrderFacts } from './order.js';
import { auditPlain } from './plain.js';
import { proseInPage, MAX_BLOCK_CHARS, type ProseFacts } from './prose.js';
import { auditSensory } from './sensory.js';
import { auditTextZoom, TEXT_ZOOM_CSS } from './textzoom.js';
import { auditTypography, typographyInPage, type TypographyFacts } from './typography.js';
import { auditTables } from './tables.js';
import { auditTiming } from './timing.js';
import { auditContrastWithFixes } from './contrast-fix.js';
import { auditCopy, auditCopyDict } from './copylint.js';
import { auditFocusObscured } from './focus.js';
import { lintHtml } from './htmllint.js';
import { auditResources, resourcesInPage, type ResourceFacts } from './hostlint.js';
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
import { auditParity, controlKeys, type View } from './parity.js';
import { auditControlBoundaries, auditDragging, auditLinkCues, HELP_WORDS, probesInPage, type PageFacts } from './probes.js';
import { auditMotion, DEFAULT_PROFILE, motionProbeInPage, type MediaOptions, type MotionResult, type Profile } from './profiles.js';
import { auditWeight, weightInPage, type WeightFacts, type WeightOptions } from './weight.js';
import { addCheck, buildRouteAudit, entriesFromFindings, makeReport, type AuditReport, type RouteAudit } from './report.js';
import { auditTargetSpacing } from './spacing.js';
import { auditTextSpacing } from './textspacing.js';

/** Limits for the running-text collector. */
const PROSE_ARGS = { maxElements: MAX_ELEMENTS, maxBlocks: 300, maxChars: MAX_BLOCK_CHARS } as const;

/** What the layout checks read from the page. */
export interface LayoutFacts {
  readonly typography: TypographyFacts;
  readonly order: OrderFacts;
  readonly generated: GeneratedFacts;
  readonly regions: RegionFacts;
}

/** Collects the layout facts in the page that is running the code. Reads only. Not for page.evaluate: use the three functions it calls. */
export function layoutInPage(): LayoutFacts {
  return {
    typography: typographyInPage({ maxElements: MAX_ELEMENTS, maxBlocks: 300 }),
    order: orderInPage({ maxElements: MAX_ELEMENTS, selector: INTERACTIVE_SELECTOR }),
    generated: generatedInPage({ maxElements: MAX_ELEMENTS, maxItems: 200 }),
    regions: regionsInPage({ maxElements: MAX_ELEMENTS, selector: INTERACTIVE_SELECTOR }),
  };
}

export interface RouteInputs {
  readonly snapshot: Snapshot;
  /** Left out when focus was not probed (for example in the in-app panel). */
  readonly focus?: readonly FocusProbe[];
  readonly textSpacing?: TextSpacingResult;
  /** Page markup for the static checks. */
  readonly html?: string;
  readonly motion?: { readonly result: MotionResult; readonly reduced: boolean };
  readonly keyboard?: KeyboardProbe;
  /** Link, field and dragging facts, and the page title and navigation. */
  readonly facts?: PageFacts;
  /** What the page loaded, for the external host check. */
  readonly resources?: ResourceFacts;
  readonly weight?: { readonly facts: WeightFacts; readonly options: WeightOptions };
  /** Fields, sign-in, status, media, fixed bars and clipped text. */
  readonly semantics?: SemanticFacts;
  /** Text blocks with the language in force on each. */
  readonly langBlocks?: LangBlocks;
  /** Tables, frames, timers, landmarks and headings. */
  readonly structure?: StructureFacts;
  /** Running text, for plain language, date and number formats and instructions that need sight or hearing. */
  readonly prose?: ProseFacts;
  /** Text layout, visual order and CSS generated text. */
  readonly layout?: LayoutFacts;
  /** Boxes that cut text off when the base text size is doubled. */
  readonly textZoom?: TextSpacingResult;
  /** Host patterns the team allowed. */
  readonly allowHosts?: readonly string[];
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
    ...(input.skipContrast ? {} : { contrast: auditContrastWithFixes(snapshot.texts) }),
    name: names,
    'label-in-name': labels,
    language: auditLanguage(snapshot.doc),
    copy: auditCopy(snapshot.texts),
    ...(input.focus ? { 'focus-obscured': auditFocusObscured(input.focus) } : {}),
    ...(input.textSpacing ? { 'text-spacing': auditTextSpacing(input.textSpacing) } : {}),
    ...(input.html !== undefined ? { 'static-html': lintHtml(input.html) } : {}),
    ...(input.motion ? { motion: auditMotion(input.motion.result, input.motion.reduced) } : {}),
    ...(input.weight ? { weight: auditWeight(input.weight.facts, input.weight.options) } : {}),
    ...(input.semantics ? semanticResults(input.semantics) : {}),
    ...(input.langBlocks ? { 'lang-parts': auditLangParts(input.langBlocks) } : {}),
    ...(input.structure ? structureResults(input.structure) : {}),
    ...(input.prose ? proseResults(input.prose) : {}),
    ...(input.layout ? layoutResults(input.layout) : {}),
    ...(input.html !== undefined ? { handlers: auditHandlers(input.html), lookalike: auditLookalike(input.html), ...markupResults(input.html) } : {}),
    ...(input.textZoom ? { 'text-zoom': auditTextZoom(input.textZoom) } : {}),
    ...(input.resources ? { external: auditResources(input.resources, input.allowHosts ? { allow: input.allowHosts } : {}) } : {}),
    ...(kb ? { keyboard: kb.keyboard, 'focus-visible': kb.focusVisible } : {}),
    ...(input.facts
      ? {
          dragging: auditDragging(input.facts.draggables),
          ...(input.skipContrast ? {} : { 'link-cue': auditLinkCues(input.facts.links), 'non-text-contrast': auditControlBoundaries(input.facts.controls) }),
        }
      : {}),
  };
  return buildRouteAudit(route, viewportWidth, results, snapshot.unmeasured, snapshot.truncated);
}

/** The checks that read the text of the markup: roles, references, link destinations, page styles, old markup, states, lists, page parts, form limits, symbols, document settings, table attributes, labels, ids and the words in names. */
export function markupResults(html: string): Parameters<typeof buildRouteAudit>[2] {
  return {
    aria: auditAria(html),
    references: auditReferences(html),
    hrefs: auditHrefs(html),
    css: auditCss(html),
    obsolete: auditObsolete(html),
    states: auditStates(html),
    lists: auditLists(html),
    sectioning: auditSectioning(html),
    constraints: auditConstraints(html),
    symbols: auditSymbols(html),
    document: auditDocument(html),
    'table-markup': auditTableMarkup(html),
    labels: auditLabels(html),
    identifiers: auditIdentifiers(html),
    'name-words': auditNameWords(html),
    typing: auditTyping(html),
    overlays: auditOverlays(html),
    'image-markup': auditImageMarkup(html),
    focusables: auditFocusables(html),
    'locale-markup': auditLocaleMarkup(html),
  };
}

/** The checks that read how the page is laid out. */
export function layoutResults(f: LayoutFacts): Parameters<typeof buildRouteAudit>[2] {
  return { typography: auditTypography(f.typography), order: auditOrder(f.order), generated: auditGenerated(f.generated), regions: auditRegions(f.regions) };
}

/** The checks that read the running text of a page. */
export function proseResults(f: ProseFacts): Parameters<typeof buildRouteAudit>[2] {
  return { plain: auditPlain(f), locale: auditLocale(f), sensory: auditSensory(f), headings: auditHeadings(f) };
}

/** The checks that read the structure facts of a page. */
export function structureResults(f: StructureFacts): Parameters<typeof buildRouteAudit>[2] {
  return {
    timing: auditTiming(f.timing),
    tables: auditTables(f.tables),
    frames: auditFrames(f.frames),
    bypass: auditBypass(f.bypass),
    links: auditLinks(f.links),
    images: auditImages(f.images),
  };
}

/** The checks that read the semantic facts of a page. */
export function semanticResults(f: SemanticFacts): Parameters<typeof buildRouteAudit>[2] {
  return {
    forms: auditForms(f.fields, f.requiredNote),
    purpose: auditPurpose(f.fields),
    auth: auditAuth(f),
    status: auditStatus(f),
    media: auditMedia(f.media),
    'fixed-space': auditFixedSpace(f.fixed, f.viewport),
    clipping: auditClipping(f.clips),
  };
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
  /** Weight limits. */
  readonly weight?: WeightOptions;
}

const joinUrl = (base: string, route: string): string =>
  base.replace(/\/+$/, '') + (route.startsWith('/') ? route : `/${route}`);

export interface LoadedOptions extends RunOptions {
  readonly profile?: Profile;
  /** Host patterns the team allowed for the external host check. */
  readonly allowHosts?: readonly string[];
  /** Limits for the weight check. */
  readonly weight?: WeightOptions;
  /** Walk the page with the Tab key. Only the first profile of a route does this. */
  readonly keyboard?: boolean;
}

export interface PageResult {
  readonly audit: RouteAudit;
  readonly facts: PageFacts;
  /** Keys of the named controls on the page, for the cross-view check. */
  readonly controls: readonly string[];
  /** The markup of the page as the browser holds it, for the checks that compare pages. */
  readonly html: string;
}

/** Audits the page the browser is on now. Use after goto or setContent. */
export async function auditLoadedPage(page: FullPage, label: string, opts: LoadedOptions = {}): Promise<RouteAudit> {
  return (await collectLoadedPage(page, label, opts)).audit;
}

/** Like auditLoadedPage, and also returns the facts the cross-page checks read. */
export async function collectLoadedPage(page: FullPage, label: string, opts: LoadedOptions = {}): Promise<PageResult> {
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
  const facts = await page.evaluate(probesInPage, { maxElements: MAX_ELEMENTS, helpPattern: HELP_WORDS.source });
  const resources = await page.evaluate(resourcesInPage, { max: 400 });
  const weightFacts = await page.evaluate(weightInPage, { max: 400 });
  const semantics = await page.evaluate(semanticsInPage, { maxElements: MAX_ELEMENTS });
  const langBlocks = await page.evaluate(langBlocksInPage, { maxElements: MAX_ELEMENTS, maxBlocks: 300 });
  const structure = await page.evaluate(structureInPage, { maxElements: MAX_ELEMENTS });
  const prose = await page.evaluate(proseInPage, PROSE_ARGS);
  const textZoom = await page.evaluate(textSpacingProbeInPage, { css: TEXT_ZOOM_CSS, maxElements: MAX_ELEMENTS });
  // Each in-page function is sent to the browser on its own, so they cannot call one another.
  const layout: LayoutFacts = {
    typography: await page.evaluate(typographyInPage, { maxElements: MAX_ELEMENTS, maxBlocks: 300 }),
    order: await page.evaluate(orderInPage, { maxElements: MAX_ELEMENTS, selector: INTERACTIVE_SELECTOR }),
    generated: await page.evaluate(generatedInPage, { maxElements: MAX_ELEMENTS, maxItems: 200 }),
    regions: await page.evaluate(regionsInPage, { maxElements: MAX_ELEMENTS, selector: INTERACTIVE_SELECTOR }),
  };
  const audit = auditSnapshot(label, width, {
    snapshot,
    facts,
    resources,
    weight: { facts: weightFacts, options: opts.weight ?? {} },
    semantics,
    langBlocks,
    structure,
    prose,
    layout,
    textZoom,
    ...(opts.allowHosts ? { allowHosts: opts.allowHosts } : {}),
    focus,
    textSpacing,
    html,
    motion: { result: motion, reduced: profile.media.reducedMotion === 'reduce' },
    ...(keyboard ? { keyboard } : {}),
    ...(profile.skipContrast ? { skipContrast: true } : {}),
  });
  return { audit, facts, controls: controlKeys(snapshot.interactive), html };
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
  /** Host patterns the team allowed for the external host check. */
  readonly allowHosts?: readonly string[];
  readonly now: Date;
}

export async function runAudit(input: RunInput): Promise<AuditReport> {
  const profiles = input.profiles && input.profiles.length > 0 ? input.profiles : [DEFAULT_PROFILE];
  const routes: RouteAudit[] = [];
  const pageFacts: RouteFacts[] = [];
  const sitePages: SitePage[] = [];
  const views = new Map<string, { index: number; views: View[] }>();
  for (const route of input.routes) {
    for (let p = 0; p < profiles.length; p++) {
      const profile = profiles[p] as Profile;
      const width = input.options?.viewportWidth ?? profile.viewport.width;
      await input.page.setViewportSize({ width, height: profile.viewport.height });
      if (input.page.emulateMedia) await input.page.emulateMedia(profile.media);
      await input.page.goto(joinUrl(input.baseUrl, route));
      const label = profiles.length > 1 ? `${route} [${profile.id}]` : route;
      const got = await collectLoadedPage(input.page, label, { ...input.options, profile, keyboard: p === 0, ...(input.allowHosts ? { allowHosts: input.allowHosts } : {}) });
      let audit = got.audit;
      if (p === 0) {
        pageFacts.push({ route, facts: got.facts });
        sitePages.push({ route, html: got.html });
        views.set(route, { index: routes.length, views: [] });
      }
      views.get(route)?.views.push({ profile: profile.id, keys: got.controls });
      if (input.context && p === 0) {
        const r = await checkOfflineReload(input.page, input.context, joinUrl(input.baseUrl, route), input.options?.swTimeoutMs);
        audit = addCheck(audit, 'offline', offlineCheckResult(route, r, input.options?.swTimeoutMs));
      }
      routes.push(audit);
    }
  }
  for (const v of views.values()) {
    if (v.views.length < 2) continue;
    const base = routes[v.index];
    if (base) routes[v.index] = addCheck(base, 'parity', auditParity(v.views));
  }
  if (pageFacts.length >= 2) {
    // The consistency check uses what the browser measured. The two checks that compare markup come after it.
    routes.push(buildRouteAudit('site', null, { consistency: auditConsistency(pageFacts), ...siteResults(readSite(sitePages)) }));
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
  const facts = probesInPage({ maxElements: MAX_ELEMENTS, helpPattern: HELP_WORDS.source });
  const resources = resourcesInPage({ max: 400 });
  const weight = { facts: weightInPage({ max: 400 }), options: {} };
  return makeReport([auditSnapshot(route, snapshot.doc.innerWidth, { snapshot, html, facts, resources, weight, semantics: semanticsInPage({ maxElements: MAX_ELEMENTS }), langBlocks: langBlocksInPage({ maxElements: MAX_ELEMENTS, maxBlocks: 300 }), structure: structureInPage({ maxElements: MAX_ELEMENTS }), prose: proseInPage(PROSE_ARGS), layout: layoutInPage() })], now);
}
