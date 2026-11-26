export interface Waypoint {
  name: string;
  latitude: number;
  longitude: number;
  description: string;
  category: string;
  source: string | null;
  link: string | null;
}

export interface WaypointFile {
  title: string;
  description: string;
  points: Waypoint[];
}

/**
 * Inspect the downloadable waypoint document with a browser's XML parser.
 * This checks the GPX subset promised by ShortlistFiles. The namespace is
 * an identifier only. Readers never need to fetch a schema or follow links.
 * Keep this function self-contained so Playwright can run it in a blank tab.
 */
export function readWaypointFile(xml: string): WaypointFile {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const root = document.documentElement;
  const namespace = "http://www.topografix.com/GPX/1/1";
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Malformed GPX XML");
  }
  if (document.doctype) throw new Error("Unexpected document type in GPX export");
  if (root.namespaceURI !== namespace || root.localName !== "gpx") {
    throw new Error("Expected the GPX 1.1 document element");
  }
  if (root.getAttribute("version") !== "1.1" || !root.getAttribute("creator")?.trim()) {
    throw new Error("Expected a GPX version and creator");
  }

  function children(parent: Element, tag: string) {
    return Array.from(parent.children).filter((el) => el.namespaceURI === namespace && el.localName === tag);
  }

  function one(parent: Element, tag: string, required: boolean) {
    const items = children(parent, tag);
    if (items.length > 1 || (required && items.length !== 1)) {
      throw new Error("Unexpected number of " + tag + " elements in " + parent.localName);
    }
    return items[0] ?? null;
  }

  function text(element: Element) {
    if (element.childElementCount > 0) throw new Error("Nested markup in GPX " + element.localName);
    const value = element.textContent ?? "";
    if (value.trim() === "") throw new Error("Missing text in GPX " + element.localName);
    return value;
  }

  function requiredText(parent: Element, tag: string) {
    const child = one(parent, tag, true);
    if (!child) throw new Error("Missing " + tag);
    return text(child);
  }

  function position(element: Element, axis: "lat" | "lon") {
    const raw = element.getAttribute(axis);
    if (!raw || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
      throw new Error("Invalid waypoint " + axis + " decimal");
    }
    const limit = axis === "lat" ? 90 : 180;
    const value = Number(raw);
    if (!Number.isFinite(value) || Math.abs(value) > limit) {
      throw new Error("Waypoint " + axis + " out of range");
    }
    return value;
  }

  if (children(root, "rte").length || children(root, "trk").length) {
    throw new Error("A saved shortlist must contain only waypoints");
  }
  const metadata = one(root, "metadata", true);
  if (!metadata) throw new Error("Missing file metadata");
  const points = children(root, "wpt").map((element): Waypoint => {
    const source = one(element, "src", false);
    const link = one(element, "link", false);
    let href: string | null = null;
    if (link) {
      href = link.getAttribute("href");
      if (!href || new URL(href).protocol !== "https:") {
        throw new Error("Expected an absolute HTTPS source link");
      }
    }
    return {
      name: requiredText(element, "name"),
      latitude: position(element, "lat"),
      longitude: position(element, "lon"),
      description: requiredText(element, "desc"),
      category: requiredText(element, "type"),
      source: source ? text(source) : null,
      link: href,
    };
  });
  return {
    title: requiredText(metadata, "name"),
    description: requiredText(metadata, "desc"),
    points,
  };
}
