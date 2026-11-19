import { URL } from "node:url";

/** Read-only semantic contracts for keyboard and assistive-technology audits. */
export const LANGUAGES = Object.freeze(["en", "fr"]);
export const EVIDENCE = Object.freeze(["PRIMARY", "SECONDARY", "COMMUNITY", "UNKNOWN"]);
export const STATUS = Object.freeze(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]);
export const SEVERITY = Object.freeze(["error", "review"]);
export const ARIA_BOOLEAN = Object.freeze(["true", "false"]);
export const COMPOSITE_ROLES = Object.freeze(["listbox", "tree", "menu", "menubar", "tablist", "radiogroup"]);
export const ITEM_ROLES = Object.freeze(["option", "treeitem", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "radio"]);
export const REFERENCES = Object.freeze(["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-activedescendant"]);
export const KNOWN_LANDMARKS = Object.freeze(["main", "navigation", "banner", "contentinfo", "search", "complementary", "region"]);
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

export function plain(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function hasControl(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function labelText(value, max = 400) {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > max || value.trim().length === 0) return false;
  return !hasControl(value);
}

export function recordId(value) {
  return typeof value === "string" && IDENTIFIER.test(value);
}

export function calendarDay(value) {
  if (typeof value !== "string") return null;
  const match = DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const actual = new Date(Date.UTC(year, month - 1, day));
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() + 1 !== month || actual.getUTCDate() !== day) return null;
  return Math.floor(actual.getTime() / 86400000);
}

export function sourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value || hasControl(value)) return false;
  if (value.includes(" ") || value.includes("\\")) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host === "0.0.0.0" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function localAsset(value) {
  if (typeof value !== "string" || value.length > 1024 || hasControl(value)) return false;
  if (!value.startsWith("/offline/") || value.startsWith("//")) return false;
  if (value.includes("%") || value.includes("?") || value.includes("#") || value.includes("\\")) return false;
  const segments = value.split("/").slice(1);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  return segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment));
}

export function frenchSpacing(value) {
  if (typeof value !== "string") return ["fr.missing-copy"];
  const findings = [];
  if (value.includes("'")) findings.push("fr.apostrophe");
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === ":" && index > 0 && value[index - 1] !== "\u00A0") findings.push("fr.colon-space");
    if ((char === ";" || char === "!" || char === "?") && index > 0 && value[index - 1] !== "\u202F") findings.push("fr.narrow-space");
    if (char === "«" && value[index + 1] !== "\u202F") findings.push("fr.guillemet-open");
    if (char === "»" && value[index - 1] !== "\u202F") findings.push("fr.guillemet-close");
  }
  return [...new Set(findings)].sort();
}

export function finding(code, path, severity = "error") {
  return { code, path, severity };
}

export function sortFindings(items) {
  return [...items].sort((left, right) => left.path.localeCompare(right.path, "en") || left.code.localeCompare(right.code, "en"));
}

/** An evidence record is an attribution, not proof of physical accessibility. */
export function auditEvidence(input, prefix = "evidence") {
  const issues = [];
  if (!plain(input)) return [finding("evidence.object", prefix)];
  if (!recordId(input.id)) issues.push(finding("evidence.id", `${prefix}.id`));
  if (!LANGUAGES.includes(input.language)) issues.push(finding("evidence.language", `${prefix}.language`));
  if (!STATUS.includes(input.status)) issues.push(finding("evidence.status", `${prefix}.status`));
  if (!EVIDENCE.includes(input.tier)) issues.push(finding("evidence.tier", `${prefix}.tier`));
  if (input.status === "UNKNOWN" && input.tier !== "UNKNOWN") issues.push(finding("evidence.unknown-tier", `${prefix}.tier`));
  if (!plain(input.source)) {
    issues.push(finding("evidence.source", `${prefix}.source`));
  } else {
    if (!labelText(input.source.name, 200)) issues.push(finding("source.name", `${prefix}.source.name`));
    if (!labelText(input.source.licence, 160)) issues.push(finding("source.licence", `${prefix}.source.licence`));
    if (!sourceUrl(input.source.url)) issues.push(finding("source.url", `${prefix}.source.url`));
    if (calendarDay(input.source.collectedOn) === null) issues.push(finding("source.collectedOn", `${prefix}.source.collectedOn`));
  }
  if (!plain(input.offline)) {
    issues.push(finding("evidence.offline", `${prefix}.offline`));
  } else {
    if (!["PRESENT", "ABSENT", "UNKNOWN"].includes(input.offline.state)) issues.push(finding("offline.state", `${prefix}.offline.state`));
    if (input.offline.state === "PRESENT") {
      if (!localAsset(input.offline.path)) issues.push(finding("offline.path", `${prefix}.offline.path`));
      if (calendarDay(input.offline.capturedOn) === null) issues.push(finding("offline.capturedOn", `${prefix}.offline.capturedOn`));
    } else if (input.offline.path !== undefined || input.offline.capturedOn !== undefined) {
      issues.push(finding("offline.unexpected-reference", `${prefix}.offline`));
    }
  }
  return sortFindings(issues);
}

