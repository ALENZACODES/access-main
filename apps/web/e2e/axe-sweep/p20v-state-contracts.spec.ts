import { expect, test } from "@playwright/test";
import {
  activeIssues, activeRelationIssues, auditState, currentIssues,
  describeStateIssues, duplicateNodeIds, effectiveRole, isActiveCurrent,
  isStateToken, sortIssues, stateRoleIssues,
  type ActiveDescendantRelation, type StateNode,
} from "./p20v-state-contracts";

const base = (changes: Partial<StateNode> = {}): StateNode => ({
  id: "control", tag: "button", role: "", visible: true, disabled: false,
  scope: "document", parentId: null, ownedIds: [], states: {}, ...changes,
});
const codes = (issues: readonly { code: string }[]) => issues.map((item) => item.code);
const input = (nodes: readonly StateNode[]) => ({ route: "/fixture", documentLanguage: "fr", nodes, relations: [] });

test.describe("P20V role and state contracts", () => {
  test("unmodified controls do not invent state", () => {
    expect(auditState(input([base()]))).toEqual([]);
  });
  for (const [tag, role] of [
    ["button", "button"], ["a", "link"], ["textarea", "textbox"],
    ["th", "columnheader"], ["main", "main"], ["nav", "navigation"],
  ] as const) {
    test(`native ${tag} resolves to ${role}`, () => {
      expect(effectiveRole(base({ tag }))).toBe(role);
    });
  }
  test("explicit role overrides native role", () => {
    expect(effectiveRole(base({ role: "Switch" }))).toBe("switch");
  });
  test("unknown element has no invented role", () => {
    expect(effectiveRole(base({ tag: "span" }))).toBe("");
  });
  for (const value of ["true", "false"]) {
    test(`expanded value ${value} is accepted`, () => {
      expect(isStateToken("aria-expanded", value)).toBe(true);
    });
  }
  for (const value of ["yes", "1", "", "undefined", "open", "true false"]) {
    test(`expanded value ${JSON.stringify(value)} is rejected`, () => {
      expect(isStateToken("aria-expanded", value)).toBe(false);
    });
  }
  for (const value of ["ascending", "descending", "none", "other"]) {
    test(`sort token ${value} is accepted`, () => {
      expect(isStateToken("aria-sort", value)).toBe(true);
    });
  }
  for (const value of ["asc", "desc", "0", "", "null"]) {
    test(`sort token ${JSON.stringify(value)} is rejected`, () => {
      expect(isStateToken("aria-sort", value)).toBe(false);
    });
  }
  for (const value of ["page", "step", "location", "date", "time", "true", "false"]) {
    test(`current token ${value} is legal`, () => {
      expect(isStateToken("aria-current", value)).toBe(true);
    });
  }
  for (const value of ["maybe", "y", "one", "", "current"]) {
    test(`current token ${JSON.stringify(value)} is illegal`, () => {
      expect(isStateToken("aria-current", value)).toBe(false);
    });
  }
  for (const name of ["aria-selected", "aria-busy", "aria-checked"] as const) {
    test(`${name} does not allow arbitrary sentences`, () => {
      expect(isStateToken(name, "maybe later")).toBe(false);
    });
  }
  test("active descendants require one ID token", () => {
    expect(isStateToken("aria-activedescendant", "option-1")).toBe(true);
    expect(isStateToken("aria-activedescendant", "option-1 option-2")).toBe(false);
    expect(isStateToken("aria-activedescendant", " ")).toBe(false);
  });
  test("disabled and busy is allowed during an action", () => {
    expect(stateRoleIssues([base({ disabled: true, states: { "aria-busy": "true" } })])).toEqual([]);
  });
  test("bad aria-expanded value is reported", () => {
    expect(codes(stateRoleIssues([base({ states: { "aria-expanded": "open" } })]))).toEqual(["invalid-state"]);
  });
  test("button supports expanded false and pressed mixed", () => {
    expect(stateRoleIssues([base({ states: { "aria-expanded": "false", "aria-pressed": "mixed" } })])).toEqual([]);
  });
  test("nonbutton cannot expose pressed", () => {
    expect(codes(stateRoleIssues([base({ role: "textbox", states: { "aria-pressed": "true" } })]))).toEqual(["pressed-role"]);
  });
  test("switch supports checked", () => {
    expect(stateRoleIssues([base({ role: "switch", states: { "aria-checked": "false" } })])).toEqual([]);
  });
  test("span cannot expose checked", () => {
    expect(codes(stateRoleIssues([base({ tag: "span", states: { "aria-checked": "true" } })]))).toEqual(["checked-role"]);
  });
  test("tab supports selected state", () => {
    expect(stateRoleIssues([base({ role: "tab", states: { "aria-selected": "true" } })])).toEqual([]);
  });
  test("ordinary link cannot expose selected", () => {
    expect(codes(stateRoleIssues([base({ role: "link", states: { "aria-selected": "true" } })]))).toEqual(["selected-role"]);
  });
  test("columnheader supports sorting", () => {
    expect(stateRoleIssues([base({ tag: "th", states: { "aria-sort": "ascending" } })])).toEqual([]);
  });
  test("ordinary button cannot expose sorting", () => {
    expect(codes(stateRoleIssues([base({ states: { "aria-sort": "descending" } })]))).toEqual(["sort-role"]);
  });
  test("combobox supports active descendant", () => {
    expect(stateRoleIssues([base({ role: "combobox", states: { "aria-activedescendant": "item" } })])).toEqual([]);
  });
  test("plain button cannot own active descendant", () => {
    expect(codes(stateRoleIssues([base({ states: { "aria-activedescendant": "item" } })]))).toEqual(["active-owner-role"]);
  });
  test("multiple invalid states surface separately", () => {
    const errors = stateRoleIssues([base({ role: "textbox", states: { "aria-pressed": "bad", "aria-sort": "up" } })]);
    expect(codes(errors)).toEqual(["invalid-state", "invalid-state"]);
  });
});

