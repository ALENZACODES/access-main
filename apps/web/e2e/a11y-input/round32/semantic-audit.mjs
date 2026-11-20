/** Pure accessibility-tree snapshot audits. No DOM writes or network requests. */
import { objectRecord, safeCopy, safeIdentifier, hasControlCode } from "./switch-model.mjs";
export const RELATION_ATTRS = Object.freeze(["labelledBy", "describedBy", "controls", "owns", "activeDescendant"]);
export const LIVE_POLITENESS = Object.freeze(["off", "polite", "assertive"]);
export const VALID_ROLES = Object.freeze([
  "button", "link", "checkbox", "switch", "radio", "radiogroup", "tab", "tablist", "tabpanel",
  "dialog", "alertdialog", "status", "alert", "menu", "menuitem", "listbox", "option",
  "tree", "treeitem", "navigation", "main", "heading", "form", "group", "region",
]);
const MAX_NODES = 1500;
const MAX_REFERENCES = 32;

/** @param {unknown} value */
export function validRole(value) {
  return typeof value === "string" && VALID_ROLES.includes(value);
}

/** @param {unknown} value */
export function normalizeIdList(value) {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value) || value.length > MAX_REFERENCES) return null;
  if (value.some((id) => !safeIdentifier(id))) return null;
  return [...value];
}

/** @param {unknown} value */
export function accessibleName(value) {
  if (!objectRecord(value)) return "";
  if (safeCopy(value.name)) return value.name.trim();
  if (safeCopy(value.label)) return value.label.trim();
  if (safeCopy(value.text) && ["button", "link", "tab", "menuitem", "option", "heading"].includes(value.role)) {
    return value.text.trim();
  }
  return "";
}

/** @param {unknown} input */
export function inspectNodes(input) {
  const findings = [];
  if (!Array.isArray(input)) return [{ code: "tree.array", path: "nodes" }];
  if (input.length > MAX_NODES) findings.push({ code: "tree.limit", path: "nodes" });
  const ids = new Set();
  for (const [index, node] of input.entries()) {
    const at = `nodes[${index}]`;
    if (!objectRecord(node)) {
      findings.push({ code: "node.object", path: at });
      continue;
    }
    if (!safeIdentifier(node.id)) findings.push({ code: "node.id", path: `${at}.id` });
    else if (ids.has(node.id)) findings.push({ code: "node.duplicate-id", path: `${at}.id` });
    else ids.add(node.id);
    if (!validRole(node.role)) findings.push({ code: "node.role", path: `${at}.role` });
    if (typeof node.focusable !== "boolean") findings.push({ code: "node.focusable", path: `${at}.focusable` });
    if (typeof node.hidden !== "boolean") findings.push({ code: "node.hidden", path: `${at}.hidden` });
    if (typeof node.inert !== "boolean") findings.push({ code: "node.inert", path: `${at}.inert` });
    if (!Number.isInteger(node.tabIndex) || node.tabIndex < -1 || node.tabIndex > 0) {
      findings.push({ code: "node.tab-index", path: `${at}.tabIndex` });
    }
    if (node.focusable && (node.hidden || node.inert)) findings.push({ code: "node.hidden-focus", path: at });
    if (node.focusable && node.tabIndex < 0 && node.role === "button") {
      findings.push({ code: "node.unreachable", path: at });
    }
    if (node.role === "dialog" && !accessibleName(node)) findings.push({ code: "node.dialog-name", path: at });
    if (["button", "link", "switch", "checkbox", "tab", "menuitem"].includes(node.role) && !accessibleName(node)) {
      findings.push({ code: "node.control-name", path: at });
    }
    if (node.live !== undefined && !LIVE_POLITENESS.includes(node.live)) {
      findings.push({ code: "node.live", path: `${at}.live` });
    }
    for (const attr of RELATION_ATTRS) {
      const normalized = normalizeIdList(node[attr]);
      if (normalized === null) findings.push({ code: "node.reference-format", path: `${at}.${attr}` });
    }
  }
  return findings;
}

/** @param {unknown} input */
export function referenceIndex(input) {
  const map = new Map();
  if (!Array.isArray(input)) return map;
  for (const node of input) {
    if (!objectRecord(node) || !safeIdentifier(node.id)) continue;
    const matches = map.get(node.id) ?? [];
    matches.push(node);
    map.set(node.id, matches);
  }
  return map;
}

/** @param {unknown} input */
export function relationFindings(input) {
  const findings = [];
  if (!Array.isArray(input)) return [{ code: "relations.array", path: "nodes" }];
  const index = referenceIndex(input);
  input.forEach((node, position) => {
    if (!objectRecord(node)) return;
    for (const attr of RELATION_ATTRS) {
      const values = normalizeIdList(node[attr]);
      if (values === null) continue;
      if (new Set(values).size !== values.length) {
        findings.push({ code: "relation.repeated-ref", path: `nodes[${position}].${attr}` });
      }
      for (const id of values) {
        const targets = index.get(id) ?? [];
        if (targets.length === 0) findings.push({ code: "relation.dangling", path: `nodes[${position}].${attr}` });
        if (targets.length > 1) findings.push({ code: "relation.ambiguous", path: `nodes[${position}].${attr}` });
        if (targets.length === 1 && attr === "activeDescendant" && (targets[0].hidden || targets[0].inert)) {
          findings.push({ code: "relation.inactive-target", path: `nodes[${position}].${attr}` });
        }
        if (id === node.id && attr !== "owns") findings.push({ code: "relation.self-ref", path: `nodes[${position}].${attr}` });
      }
    }
  });
  return findings;
}

