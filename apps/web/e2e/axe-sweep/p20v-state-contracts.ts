/**
 * P20V: static accessibility-state contracts for widgets and navigational state.
 * A snapshot describes rendered semantics, never a claim about a real place.
 * The browser adapter performs read-only inspection; this file has no side effects.
 */
export type StateName =
  | "aria-expanded" | "aria-pressed" | "aria-selected" | "aria-sort"
  | "aria-current" | "aria-checked" | "aria-busy" | "aria-activedescendant";

export interface StateNode {
  readonly id: string;
  readonly tag: string;
  readonly role: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly scope: string;
  readonly parentId: string | null;
  readonly ownedIds: readonly string[];
  readonly states: Readonly<Partial<Record<StateName, string>>>;
}

export interface StateIssue {
  readonly code: string;
  readonly at: string;
  readonly detail: string;
}

export interface StateSnapshot {
  readonly nodes: readonly StateNode[];
  readonly documentLanguage: string;
  readonly route: string;
}

const TOKENS: Readonly<Record<Exclude<StateName, "aria-activedescendant">, readonly string[]>> = {
  "aria-expanded": ["true", "false"],
  "aria-pressed": ["true", "false", "mixed"],
  "aria-selected": ["true", "false"],
  "aria-sort": ["ascending", "descending", "none", "other"],
  "aria-current": ["page", "step", "location", "date", "time", "true", "false"],
  "aria-checked": ["true", "false", "mixed"],
  "aria-busy": ["true", "false"],
};

const EXPANDABLE = new Set([
  "button", "combobox", "link", "menuitem", "menuitemcheckbox", "menuitemradio",
  "treeitem", "row", "tab", "gridcell", "rowheader", "columnheader",
]);
const PRESSABLE = new Set(["button"]);
const SELECTABLE = new Set(["option", "tab", "row", "gridcell", "treeitem"]);
const SORTABLE = new Set(["columnheader", "rowheader"]);
const CHECKABLE = new Set(["checkbox", "menuitemcheckbox", "radio", "menuitemradio", "switch", "option", "treeitem"]);
const COMPOSITES = new Set(["combobox", "listbox", "grid", "tree", "menu", "tablist", "textbox", "searchbox"]);
const ACTIVE_TARGETS = new Set(["option", "gridcell", "row", "treeitem", "menuitem", "menuitemcheckbox", "menuitemradio", "tab"]);
const NATIVE_ROLES: Readonly<Record<string, string>> = {
  button: "button", select: "combobox", a: "link", textarea: "textbox", th: "columnheader",
  nav: "navigation", main: "main", table: "table", progress: "progressbar",
};
const STATE_NAMES: readonly StateName[] = [
  "aria-expanded", "aria-pressed", "aria-selected", "aria-sort", "aria-current",
  "aria-checked", "aria-busy", "aria-activedescendant",
];

export function effectiveRole(node: Pick<StateNode, "role" | "tag">): string {
  if (node.role.trim()) return node.role.trim().toLowerCase();
  return NATIVE_ROLES[node.tag.toLowerCase()] ?? "";
}

function finding(code: string, at: string, detail: string): StateIssue {
  return { code, at: at || "(no id)", detail };
}

export function isStateToken(name: StateName, value: string): boolean {
  if (name === "aria-activedescendant") return value.trim().length > 0 && !/\s/.test(value);
  const options = TOKENS[name];
  return options.includes(value.trim().toLowerCase());
}

export function isActiveCurrent(value: string | undefined): boolean {
  return value !== undefined && value.trim().toLowerCase() !== "false";
}

export function duplicateNodeIds(nodes: readonly StateNode[]): StateIssue[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (node.id) counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1)
    .map(([id, count]) => finding("duplicate-id", id, `${count} instances`));
}

/**
 * A widget's rendered state must agree with its advertised role. We do not
 * invent a role or infer expanded state from visual CSS classes.
 */
export function stateRoleIssues(nodes: readonly StateNode[]): StateIssue[] {
  const issues: StateIssue[] = [];
  for (const node of nodes) {
    const role = effectiveRole(node);
    const at = node.id || `${node.tag}[${role || "none"}]`;
    for (const name of STATE_NAMES) {
      const raw = node.states[name];
      if (raw === undefined) continue;
      if (!isStateToken(name, raw)) {
        issues.push(finding("invalid-state", at, `${name}=${JSON.stringify(raw)}`));
        continue;
      }
      if (name === "aria-expanded" && !EXPANDABLE.has(role)) {
        issues.push(finding("expanded-role", at, `unsupported role ${role || "none"}`));
      }
      if (name === "aria-pressed" && !PRESSABLE.has(role)) {
        issues.push(finding("pressed-role", at, `unsupported role ${role || "none"}`));
      }
      if (name === "aria-selected" && !SELECTABLE.has(role)) {
        issues.push(finding("selected-role", at, `unsupported role ${role || "none"}`));
      }
      if (name === "aria-sort" && !SORTABLE.has(role)) {
        issues.push(finding("sort-role", at, `unsupported role ${role || "none"}`));
      }
      if (name === "aria-checked" && !CHECKABLE.has(role)) {
        issues.push(finding("checked-role", at, `unsupported role ${role || "none"}`));
      }
      if (name === "aria-activedescendant" && !COMPOSITES.has(role)) {
        issues.push(finding("active-owner-role", at, `unsupported role ${role || "none"}`));
      }
      if (node.disabled && raw === "true" && name === "aria-busy") {
        // Busy disabled controls are allowed: disabling a submit while a request
        // is pending should not become an artificial accessibility finding.
        continue;
      }
    }
  }
  return issues;
}

