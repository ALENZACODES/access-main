import {
  DARK,
  FOCUS_OFFSET_PX,
  FOCUS_RING_PX,
  LIGHT,
  MIN_TARGET_PX,
  TARGET_GAP_PX,
  type ThemeTokens,
} from './tokens';

const STYLE_ID = 'a11y-shell-styles';

function vars(t: ThemeTokens): string {
  return [
    `--a11y-text: ${t.text};`,
    `--a11y-muted-text: ${t.mutedText};`,
    `--a11y-bg: ${t.background};`,
    `--a11y-focus-ring: ${t.focusRing};`,
    `--a11y-focus-halo: ${t.focusHalo};`,
  ].join(' ');
}

const INTERACTIVE = "a, button, input, select, textarea, summary, [role='button'], [tabindex]";
const TARGETS = "button, [role='button'], select, summary, nav a, input:not([type='hidden'], [type='checkbox'], [type='radio'])";

/** Builds the shell-route stylesheet: focus-visible, 44px targets, spacing. */
export function buildA11yCss(): string {
  return `:root { ${vars(LIGHT)} }
@media (prefers-color-scheme: dark) { :root { ${vars(DARK)} } }
html { scroll-padding-block: 4rem; }
body { color: var(--a11y-text); background: var(--a11y-bg); line-height: 1.5; }
:is(${INTERACTIVE}):focus-visible {
  outline: ${FOCUS_RING_PX}px solid var(--a11y-focus-ring);
  outline-offset: ${FOCUS_OFFSET_PX}px;
  box-shadow: 0 0 0 ${FOCUS_OFFSET_PX}px var(--a11y-focus-halo);
}
:where(${TARGETS}) { min-height: ${MIN_TARGET_PX}px; min-width: ${MIN_TARGET_PX}px; }
.a11y-stack { display: flex; flex-wrap: wrap; gap: ${TARGET_GAP_PX}px; }
.a11y-skip-link { position: absolute; inset-inline-start: 0; inset-block-start: -100%; min-height: ${MIN_TARGET_PX}px; padding: 12px 16px; background: var(--a11y-bg); color: var(--a11y-text); }
.a11y-skip-link:focus-visible { inset-block-start: 0; }
@media (prefers-reduced-motion: reduce) { :focus-visible { transition: none; } }
@media (forced-colors: active) { :focus-visible { outline-color: Highlight; } }
`;
}

/** Idempotent: injects the stylesheet once per document. */
export function injectA11yStyles(doc: Document): HTMLStyleElement {
  const existing = doc.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) return existing;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = buildA11yCss();
  doc.head.appendChild(el);
  return el;
}
