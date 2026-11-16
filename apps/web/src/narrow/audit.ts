/**
 * Pure helpers for the 320px reflow and 44px touch-target audit.
 * Everything here works on plain numbers so it can run without a browser.
 */

export const MIN_TARGET_PX = 44;
export const REFLOW_WIDTH_PX = 320;
/** Sub-pixel layout noise that is not reported. */
const TOLERANCE_PX = 0.5;

export interface Box {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

export type FindingKind = 'target-too-small' | 'horizontal-overflow' | 'page-scrolls-sideways';

export interface Finding {
  readonly kind: FindingKind;
  readonly id: string;
  /** Measured values, in CSS px. Meaning depends on kind. */
  readonly width: number;
  readonly height: number;
  readonly overflowPx: number;
}

export interface LocalizedText {
  readonly en: string;
  readonly fr: string;
}

export interface NarrowReport {
  readonly route: string;
  readonly viewportWidth: number;
  readonly findings: readonly Finding[];
}

const NBSP = '\u00A0';

/** Interactive boxes smaller than the minimum in either direction. Unmeasured (0x0) boxes are skipped. */
export function auditTargets(boxes: readonly Box[], minPx: number = MIN_TARGET_PX): Finding[] {
  const out: Finding[] = [];
  for (const b of boxes) {
    if (b.width === 0 && b.height === 0) continue;
    if (b.width + TOLERANCE_PX < minPx || b.height + TOLERANCE_PX < minPx) {
      out.push({
        kind: 'target-too-small',
        id: b.id,
        width: Math.round(b.width),
        height: Math.round(b.height),
        overflowPx: 0,
      });
    }
  }
  return out;
}

/** Boxes that leave the viewport sideways, plus a page-level sideways scroll. */
export function auditReflow(
  boxes: readonly Box[],
  scrollWidth: number,
  clientWidth: number,
  viewportWidth: number = REFLOW_WIDTH_PX,
): Finding[] {
  const out: Finding[] = [];
  if (scrollWidth > clientWidth + TOLERANCE_PX) {
    out.push({
      kind: 'page-scrolls-sideways',
      id: 'page',
      width: Math.round(scrollWidth),
      height: 0,
      overflowPx: Math.ceil(scrollWidth - clientWidth),
    });
  }
  for (const b of boxes) {
    const over = Math.max(b.right - viewportWidth, -b.left);
    if (over > TOLERANCE_PX) {
      out.push({
        kind: 'horizontal-overflow',
        id: b.id,
        width: Math.round(b.width),
        height: Math.round(b.height),
        overflowPx: Math.ceil(over),
      });
    }
  }
  return out;
}

export function auditBoxes(
  route: string,
  boxes: readonly Box[],
  scrollWidth: number,
  clientWidth: number,
  viewportWidth: number = REFLOW_WIDTH_PX,
): NarrowReport {
  return {
    route,
    viewportWidth,
    findings: [
      ...auditReflow(boxes, scrollWidth, clientWidth, viewportWidth),
      ...auditTargets(boxes),
    ],
  };
}

export function describeFinding(f: Finding): LocalizedText {
  switch (f.kind) {
    case 'target-too-small':
      return {
        en: `Target is ${f.width}×${f.height}px, below the ${MIN_TARGET_PX}px minimum.`,
        fr: `La cible fait ${f.width}×${f.height}${NBSP}px, sous le minimum de ${MIN_TARGET_PX}${NBSP}px.`,
      };
    case 'horizontal-overflow':
      return {
        en: `Content extends ${f.overflowPx}px past the ${REFLOW_WIDTH_PX}px viewport edge.`,
        fr: `Le contenu dépasse de ${f.overflowPx}${NBSP}px le bord de l’écran de ${REFLOW_WIDTH_PX}${NBSP}px.`,
      };
    case 'page-scrolls-sideways':
      return {
        en: `The page scrolls sideways at ${REFLOW_WIDTH_PX}px wide.`,
        fr: `La page défile horizontalement à ${REFLOW_WIDTH_PX}${NBSP}px de large.`,
      };
  }
}

/** One line per finding, "route  id  message". Returns [] when the report is clean. */
export function formatReport(report: NarrowReport, lang: 'en' | 'fr'): string[] {
  return report.findings.map((f) => `${report.route}  ${f.id}  ${describeFinding(f)[lang]}`);
}
