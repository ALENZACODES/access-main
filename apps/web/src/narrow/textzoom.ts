import type { TextSpacingResult } from './inpage.js';
import type { CheckResult } from './types.js';

/**
 * 1.4.4: text can be resized to 200% without loss of content. The probe makes
 * the base text size twice as big, which is what the browser text size setting
 * does to anything sized in rem or em, then looks for boxes that start to cut
 * text off. Text sized in px does not follow the base size, so a clean result
 * is not a pass: this check reports what it measured and never says "ok".
 */
export const TEXT_ZOOM_CSS = 'html { font-size: 200% !important; }';

/** Fails for boxes that cut text off only after the text size is doubled. Reads the probe that textSpacingProbeInPage makes with TEXT_ZOOM_CSS. */
export function auditTextZoom(res: TextSpacingResult): CheckResult {
  return {
    checked: res.checked,
    entries: res.newlyClipped.map((c) => ({
      check: 'text-zoom' as const,
      id: c.id,
      status: 'fail' as const,
      rule: 'clipped-at-200',
      message: {
        en: 'Content is cut off when the base text size is doubled (WCAG 1.4.4). Use min-height instead of height and let the box grow.',
        fr: 'Le contenu est coupé lorsque la taille de base du texte est doublée (critère 1.4.4). Utilisez min-height au lieu de height et laissez le bloc s’agrandir.',
      },
    })),
  };
}
