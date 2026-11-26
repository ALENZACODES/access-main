export type ShellKind = "document" | "script" | "style" | "preload";

export interface ShellFile {
  kind: ShellKind;
  /** Build path relative to the app's deployment directory. */
  path: string;
  url: string;
}

export interface ShellInventory {
  scope: string | null;
  files: ShellFile[];
  /** Some relevant evidence could not be collected from this document. */
  limited: boolean;
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const MAX_HEAD_ELEMENTS = 256;
const MAX_FILES = 64;
const MAX_REFERENCE_LENGTH = 2048;
const safeSegment = /^[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/;

// Refuse query strings altogether: stripping one and looking up the resulting
// URL would check a different resource. This also catches a bare '?' or '#',
// for which URL.search and URL.hash both return an empty string.
function cleanReference(raw: string): boolean {
  return raw.length > 0 && raw.length <= MAX_REFERENCE_LENGTH &&
    !/[\s\p{Cc}\\%?#]/u.test(raw) &&
    !raw.split("/").includes("..");
}

function parseUrl(raw: string, relativeTo?: string): URL | null {
  try {
    const url = new URL(raw, relativeTo);
    if ((url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function deploymentScope(doc: Document, base: string): URL | null {
  const page = parseUrl(doc.URL);
  if (!page || !cleanReference(base)) return null;
  // BASE_URL is supplied by the build. The HTML <base> element affects
  // resource requests, but cannot redefine which app's cache we inspect.
  const scope = parseUrl(base, page.href);
  if (!scope || scope.origin !== page.origin) return null;
  if (!scope.pathname.endsWith("/")) scope.pathname += "/";
  const segments = scope.pathname.slice(1, -1);
  if (scope.pathname.includes("//") ||
      (segments && !segments.split("/").every((part) => safeSegment.test(part)))) return null;
  if (page.pathname !== scope.pathname.slice(0, -1) && !page.pathname.startsWith(scope.pathname)) {
    return null;
  }
  return scope;
}

type ResourceKind = Exclude<ShellKind, "document">;
interface Candidate {
  kind: ResourceKind;
  raw: string;
}

function mediaApplies(media: string, doc: Document): boolean | null {
  if (media === "" || media.toLowerCase() === "all") return true;
  try {
    return doc.defaultView?.matchMedia?.(media).matches ?? null;
  } catch {
    return null;
  }
}

// null means that the element is outside this check. "uncertain" means that
// an applicable stylesheet might have been left out of the inventory.
function headCandidate(element: Element, doc: Document): Candidate | "uncertain" | null {
  if (element.namespaceURI !== HTML_NAMESPACE) return null;
  if (element.localName === "script") {
    const type = element.getAttribute("type")?.trim().toLowerCase();
    if (type !== "module" || !element.hasAttribute("src")) return null;
    // In HTML, nomodule suppresses classic scripts. A module script remains
    // a module script even if the two attributes occur together.
    return { kind: "script", raw: element.getAttribute("src") ?? "" };
  }
  if (element.localName !== "link") return null;
  const link = element as HTMLLinkElement;
  const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/u);
  if (rel.includes("stylesheet")) {
    const type = link.getAttribute("type")?.trim().toLowerCase();
    if ((type && type !== "text/css") || rel.includes("alternate") ||
        link.hasAttribute("disabled") || link.disabled || link.sheet?.disabled) return null;
    const applies = mediaApplies(link.media.trim(), doc);
    if (applies === null) return "uncertain";
    if (!applies) return null;
    return { kind: "style", raw: link.getAttribute("href") ?? "" };
  }
  if (rel.includes("modulepreload")) {
    const as = link.getAttribute("as")?.trim().toLowerCase();
    if (as && as !== "script") return null;
    const applies = mediaApplies(link.media.trim(), doc);
    if (applies === null) return "uncertain";
    if (!applies) return null;
    return { kind: "preload", raw: link.getAttribute("href") ?? "" };
  }
  return null;
}

function buildFile(candidate: Candidate, doc: Document, scope: URL): ShellFile | null {
  const { kind, raw } = candidate;
  if (!cleanReference(raw)) return null;
  const url = parseUrl(raw, doc.baseURI);
  if (!url || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  const path = url.pathname.slice(scope.pathname.length);
  const segments = path.split("/");
  if (segments.length < 2 || segments[0] !== "assets" ||
      !segments.slice(1).every((segment) => safeSegment.test(segment))) return null;
  const extensionMatches = kind === "style" ? path.endsWith(".css") : /\.m?js$/.test(path);
  return extensionMatches ? { kind, path, url: url.href } : null;
}

/**
 * Observes the module entrypoints, module preloads and active stylesheets in
 * the current document head. Reads metadata only; neither response bodies nor
 * resource timing, navigation history or pack contents are needed.
 */
export function discoverShellFiles(doc: Document, base: string): ShellInventory {
  const scope = deploymentScope(doc, base);
  if (!scope) return { scope: null, files: [], limited: true };
  const index: ShellFile = {
    kind: "document",
    path: "index.html",
    url: new URL("index.html", scope.href).href,
  };
  const files = new Map<string, ShellFile>([[index.path, index]]);
  const children = doc.head?.children;
  const count = children?.length ?? 0;
  const examined = Math.min(count, MAX_HEAD_ELEMENTS);
  let limited = count > examined;
  for (let i = 0; i < examined; i++) {
    const element = children?.item(i);
    if (!element) continue;
    const candidate = headCandidate(element, doc);
    if (!candidate) continue;
    const file = candidate === "uncertain" ? null : buildFile(candidate, doc, scope);
    if (!file) {
      limited = true;
      continue;
    }
    const previous = files.get(file.path);
    if (previous) {
      // A resource can be hinted before the actual entry tag. Upgrade the
      // evidence in its original position so ordering stays stable.
      if (previous.kind === "preload" && file.kind === "script") files.set(file.path, file);
    } else if (files.size < MAX_FILES) {
      files.set(file.path, file);
    } else {
      limited = true;
    }
  }
  const list = [...files.values()];
  return {
    scope: scope.href,
    files: list,
    limited: limited || !list.some((file) => file.kind === "script"),
  };
}
