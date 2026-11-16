export const TARGET_PX = 44;
export const TARGET_STYLE = `min-width:${TARGET_PX}px;min-height:${TARGET_PX}px`;

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A button at least 44 x 44 px, identified by data-action for event delegation. */
export function button(action: string, label: string): string {
  return `<button type="button" data-action="${esc(action)}" style="${TARGET_STYLE}">${esc(label)}</button>`;
}

/** Plural rule: English 1 = singular; French 0 and 1 = singular. */
export function isSingular(locale: "en" | "fr", n: number): boolean {
  return locale === "fr" ? n === 0 || n === 1 : n === 1;
}