test.describe("P20V current destination state", () => {
  test("absent and false are not active", () => {
    expect(isActiveCurrent(undefined)).toBe(false);
    expect(isActiveCurrent("false")).toBe(false);
  });
  test("step and page are active", () => {
    expect(isActiveCurrent("step")).toBe(true);
    expect(isActiveCurrent("page")).toBe(true);
  });
  test("one current destination per navigation is permitted", () => {
    expect(currentIssues([
      base({ id: "one", tag: "a", scope: "#nav", states: { "aria-current": "page" } }),
      base({ id: "two", tag: "a", scope: "#nav", states: { "aria-current": "false" } }),
    ])).toEqual([]);
  });
  test("two current links in one navigation fail", () => {
    expect(codes(currentIssues([
      base({ id: "one", tag: "a", scope: "#nav", states: { "aria-current": "page" } }),
      base({ id: "two", tag: "a", scope: "#nav", states: { "aria-current": "page" } }),
    ]))).toEqual(["multiple-current"]);
  });
  test("independent navigations have independent current entries", () => {
    expect(currentIssues([
      base({ id: "one", tag: "a", scope: "#primary", states: { "aria-current": "page" } }),
      base({ id: "two", tag: "a", scope: "#secondary", states: { "aria-current": "page" } }),
    ])).toEqual([]);
  });
  test("invisible prior current entries do not conflict", () => {
    expect(currentIssues([
      base({ id: "one", tag: "a", scope: "#nav", visible: false, states: { "aria-current": "page" } }),
      base({ id: "two", tag: "a", scope: "#nav", states: { "aria-current": "page" } }),
    ])).toEqual([]);
  });
  test("current attribute on paragraph is flagged", () => {
    expect(codes(currentIssues([base({ tag: "p", states: { "aria-current": "page" } })]))).toEqual(["current-role"]);
  });
});

test.describe("P20V table sorting state", () => {
  const header = (id: string, scope: string, value: string) =>
    base({ id, tag: "th", scope, states: { "aria-sort": value } });
  test("one ascending header passes", () => {
    expect(sortIssues([header("date", "#records", "ascending")])).toEqual([]);
  });
  test("two headers set to none pass", () => {
    expect(sortIssues([header("date", "#records", "none"), header("name", "#records", "none")])).toEqual([]);
  });
  test("two active header sorts in one table fail", () => {
    expect(codes(sortIssues([header("date", "#records", "ascending"), header("name", "#records", "descending")]))).toEqual(["multiple-sort"]);
  });
  test("two independent tables may each sort", () => {
    expect(sortIssues([header("date", "#records", "ascending"), header("name", "#filters", "descending")])).toEqual([]);
  });
  test("hidden headers are ignored for active sorting", () => {
    expect(sortIssues([
      header("date", "#records", "ascending"),
      { ...header("name", "#records", "descending"), visible: false },
    ])).toEqual([]);
  });
  test("unsupported sort token is left to token validation", () => {
    expect(sortIssues([header("date", "#records", "up")])).toEqual([]);
    expect(codes(stateRoleIssues([header("date", "#records", "up")]))).toEqual(["invalid-state"]);
  });
});