/** A visible active-current destination must be unique within its navigation. */
export function currentIssues(nodes: readonly StateNode[]): StateIssue[] {
  const groups = new Map<string, StateNode[]>();
  for (const node of nodes) {
    if (!node.visible || !isActiveCurrent(node.states["aria-current"])) continue;
    const group = node.scope || "document";
    const collection = groups.get(group) ?? [];
    collection.push(node);
    groups.set(group, collection);
  }
  const issues: StateIssue[] = [];
  for (const [scope, group] of groups) {
    if (group.length > 1) {
      issues.push(finding("multiple-current", scope, group.map((node) => node.id || node.tag).join(", ")));
    }
    for (const node of group) {
      const role = effectiveRole(node);
      if (role !== "link" && role !== "step" && role !== "option" && role !== "tab") {
        issues.push(finding("current-role", node.id, `unexpected role ${role || "none"}`));
      }
    }
  }
  return issues;
}

/** Only one non-none sorted column or row may be active per table. */
export function sortIssues(nodes: readonly StateNode[]): StateIssue[] {
  const sorted = new Map<string, StateNode[]>();
  for (const node of nodes) {
    if (!node.visible) continue;
    const value = node.states["aria-sort"];
    if (value === undefined || value === "none") continue;
    if (!isStateToken("aria-sort", value)) continue;
    const scope = node.scope || "table-unknown";
    sorted.set(scope, [...(sorted.get(scope) ?? []), node]);
  }
  return [...sorted].filter(([, nodesInTable]) => nodesInTable.length > 1)
    .map(([scope, nodesInTable]) => finding("multiple-sort", scope, nodesInTable.map((n) => n.id || n.tag).join(", ")));
}

export interface ActiveDescendantRelation {
  readonly owner: StateNode;
  readonly target: StateNode | null;
  readonly matchingTargets: number;
  readonly contained: boolean;
  readonly owned: boolean;
}

/** Comboboxes may own a listbox outside their DOM subtree via aria-owns. */
export function activeRelationIssues(relation: ActiveDescendantRelation): StateIssue[] {
  const { owner, target, matchingTargets, contained, owned } = relation;
  const raw = owner.states["aria-activedescendant"];
  if (raw === undefined) return [];
  const at = owner.id || owner.tag;
  if (!isStateToken("aria-activedescendant", raw)) return [finding("invalid-active-id", at, raw)];
  if (matchingTargets !== 1 || !target) {
    return [finding("active-target-count", at, `${matchingTargets} targets for ${raw}`)];
  }
  const issues: StateIssue[] = [];
  if (!contained && !owned) issues.push(finding("active-unowned", at, raw));
  if (!target.visible) issues.push(finding("active-hidden", at, raw));
  if (!ACTIVE_TARGETS.has(effectiveRole(target))) {
    issues.push(finding("active-target-role", at, effectiveRole(target) || "none"));
  }
  return issues;
}

export function activeIssues(nodes: readonly StateNode[], relations: readonly ActiveDescendantRelation[]): StateIssue[] {
  const expected = nodes.filter((node) => node.states["aria-activedescendant"] !== undefined);
  const issues: StateIssue[] = [];
  for (const node of expected) {
    const matches = relations.filter((relation) => relation.owner === node);
    if (matches.length !== 1) {
      issues.push(finding("active-relation-missing", node.id || node.tag, `${matches.length} relation entries`));
      continue;
    }
    issues.push(...activeRelationIssues(matches[0]!));
  }
  return issues;
}

export interface StateAuditInput extends StateSnapshot {
  readonly relations: readonly ActiveDescendantRelation[];
}

export function auditState(input: StateAuditInput): StateIssue[] {
  return [
    ...duplicateNodeIds(input.nodes),
    ...stateRoleIssues(input.nodes),
    ...currentIssues(input.nodes),
    ...sortIssues(input.nodes),
    ...activeIssues(input.nodes, input.relations),
  ];
}

export function describeStateIssues(issues: readonly StateIssue[], max = 30): string {
  const lines = [...new Set(issues.map((issue) => `${issue.code} @ ${issue.at}: ${issue.detail}`))];
  const extra = Math.max(0, lines.length - max);
  return [...lines.slice(0, max), ...(extra ? [`${extra} more issues`] : [])].join("\n");
}
