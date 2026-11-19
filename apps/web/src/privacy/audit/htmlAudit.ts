// A small static audit for generated HTML strings. It reads markup, not a
// browser, so it checks what can be known from the markup alone. Anything it
// cannot establish (for example a target size set by an external stylesheet)
// is reported as a violation, not assumed fine.

export type ViolationCode =
  | "malformed-html"
  | "missing-lang"
  | "bad-lang"
  | "duplicate-id"
  | "dangling-reference"
  | "button-no-name"
  | "input-no-name"
  | "label-not-in-name"
  | "target-too-small"
  | "target-size-unknown"
  | "positive-tabindex"
  | "hidden-focusable"
  | "img-no-alt"
  | "empty-heading"
  | "heading-skip"
  | "table-no-caption"
  | "table-no-header"
  | "th-no-scope"
  | "fieldset-no-legend"
  | "region-no-name"
  | "bad-aria-value"
  | "external-url"
  | "javascript-url"
  | "target-blank-no-rel"
  | "inline-handler"
  | "missing-doctype"
  | "missing-title"
  | "missing-charset"
  | "missing-viewport"
  | "main-count"
  | "h1-count"
  | "script-in-document"
  | "external-resource";

export interface Violation {
  code: ViolationCode;
  path: string;
  detail: string;
}

export interface AuditOptions {
  /** Top-level elements must carry a valid lang. Default true. */
  requireLang?: boolean;
  /** Hosts that may appear in href/src/action. Default none (offline). */
  allowedHosts?: readonly string[];
  /** Interactive elements must declare a size in an inline style. Default true. */
  requireTargetSize?: boolean;
  /** Minimum target size in CSS px. Default 44. */
  minTargetPx?: number;
}

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
  parent: Node | null;
  path: string;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const TOKEN =
  /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(ATTR)) {
    const name = (m[1] ?? "").toLowerCase();
    if (name !== "") out[name] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function parse(html: string, problems: Violation[]): Node {
  const root: Node = { tag: "#root", attrs: {}, children: [], text: "", parent: null, path: "" };
  let cur = root;
  for (const m of html.matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      const tag = m[1].toLowerCase();
      let n: Node | null = cur;
      while (n !== null && n.tag !== tag) n = n.parent;
      if (n === null || n === root) {
        problems.push({ code: "malformed-html", path: cur.path, detail: `closing </${tag}> without opening tag` });
      } else {
        if (n !== cur) problems.push({ code: "malformed-html", path: cur.path, detail: `<${cur.tag}> is not closed before </${tag}>` });
        cur = n.parent ?? root;
      }
    } else if (m[2] !== undefined) {
      const tag = m[2].toLowerCase();
      const same = cur.children.filter((c) => c.tag === tag).length + 1;
      const node: Node = {
        tag,
        attrs: parseAttrs(m[3] ?? ""),
        children: [],
        text: "",
        parent: cur,
        path: `${cur.path}${cur.path === "" ? "" : ">"}${tag}[${same}]`,
      };
      cur.children.push(node);
      if (!VOID.has(tag) && m[4] !== "/") cur = node;
    } else if (m[5] !== undefined) {
      cur.text += m[5];
    }
  }
  for (let n = cur; n !== root; n = n.parent ?? root) {
    problems.push({ code: "malformed-html", path: n.path, detail: `<${n.tag}> is never closed` });
  }
  return root;
}

function flatten(n: Node, out: Node[] = []): Node[] {
  for (const c of n.children) {
    out.push(c);
    flatten(c, out);
  }
  return out;
}

function textOf(n: Node): string {
  return decode(n.text + n.children.map(textOf).join(" ")).replace(/\s+/g, " ").trim();
}

export function normalizeName(s: string): string {
  return s.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function parseStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (style ?? "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim().toLowerCase();
  }
  return out;
}

function px(v: string | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(v ?? "");
  return m === null ? null : Number(m[1]);
}

