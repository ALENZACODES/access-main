import type { TextSpacingResult } from './inpage.js';
import type { CheckResult } from './types.js';

/** 1.4.12: raising text spacing must not clip content that was not clipped before. */
export function auditTextSpacing(res: TextSpacingResult): CheckResult {
  return {
    checked: res.checked,
    entries: res.newlyClipped.map((c) => ({
      check: 'text-spacing' as const,
      id: c.id,
      status: 'fail' as const,
      message: {
        en: 'Content is clipped when text spacing is increased (WCAG 1.4.12 values).',
        fr: 'Le contenu est tronqué lorsque l’espacement du texte est augmenté (valeurs du critère 1.4.12).',
      },
    })),
  };
}