/** @param {unknown} nodes */
export function tabOrder(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter((node) => objectRecord(node) && node.focusable && !node.hidden && !node.inert && node.tabIndex === 0)
    .map((node) => node.id).filter(safeIdentifier);
}

/** @param {unknown} nodes */
export function landmarkIssues(nodes) {
  const findings = [];
  if (!Array.isArray(nodes)) return [{ code: "landmarks.array", path: "nodes" }];
  const mains = nodes.filter((node) => node?.role === "main" && !node.hidden);
  if (mains.length !== 1) findings.push({ code: "landmarks.main-count", path: "nodes" });
  const headings = nodes.filter((node) => node?.role === "heading" && !node.hidden);
  if (!headings.length) findings.push({ code: "landmarks.heading-missing", path: "nodes" });
  for (const node of headings) {
    if (!Number.isSafeInteger(node.level) || node.level < 1 || node.level > 6) {
      findings.push({ code: "landmarks.heading-level", path: node.id ?? "nodes" });
    }
  }
  return findings;
}

/** @param {unknown} nodes */
export function compositeIssues(nodes) {
  const findings = [];
  if (!Array.isArray(nodes)) return [{ code: "composites.array", path: "nodes" }];
  const index = referenceIndex(nodes);
  for (const node of nodes) {
    if (!objectRecord(node)) continue;
    if (node.role === "tablist") {
      const tabs = normalizeIdList(node.owns);
      if (!tabs?.length) findings.push({ code: "composite.tablist-empty", path: node.id ?? "tablist" });
      else {
        const selected = tabs.map((id) => index.get(id)?.[0]).filter((tab) => tab?.selected === true);
        if (selected.length !== 1) findings.push({ code: "composite.selected-tab-count", path: node.id ?? "tablist" });
        for (const id of tabs) if (index.get(id)?.[0]?.role !== "tab") {
          findings.push({ code: "composite.tab-role", path: node.id ?? "tablist" });
        }
      }
    }
    if (node.role === "radiogroup") {
      const members = normalizeIdList(node.owns);
      if (!members?.length) findings.push({ code: "composite.radio-empty", path: node.id ?? "radiogroup" });
      else if (members.filter((id) => index.get(id)?.[0]?.checked === true).length > 1) {
        findings.push({ code: "composite.radio-multiple", path: node.id ?? "radiogroup" });
      }
    }
    if (node.role === "listbox") {
      const options = normalizeIdList(node.owns);
      if (!options?.length) findings.push({ code: "composite.listbox-empty", path: node.id ?? "listbox" });
      else if (options.some((id) => index.get(id)?.[0]?.role !== "option")) {
        findings.push({ code: "composite.option-role", path: node.id ?? "listbox" });
      }
    }
  }
  return findings;
}

/** @param {unknown} nodes */
export function auditSemanticSnapshot(nodes) {
  const issues = [...inspectNodes(nodes), ...relationFindings(nodes), ...landmarkIssues(nodes), ...compositeIssues(nodes)];
  return issues.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
}

/** @param {unknown} nodes */
export function semanticSummary(nodes) {
  if (!Array.isArray(nodes)) return { status: "UNKNOWN", nodes: 0, focusTargets: 0, issues: 1 };
  const issues = auditSemanticSnapshot(nodes);
  return { status: issues.length ? "HOLD" : "READY", nodes: nodes.length, focusTargets: tabOrder(nodes).length, issues: issues.length };
}

/** @param {unknown} nodes @param {unknown} language */
export function inspectLanguage(nodes, language) {
  if (language !== "en" && language !== "fr") return [{ code: "language.unknown", path: "language" }];
  if (!Array.isArray(nodes)) return [{ code: "language.nodes", path: "nodes" }];
  const findings = [];
  nodes.forEach((node, index) => {
    if (!objectRecord(node)) return;
    if (objectRecord(node.copy)) {
      if (!safeCopy(node.copy[language])) findings.push({ code: "language.copy", path: `nodes[${index}].copy.${language}` });
      if (language === "fr" && safeCopy(node.copy.fr)) {
        const value = node.copy.fr;
        if (value.includes("'")) findings.push({ code: "language.apostrophe", path: `nodes[${index}].copy.fr` });
        for (let i = 0; i < value.length; i += 1) {
          const ch = value[i];
          if (ch === ":" && i > 0 && value[i - 1] !== "\u00A0") {
            findings.push({ code: "language.colon", path: `nodes[${index}].copy.fr` });
          }
          if ([";", "!", "?"].includes(ch) && i > 0 && value[i - 1] !== "\u202F") {
            findings.push({ code: "language.narrow", path: `nodes[${index}].copy.fr` });
          }
          if (ch === "«" && value[i + 1] !== "\u202F") findings.push({ code: "language.open-quote", path: `nodes[${index}].copy.fr` });
          if (ch === "»" && value[i - 1] !== "\u202F") findings.push({ code: "language.close-quote", path: `nodes[${index}].copy.fr` });
        }
      }
    }
  });
  return findings;
}

/** @param {unknown} nodes */
export function safeNodeInventory(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(objectRecord).map((node) => ({
    id: safeIdentifier(node.id) ? node.id : null,
    role: validRole(node.role) ? node.role : "UNKNOWN",
    focusable: node.focusable === true,
    hidden: node.hidden === true,
    inert: node.inert === true,
    named: accessibleName(node).length > 0,
    refs: RELATION_ATTRS.reduce((total, key) => total + (normalizeIdList(node[key])?.length ?? 0), 0),
  }));
}

/** @param {unknown} nodes */
export function hasLeakedContent(nodes) {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => typeof node?.name === "string" && hasControlCode(node.name));
}
