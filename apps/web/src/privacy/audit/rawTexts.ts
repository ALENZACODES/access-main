// Visible text and text attributes of rendered markup, for the French spacing checks.

/**
 * Visible text and text attributes with the no-break spaces kept. extractTexts in htmlAudit folds every
 * space, including U+00A0 and U+202F, so it cannot be used to check French spacing.
 */
export function rawTexts(html: string): string[] {
  const decode = (t: string): string => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const out: string[] = [];
  for (const m of html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)) out.push(decode(m[1] ?? ""));
  for (const chunk of html.replace(/<(script|style)[\s\S]*?<\/\1>/g, "").split(/<[^>]+>/)) {
    const t = decode(chunk).replace(/[ \t\r\n]+/g, " ").trim();
    if (t !== "") out.push(t);
  }
  return out;
}
