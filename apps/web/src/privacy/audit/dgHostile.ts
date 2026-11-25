// Text that would do harm if a screen wrote it into a page as markup. A behaviour audit gives a screen one of these
// where it takes a notice, a caught error's message or a typed value, and checks the markup that comes back.

export interface Hostile {
  name: string;
  text: string;
  /** Raw pieces that must not appear in the markup that comes back, because the text was written without escaping. */
  rawMarkers: string[];
}

/** The word that every hostile text holds, so a check can see that the text was shown and not dropped. */
export const MARK = "zq7mark";

export const HOSTILE: readonly Hostile[] = [
  { name: "a tag", text: `<b id="${MARK}">bold</b>`, rawMarkers: ["<b id=", "</b>"] },
  { name: "an image that runs a handler", text: `<img src=x onerror=${MARK}>`, rawMarkers: ["<img", "onerror=zq7mark>"] },
  { name: "a script", text: `<script>${MARK}()</script>`, rawMarkers: ["<script", "</script>"] },
  { name: "a break out of an attribute", text: `" onmouseover="${MARK}" x="`, rawMarkers: [`" onmouseover="`] },
  { name: "a break out of a single quoted attribute", text: `' onfocus='${MARK}' x='`, rawMarkers: ["' onfocus='"] },
  { name: "a closing tag and a new element", text: `</div><iframe src="${MARK}"></iframe>`, rawMarkers: ["</div><iframe", "<iframe"] },
  { name: "a javascript address", text: `<a href="javascript:${MARK}()">x</a>`, rawMarkers: ["<a href="] },
  { name: "a comment", text: `<!-- ${MARK} -->`, rawMarkers: ["<!--"] },
  { name: "an entity that would decode to a tag", text: `&lt;b&gt;${MARK}`, rawMarkers: ["<b>"] },
  { name: "a template expression", text: `\${${MARK}} {{${MARK}}}`, rawMarkers: [] },
];

/** The text escaped as the App's own escape does: & < > and both quotes. */
export function escapedForm(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface RawFinding {
  hostile: string;
  problem: string;
}

/** What is wrong with the markup a screen produced for a hostile text. Nothing is wrong when the text is shown, escaped. */
export function checkEscaped(markup: string, h: Hostile): RawFinding[] {
  const out: RawFinding[] = [];
  const add = (problem: string): void => void out.push({ hostile: h.name, problem });
  if (!markup.includes(MARK)) add("the text is not shown at all");
  if (escapedForm(h.text) !== h.text && markup.includes(h.text)) add("the text is written as it is, without escaping");
  for (const m of h.rawMarkers) if (markup.includes(m)) add(`the markup holds ${JSON.stringify(m)}`);
  return out;
}

/** Whether a markup string holds a tag or an attribute that was not in a known set: a rough guard for a whole page. */
export function unknownTags(markup: string, known: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  const re = /<\/?([A-Za-z][A-Za-z0-9-]*)/g;
  let m = re.exec(markup);
  while (m) {
    const tag = (m[1] as string).toLowerCase();
    if (!known.has(tag)) found.add(tag);
    m = re.exec(markup);
  }
  return [...found].sort();
}