/** Audit a screen-reader-oriented observation without inspecting private copy. */
export function auditSemanticSnapshot(input) {
  const issues = [];
  if (!plain(input)) return [finding("snapshot.object", "snapshot")];
  if (!LANGUAGES.includes(input.language)) issues.push(finding("document.language", "document.language"));
  if (!Array.isArray(input.nodes)) return sortFindings([...issues, finding("snapshot.nodes", "nodes")]);
  const roots = new Map();
  const ids = new Map();
  for (const [index, node] of input.nodes.entries()) {
    const path = `nodes[${index}]`;
    if (!plain(node)) {
      issues.push(finding("node.object", path));
      continue;
    }
    const root = typeof node.root === "string" ? node.root : "document";
    const rootItems = roots.get(root) ?? [];
    rootItems.push({ node, index });
    roots.set(root, rootItems);
    if (node.id !== null && node.id !== undefined && node.id !== "") {
      const key = `${root}\u0000${node.id}`;
      const previous = ids.get(key);
      if (previous !== undefined) issues.push(finding("node.duplicate-id", `${path}.id`));
      else ids.set(key, index);
    }
    if (node.focusable && node.hidden) issues.push(finding("node.hidden-focusable", path));
    if (node.focusable && node.inert) issues.push(finding("node.inert-focusable", path));
    if (node.focusable && node.disabled) issues.push(finding("node.disabled-focusable", path, "review"));
    if (node.tabindex > 0) issues.push(finding("node.positive-tabindex", `${path}.tabindex`));
    if (node.interactive && !labelText(node.name)) issues.push(finding("node.unnamed-control", `${path}.name`));
    if (node.role === "img" && !labelText(node.name)) issues.push(finding("node.unnamed-image", `${path}.name`));
    if (node.role === "dialog" && !labelText(node.name)) issues.push(finding("node.unnamed-dialog", `${path}.name`));
    if (node.role === "status" && node.live === "off") issues.push(finding("node.silent-status", `${path}.live`));
    if (node.role === "alert" && node.live === "off") issues.push(finding("node.silent-alert", `${path}.live`));
    if (node.ariaHidden && node.focusable) issues.push(finding("node.aria-hidden-focusable", path));
    if (node.role === "button" && node.expanded && !["true", "false"].includes(node.expanded)) {
      issues.push(finding("node.expanded", `${path}.expanded`));
    }
    if (node.role === "checkbox" && node.checked && !["true", "false", "mixed"].includes(node.checked)) {
      issues.push(finding("node.checked", `${path}.checked`));
    }
    if (node.role === "radio" && node.checked && !["true", "false"].includes(node.checked)) {
      issues.push(finding("node.checked", `${path}.checked`));
    }
    if (node.role === "tab" && node.selected && !["true", "false"].includes(node.selected)) {
      issues.push(finding("node.selected", `${path}.selected`));
    }
    if (node.references && plain(node.references)) {
      for (const [attr, values] of Object.entries(node.references)) {
        if (!REFERENCES.includes(attr)) continue;
        if (!Array.isArray(values) || values.length === 0) {
          issues.push(finding("node.empty-reference", `${path}.${attr}`));
          continue;
        }
        for (const id of values) {
          if (typeof id !== "string" || !id) issues.push(finding("node.invalid-reference", `${path}.${attr}`));
          else if (!ids.has(`${root}\u0000${id}`)) {
            // References may point forward. Resolve after collecting the full root.
          }
        }
      }
    }
  }
  for (const [index, node] of input.nodes.entries()) {
    if (!plain(node) || !plain(node.references)) continue;
    const root = typeof node.root === "string" ? node.root : "document";
    for (const [attr, values] of Object.entries(node.references)) {
      if (!REFERENCES.includes(attr) || !Array.isArray(values)) continue;
      for (const id of values) {
        if (typeof id !== "string" || !id) continue;
        if (!ids.has(`${root}\u0000${id}`)) issues.push(finding("node.dangling-reference", `nodes[${index}].${attr}`));
        if (attr === "aria-activedescendant" && node.focusable === false) issues.push(finding("node.inactive-descendant-owner", `nodes[${index}].${attr}`));
      }
    }
  }
  const mains = input.nodes.filter((node) => plain(node) && node.role === "main" && !node.hidden);
  if (mains.length !== 1) issues.push(finding("document.main-count", "document.main"));
  const headings = input.nodes.filter((node) => plain(node) && node.role === "heading" && !node.hidden);
  if (headings.length === 0) issues.push(finding("document.heading-missing", "document.headings"));
  return sortFindings(issues);
}

export function auditBilingualEvidence(records) {
  if (!Array.isArray(records)) return [finding("records.array", "records")];
  const issues = [];
  const languages = new Map();
  for (const [index, record] of records.entries()) {
    issues.push(...auditEvidence(record, `records[${index}]`));
    if (!plain(record) || !recordId(record.translationKey) || !LANGUAGES.includes(record.language)) continue;
    const group = languages.get(record.translationKey) ?? new Set();
    if (group.has(record.language)) issues.push(finding("records.duplicate-language", `records[${index}].language`));
    group.add(record.language);
    languages.set(record.translationKey, group);
  }
  for (const [key, group] of languages) {
    for (const language of LANGUAGES) {
      if (!group.has(language)) issues.push(finding("records.missing-language", `translations.${key}.${language}`));
    }
  }
  return sortFindings(issues);
}

export function summarizeSemanticIssues(issues) {
  const counts = Object.create(null);
  for (const entry of issues) counts[entry.code] = (counts[entry.code] ?? 0) + 1;
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([code, count]) => ({ code, count }));
}

export function readinessForEvidence(records) {
  const issues = auditBilingualEvidence(records);
  if (issues.length) return { decision: "HOLD", issues };
  if (records.some((record) => record.status === "UNKNOWN" || record.tier === "UNKNOWN" || record.offline.state === "UNKNOWN")) {
    return { decision: "UNKNOWN", issues: [] };
  }
  if (records.some((record) => record.status !== "SUPPORTED" || record.offline.state !== "PRESENT")) {
    return { decision: "HOLD", issues: [] };
  }
  return { decision: "READY", issues: [] };
}