/** Declared size in px along one axis: the larger of min-* and the plain size, or null if neither is in px. */
function declared(style: Record<string, string>, min: string, plain: string): number | null {
  const a = px(style[min]);
  const b = px(style[plain]);
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

const LANG_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
const FOCUSABLE_INPUT_HIDDEN = new Set(["hidden"]);
const REF_ATTRS = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"] as const;
const URL_ATTRS = ["href", "src", "action", "formaction", "poster", "data"] as const;

function isInteractive(n: Node): boolean {
  if (n.tag === "button" || n.tag === "select" || n.tag === "textarea" || n.tag === "summary") return true;
  if (n.tag === "a") return "href" in n.attrs;
  if (n.tag === "input") return !FOCUSABLE_INPUT_HIDDEN.has((n.attrs.type ?? "text").toLowerCase());
  const role = n.attrs.role;
  return role === "button" || role === "switch" || role === "tab" || role === "link" || role === "checkbox" || role === "radio";
}

function closest(n: Node, tag: string): Node | null {
  for (let p: Node | null = n.parent; p !== null; p = p.parent) if (p.tag === tag) return p;
  return null;
}

export function auditHtml(html: string, options: AuditOptions = {}): Violation[] {
  const opts = {
    requireLang: options.requireLang ?? true,
    allowedHosts: options.allowedHosts ?? [],
    requireTargetSize: options.requireTargetSize ?? true,
    minTargetPx: options.minTargetPx ?? 44,
  };
  const out: Violation[] = [];
  const add = (code: ViolationCode, n: Node, detail: string): void => {
    out.push({ code, path: n.path, detail });
  };
  const root = parse(html, out);
  const all = flatten(root);
  const byId = new Map<string, Node>();

  if (opts.requireLang) {
    for (const top of root.children) {
      if (top.attrs.lang === undefined) add("missing-lang", top, "top-level element has no lang");
    }
  }

  for (const n of all) {
    const id = n.attrs.id;
    if (id !== undefined) {
      if (byId.has(id)) add("duplicate-id", n, `id "${id}" is used more than once`);
      else byId.set(id, n);
    }
  }

  let prevHeading = 0;
  for (const n of all) {
    const a = n.attrs;
    if (a.lang !== undefined && !LANG_RE.test(a.lang)) add("bad-lang", n, `lang "${a.lang}"`);

    for (const attr of REF_ATTRS) {
      for (const ref of (a[attr] ?? "").split(/\s+/).filter((r) => r !== "")) {
        if (!byId.has(ref)) add("dangling-reference", n, `${attr} points to missing id "${ref}"`);
      }
    }
    if (n.tag === "label" && a.for !== undefined && !byId.has(a.for)) {
      add("dangling-reference", n, `for points to missing id "${a.for}"`);
    }

    for (const attr of Object.keys(a)) {
      if (/^on[a-z]+$/.test(attr)) add("inline-handler", n, `attribute ${attr}`);
    }
    if (a.tabindex !== undefined && Number.parseInt(a.tabindex, 10) > 0) {
      add("positive-tabindex", n, `tabindex="${a.tabindex}"`);
    }
    if (a["aria-hidden"] === "true" && (isInteractive(n) || (a.tabindex !== undefined && Number.parseInt(a.tabindex, 10) >= 0))) {
      add("hidden-focusable", n, "focusable element is hidden from assistive technology");
    }
    for (const attr of ["aria-pressed", "aria-checked", "aria-expanded"]) {
      const v = a[attr];
      if (v !== undefined && v !== "true" && v !== "false" && !(v === "mixed" && attr !== "aria-expanded")) {
        add("bad-aria-value", n, `${attr}="${v}"`);
      }
    }

    for (const attr of URL_ATTRS) {
      const v = a[attr];
      if (v === undefined) continue;
      if (/^\s*javascript:/i.test(v)) add("javascript-url", n, `${attr} uses a javascript: URL`);
      const m = /^\s*(?:https?:)?\/\/([^/?#:]+)/i.exec(v);
      if (m !== null) {
        const host = (m[1] ?? "").toLowerCase();
        if (!opts.allowedHosts.some((h) => h.toLowerCase() === host)) {
          add("external-url", n, `${attr} points to ${host}`);
        }
      }
    }
    if (n.tag === "a" && a.target === "_blank" && !/\bnoopener\b/.test(a.rel ?? "")) {
      add("target-blank-no-rel", n, 'target="_blank" without rel="noopener"');
    }

    if (n.tag === "img" && a.alt === undefined) add("img-no-alt", n, "img has no alt attribute");

    if (/^h[1-6]$/.test(n.tag)) {
      const level = Number(n.tag.slice(1));
      if (textOf(n) === "") add("empty-heading", n, "heading has no text");
      if (prevHeading !== 0 && level > prevHeading + 1) add("heading-skip", n, `h${prevHeading} is followed by h${level}`);
      prevHeading = level;
    }

    if (n.tag === "table") {
      if (!n.children.some((c) => c.tag === "caption" && textOf(c) !== "")) add("table-no-caption", n, "table has no caption");
      if (!flatten(n).some((c) => c.tag === "th")) add("table-no-header", n, "table has no header cells");
    }
    if (n.tag === "th" && !["col", "row", "colgroup", "rowgroup"].includes(a.scope ?? "")) {
      add("th-no-scope", n, "th has no valid scope");
    }
    if (n.tag === "fieldset" && n.children[0]?.tag !== "legend") {
      add("fieldset-no-legend", n, "fieldset does not start with a legend");
    }
    if (a.role === "region" && (a["aria-label"] ?? "") === "" && (a["aria-labelledby"] ?? "") === "") {
      add("region-no-name", n, 'role="region" has no name');
    }

    const visible = textOf(n);
    const labelled = (a["aria-labelledby"] ?? "")
      .split(/\s+/)
      .map((id) => byId.get(id))
      .filter((x): x is Node => x !== undefined)
      .map(textOf)
      .join(" ")
      .trim();
    const ariaLabel = (a["aria-label"] ?? "").trim();

    if (n.tag === "button" || a.role === "button" || a.role === "switch") {
      if (ariaLabel === "" && labelled === "" && visible === "") add("button-no-name", n, "no accessible name");
    }
    if (ariaLabel !== "" && visible !== "" && (n.tag === "button" || n.tag === "a" || a.role !== undefined)) {
      if (!` ${normalizeName(ariaLabel)} `.includes(` ${normalizeName(visible)} `)) {
        add("label-not-in-name", n, `aria-label "${ariaLabel}" does not contain visible text "${visible}"`);
      }
    }
    if (n.tag === "input") {
      const type = (a.type ?? "text").toLowerCase();
      if (!FOCUSABLE_INPUT_HIDDEN.has(type)) {
        const wrapper = closest(n, "label");
        const forLabel = a.id === undefined ? undefined : all.find((l) => l.tag === "label" && l.attrs.for === a.id);
        const named =
          ariaLabel !== "" ||
          labelled !== "" ||
          (wrapper !== null && textOf(wrapper) !== "") ||
          (forLabel !== undefined && textOf(forLabel) !== "") ||
          ((type === "submit" || type === "button" || type === "reset") && (a.value ?? "") !== "") ||
          (type === "image" && (a.alt ?? "") !== "");
        if (!named) add("input-no-name", n, `input type=${type} has no accessible name`);
      }
    }

    if (isInteractive(n)) {
      const holder = n.tag === "input" ? closest(n, "label") ?? n : n;
      const style = parseStyle(holder.attrs.style);
      const w = declared(style, "min-width", "width");
      const h = declared(style, "min-height", "height");
      if (w === null || h === null) {
        if (opts.requireTargetSize) add("target-size-unknown", n, "no width and height in px in an inline style");
      } else if (w < opts.minTargetPx || h < opts.minTargetPx) {
        add("target-too-small", n, `${w} x ${h} px is below ${opts.minTargetPx} px`);
      }
    }
  }
  return out;
}

export function formatViolations(v: readonly Violation[]): string {
  return v.map((x) => `${x.code} at ${x.path}: ${x.detail}`).join("\n");
}

/** Throws with every violation listed. Use in tests and start-up checks. */
export function assertAccessibleHtml(html: string, options: AuditOptions = {}): void {
  const v = auditHtml(html, options);
  if (v.length > 0) throw new Error(`HTML audit failed:\n${formatViolations(v)}`);
}

/** Every piece of visible text and every text attribute (aria-label, title, alt) in the markup. */
export function extractTexts(html: string): string[] {
  const root = parse(html.replace(/<!doctype[^>]*>/gi, ""), []);
  const out: string[] = [];
  for (const n of flatten(root)) {
    if (n.tag === "style" || n.tag === "script") continue;
    const own = decode(n.text).replace(/\s+/g, " ").trim();
    if (own !== "") out.push(own);
    for (const a of ["aria-label", "title", "alt"]) {
      const v = n.attrs[a];
      if (v !== undefined && v.trim() !== "") out.push(v.trim());
    }
  }
  return out;
}

/**
 * Audits a whole standalone HTML document, such as a page the person saves or
 * prints. It must work offline: no scripts, no stylesheets or fonts from elsewhere.
 */
export function auditDocument(html: string, options: AuditOptions = {}): Violation[] {
  const out: Violation[] = [];
  if (!/^\s*<!doctype html>/i.test(html)) {
    out.push({ code: "missing-doctype", path: "", detail: "document does not start with <!doctype html>" });
  }
  const body = html.replace(/<!doctype[^>]*>/gi, "");
  const root = parse(body, out);
  const all = flatten(root);
  const find = (tag: string): Node[] => all.filter((n) => n.tag === tag);
  const add = (code: ViolationCode, n: Node | null, detail: string): void => {
    out.push({ code, path: n?.path ?? "", detail });
  };
  const htmlEl = find("html")[0];
  if (htmlEl === undefined || (htmlEl.attrs.lang ?? "") === "") add("missing-lang", htmlEl ?? null, "html has no lang");
  if (!find("title").some((t) => textOf(t) !== "")) add("missing-title", null, "document has no title");
  if (!find("meta").some((m) => m.attrs.charset !== undefined)) add("missing-charset", null, "no <meta charset>");
  if (!find("meta").some((m) => m.attrs.name === "viewport")) add("missing-viewport", null, "no viewport meta");
  const mains = find("main").length;
  if (mains !== 1) add("main-count", null, `${mains} <main> elements, expected 1`);
  const h1s = find("h1").length;
  if (h1s !== 1) add("h1-count", null, `${h1s} <h1> elements, expected 1`);
  for (const s of find("script")) add("script-in-document", s, "scripts are not allowed in a saved page");
  for (const l of find("link")) {
    if ((l.attrs.href ?? "") !== "") add("external-resource", l, `link to ${l.attrs.href ?? ""}`);
  }
  for (const st of find("style")) {
    if (/@import|url\(/i.test(st.text)) add("external-resource", st, "style loads a resource");
  }
  out.push(...auditHtml(body, { ...options, requireLang: false, requireTargetSize: options.requireTargetSize ?? false }));
  return out;
}