test.describe("P20V active-descendant relationships", () => {
  const owner = () => base({ id: "search", role: "combobox", states: { "aria-activedescendant": "item-1" } });
  const option = () => base({ id: "item-1", tag: "li", role: "option" });
  const relation = (changes: Partial<ActiveDescendantRelation> = {}): ActiveDescendantRelation => ({
    owner: owner(), target: option(), matchingTargets: 1, contained: true, owned: false, ...changes,
  });
  test("valid contained option passes", () => {
    expect(activeRelationIssues(relation())).toEqual([]);
  });
  test("valid explicitly owned option passes", () => {
    expect(activeRelationIssues(relation({ contained: false, owned: true }))).toEqual([]);
  });
  test("missing target fails", () => {
    expect(codes(activeRelationIssues(relation({ matchingTargets: 0, target: null })))).toEqual(["active-target-count"]);
  });
  test("duplicate targets fail", () => {
    expect(codes(activeRelationIssues(relation({ matchingTargets: 2 })))).toEqual(["active-target-count"]);
  });
  test("nonowned external target fails", () => {
    expect(codes(activeRelationIssues(relation({ contained: false, owned: false })))).toEqual(["active-unowned"]);
  });
  test("hidden active target fails", () => {
    expect(codes(activeRelationIssues(relation({ target: base({ id: "item-1", role: "option", visible: false }) })))).toEqual(["active-hidden"]);
  });
  test("inappropriate target role fails", () => {
    expect(codes(activeRelationIssues(relation({ target: base({ id: "item-1", tag: "p" }) })))).toEqual(["active-target-role"]);
  });
  test("multiple relationship defects are reported", () => {
    expect(codes(activeRelationIssues(relation({
      contained: false, owned: false,
      target: base({ id: "item-1", role: "button", visible: false }),
    })))).toEqual(["active-unowned", "active-hidden", "active-target-role"]);
  });
  test("missing relation snapshot fails closed", () => {
    const node = owner();
    expect(codes(activeIssues([node], []))).toEqual(["active-relation-missing"]);
  });
  test("present relationship snapshot passes", () => {
    const node = owner();
    expect(activeIssues([node, option()], [relation({ owner: node })])).toEqual([]);
  });
  test("multiple relationship snapshot entries fail", () => {
    const node = owner();
    expect(codes(activeIssues([node], [relation({ owner: node }), relation({ owner: node })]))).toEqual(["active-relation-missing"]);
  });
  test("bad active ID is detected before target lookup", () => {
    const bad = base({ id: "search", role: "combobox", states: { "aria-activedescendant": "two ids" } });
    expect(codes(activeRelationIssues(relation({ owner: bad })))).toEqual(["invalid-active-id"]);
  });
});

test.describe("P20V full aggregation", () => {
  test("duplicate identifiers reject hidden duplicates", () => {
    expect(codes(duplicateNodeIds([
      base({ id: "same" }), base({ id: "same", visible: false }),
    ]))).toEqual(["duplicate-id"]);
  });
  test("empty identifiers do not count as duplicates", () => {
    expect(duplicateNodeIds([base({ id: "" }), base({ id: "" })])).toEqual([]);
  });
  test("complete audit aggregates route errors", () => {
    const nodes = [
      base({ id: "item", role: "textbox", states: { "aria-pressed": "true" } }),
      base({ id: "item", tag: "a", scope: "#nav", states: { "aria-current": "page" } }),
      base({ id: "next", tag: "a", scope: "#nav", states: { "aria-current": "page" } }),
    ];
    expect(codes(auditState(input(nodes)))).toEqual(["duplicate-id", "pressed-role", "multiple-current"]);
  });
  test("report keeps distinct findings", () => {
    const issues = [
      { code: "a", at: "one", detail: "first" },
      { code: "b", at: "two", detail: "second" },
    ];
    expect(describeStateIssues(issues)).toContain("a @ one: first");
    expect(describeStateIssues(issues)).toContain("b @ two: second");
  });
  test("report removes repeated findings", () => {
    const issue = { code: "a", at: "one", detail: "first" };
    expect(describeStateIssues([issue, issue])).toBe("a @ one: first");
  });
  test("report truncates explicitly", () => {
    const issues = [
      { code: "a", at: "one", detail: "first" },
      { code: "b", at: "two", detail: "second" },
      { code: "c", at: "three", detail: "third" },
    ];
    expect(describeStateIssues(issues, 1)).toContain("2 more issues");
  });
});
