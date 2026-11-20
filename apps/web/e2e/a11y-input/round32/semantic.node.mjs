import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RELATION_ATTRS, LIVE_POLITENESS, VALID_ROLES,
  validRole, normalizeIdList, accessibleName, inspectNodes,
  referenceIndex, relationFindings, tabOrder, landmarkIssues,
  compositeIssues, auditSemanticSnapshot, semanticSummary,
  inspectLanguage, safeNodeInventory, hasLeakedContent,
} from "./semantic-audit.mjs";
import { node, semanticTree, codes, deepCopy } from "./fixtures.node.mjs";

const tree = () => semanticTree();
const findings = (items) => new Set(codes(items));
const field = (changes) => node(changes);
const copy = (en, fr) => ({ en, fr });

test("relationship attributes remain stable", () => {
  assert.deepEqual(RELATION_ATTRS, ["labelledBy", "describedBy", "controls", "owns", "activeDescendant"]);
});
test("live policies cover off, polite, and assertive", () => {
  assert.deepEqual(LIVE_POLITENESS, ["off", "polite", "assertive"]);
});
test("supported roles include dialog", () => {
  assert.ok(VALID_ROLES.includes("dialog"));
});
test("supported roles include alertdialog", () => {
  assert.ok(VALID_ROLES.includes("alertdialog"));
});
test("supported roles include tablist", () => {
  assert.ok(VALID_ROLES.includes("tablist"));
});
test("supported roles include main", () => {
  assert.ok(VALID_ROLES.includes("main"));
});
test("supported roles include switch", () => {
  assert.ok(VALID_ROLES.includes("switch"));
});
test("role list is immutable", () => {
  assert.equal(Object.isFrozen(VALID_ROLES), true);
});
for (const role of ["button", "link", "checkbox", "radio", "status", "alert", "tab", "tabpanel", "menuitem", "treeitem", "option"]) {
  test(`supported role accepted: ${role}`, () => {
    assert.equal(validRole(role), true);
  });
}
for (const role of ["", "madeup", "button link", null, 0, [], {}]) {
  test(`unknown role rejected: ${String(role)}`, () => {
    assert.equal(validRole(role), false);
  });
}
test("missing IDREF list becomes empty", () => {
  assert.deepEqual(normalizeIdList(undefined), []);
});
test("null IDREF list becomes empty", () => {
  assert.deepEqual(normalizeIdList(null), []);
});
test("empty IDREF list remains empty", () => {
  assert.deepEqual(normalizeIdList([]), []);
});
test("valid IDREF list preserves order", () => {
  assert.deepEqual(normalizeIdList(["one", "two"]), ["one", "two"]);
});
test("invalid IDREF string fails", () => {
  assert.equal(normalizeIdList("one two"), null);
});
test("invalid IDREF item fails", () => {
  assert.equal(normalizeIdList(["bad id"]), null);
});
test("oversized IDREF list fails", () => {
  assert.equal(normalizeIdList(Array(33).fill("one")), null);
});
test("maximum IDREF list is allowed", () => {
  assert.equal(normalizeIdList(Array(32).fill("one")).length, 32);
});
test("accessible name prefers explicit name", () => {
  assert.equal(accessibleName(field({ name: "Explicit", label: "Other" })), "Explicit");
});
test("accessible name falls back to label", () => {
  assert.equal(accessibleName(field({ name: "", label: "Fallback" })), "Fallback");
});
test("buttons can use visible text", () => {
  assert.equal(accessibleName(field({ name: "", label: "", text: "Continue" })), "Continue");
});
test("unrelated region cannot borrow visible text as its name", () => {
  assert.equal(accessibleName(field({ role: "region", name: "", label: "", text: "Copy" })), "");
});
test("non-records have no name", () => {
  assert.equal(accessibleName(null), "");
});
test("valid tree has no node-level issues", () => {
  assert.deepEqual(inspectNodes(tree()), []);
});
test("non-array tree reports type issue", () => {
  assert.ok(findings(inspectNodes(null)).has("tree.array"));
});
test("non-object tree member reports issue", () => {
  assert.ok(findings(inspectNodes([null])).has("node.object"));
});
test("duplicate node IDs are reported", () => {
  assert.ok(findings(inspectNodes([field(), field()])).has("node.duplicate-id"));
});
test("missing node ID is reported", () => {
  assert.ok(findings(inspectNodes([field({ id: null })])).has("node.id"));
});
test("invalid ARIA role is reported", () => {
  assert.ok(findings(inspectNodes([field({ role: "invalid" })])).has("node.role"));
});
test("invalid focusable flag is reported", () => {
  assert.ok(findings(inspectNodes([field({ focusable: "yes" })])).has("node.focusable"));
});
test("invalid hidden flag is reported", () => {
  assert.ok(findings(inspectNodes([field({ hidden: null })])).has("node.hidden"));
});
test("invalid inert flag is reported", () => {
  assert.ok(findings(inspectNodes([field({ inert: 1 })])).has("node.inert"));
});
test("positive tabindex is reported", () => {
  assert.ok(findings(inspectNodes([field({ tabIndex: 2 })])).has("node.tab-index"));
});
test("hidden focus target is reported", () => {
  assert.ok(findings(inspectNodes([field({ hidden: true })])).has("node.hidden-focus"));
});
test("inert focus target is reported", () => {
  assert.ok(findings(inspectNodes([field({ inert: true })])).has("node.hidden-focus"));
});
test("button with negative Tab index is reported", () => {
  assert.ok(findings(inspectNodes([field({ tabIndex: -1 })])).has("node.unreachable"));
});
test("dialog without name is reported", () => {
  assert.ok(findings(inspectNodes([field({ role: "dialog", name: "", label: "" })])).has("node.dialog-name"));
});
test("button without accessible name is reported", () => {
  assert.ok(findings(inspectNodes([field({ name: "", label: "", text: "" })])).has("node.control-name"));
});
test("invalid politeness is reported", () => {
  assert.ok(findings(inspectNodes([field({ live: "aggressive" })])).has("node.live"));
});
test("invalid IDREF format is reported", () => {
  assert.ok(findings(inspectNodes([field({ describedBy: "not-array" })])).has("node.reference-format"));
});
test("valid IDs appear in reference index", () => {
  assert.equal(referenceIndex(tree()).get("start").length, 1);
});
test("duplicate IDs remain observable in reference index", () => {
  assert.equal(referenceIndex([field(), field()]).get("start").length, 2);
});
test("invalid nodes are omitted from index", () => {
  assert.equal(referenceIndex([null, field({ id: null })]).size, 0);
});
test("missing reference is reported", () => {
  assert.ok(findings(relationFindings([field({ controls: ["missing"] })])).has("relation.dangling"));
});
test("ambiguous reference is reported", () => {
  const nodes = [field({ id: "opener", controls: ["target"] }), field({ id: "target" }), field({ id: "target" })];
  assert.ok(findings(relationFindings(nodes)).has("relation.ambiguous"));
});
test("repeated reference is reported", () => {
  assert.ok(findings(relationFindings([field({ controls: ["target", "target"] }), field({ id: "target" })])).has("relation.repeated-ref"));
});
test("self reference is reported", () => {
  assert.ok(findings(relationFindings([field({ labelledBy: ["start"] })])).has("relation.self-ref"));
});
test("hidden active descendant is reported", () => {
  const nodes = [field({ activeDescendant: ["option-one"] }), field({ id: "option-one", hidden: true })];
  assert.ok(findings(relationFindings(nodes)).has("relation.inactive-target"));
});
test("inert active descendant is reported", () => {
  const nodes = [field({ activeDescendant: ["option-one"] }), field({ id: "option-one", inert: true })];
  assert.ok(findings(relationFindings(nodes)).has("relation.inactive-target"));
});
test("normal reference has no findings", () => {
  assert.deepEqual(relationFindings([field({ controls: ["target"] }), field({ id: "target" })]), []);
});
test("reference audit rejects non-array input", () => {
  assert.ok(findings(relationFindings(null)).has("relations.array"));
});
test("Tab order reflects visible active controls", () => {
  assert.deepEqual(tabOrder(tree()), ["start"]);
});
test("Tab order removes hidden controls", () => {
  assert.deepEqual(tabOrder([field({ hidden: true })]), []);
});
test("Tab order removes inert controls", () => {
  assert.deepEqual(tabOrder([field({ inert: true })]), []);
});
test("Tab order removes programmatic targets", () => {
  assert.deepEqual(tabOrder([field({ tabIndex: -1 })]), []);
});
test("landmark audit accepts one main and heading", () => {
  assert.deepEqual(landmarkIssues(tree()), []);
});
test("landmark audit rejects missing main", () => {
  assert.ok(findings(landmarkIssues(tree().filter((item) => item.id !== "main"))).has("landmarks.main-count"));
});
test("landmark audit rejects duplicate mains", () => {
  assert.ok(findings(landmarkIssues([...tree(), field({ id: "second-main", role: "main" })])).has("landmarks.main-count"));
});
test("landmark audit rejects missing heading", () => {
  assert.ok(findings(landmarkIssues(tree().filter((item) => item.id !== "heading"))).has("landmarks.heading-missing"));
});
test("landmark audit rejects malformed heading level", () => {
  assert.ok(findings(landmarkIssues(tree().map((item) => item.id === "heading" ? { ...item, level: 7 } : item))).has("landmarks.heading-level"));
});
test("landmark audit accepts heading level six", () => {
  assert.deepEqual(landmarkIssues(tree().map((item) => item.id === "heading" ? { ...item, level: 6 } : item)), []);
});
test("empty tab list is reported", () => {
  assert.ok(findings(compositeIssues([field({ role: "tablist", owns: [] })])).has("composite.tablist-empty"));
});
test("tab list requires exactly one selected tab", () => {
  const group = field({ id: "tabs", role: "tablist", owns: ["tab-one", "tab-two"] });
  const first = field({ id: "tab-one", role: "tab", selected: true });
  const second = field({ id: "tab-two", role: "tab", selected: true });
  assert.ok(findings(compositeIssues([group, first, second])).has("composite.selected-tab-count"));
});
test("tab list requires tab roles", () => {
  const group = field({ id: "tabs", role: "tablist", owns: ["wrong"] });
  assert.ok(findings(compositeIssues([group, field({ id: "wrong", role: "button" })])).has("composite.tab-role"));
});
test("valid tab list has no composite findings", () => {
  const group = field({ id: "tabs", role: "tablist", owns: ["one-tab", "two-tab"] });
  const first = field({ id: "one-tab", role: "tab", selected: true });
  const second = field({ id: "two-tab", role: "tab", selected: false });
  assert.deepEqual(compositeIssues([group, first, second]), []);
});
test("radio group refuses multiple checks", () => {
  const group = field({ id: "radio-group", role: "radiogroup", owns: ["one-radio", "two-radio"] });
  const first = field({ id: "one-radio", role: "radio", checked: true });
  const second = field({ id: "two-radio", role: "radio", checked: true });
  assert.ok(findings(compositeIssues([group, first, second])).has("composite.radio-multiple"));
});
test("empty radio group is reported", () => {
  assert.ok(findings(compositeIssues([field({ role: "radiogroup", owns: [] })])).has("composite.radio-empty"));
});
test("listbox requires options", () => {
  assert.ok(findings(compositeIssues([field({ role: "listbox", owns: [] })])).has("composite.listbox-empty"));
});
test("listbox requires option roles", () => {
  const group = field({ id: "choices", role: "listbox", owns: ["wrong"] });
  assert.ok(findings(compositeIssues([group, field({ id: "wrong", role: "button" })])).has("composite.option-role"));
});
test("valid listbox has no composite findings", () => {
  const group = field({ id: "choices", role: "listbox", owns: ["first-choice"] });
  assert.deepEqual(compositeIssues([group, field({ id: "first-choice", role: "option" })]), []);
});
test("composite audit rejects non-array input", () => {
  assert.ok(findings(compositeIssues(null)).has("composites.array"));
});
test("complete synthetic document is clean", () => {
  assert.deepEqual(auditSemanticSnapshot(tree()), []);
});
test("document summary is ready when clean", () => {
  assert.equal(semanticSummary(tree()).status, "READY");
});
test("document summary holds on missing heading", () => {
  assert.equal(semanticSummary(tree().filter((item) => item.id !== "heading")).status, "HOLD");
});
test("invalid document summary stays unknown", () => {
  assert.equal(semanticSummary(null).status, "UNKNOWN");
});
test("document summary counts focus targets", () => {
  assert.equal(semanticSummary(tree()).focusTargets, 1);
});
test("English copy accepts supplied content", () => {
  assert.deepEqual(inspectLanguage([field({ copy: copy("Ready", "Prêt") })], "en"), []);
});
test("French copy accepts valid no-break colon", () => {
  assert.deepEqual(inspectLanguage([field({ copy: copy("Ready", "État\u00A0: prêt") })], "fr"), []);
});
test("French copy accepts valid narrow question", () => {
  assert.deepEqual(inspectLanguage([field({ copy: copy("Question", "Continuer\u202F?") })], "fr"), []);
});
test("French copy accepts guillemets with narrow space", () => {
  assert.deepEqual(inspectLanguage([field({ copy: copy("Hello", "«\u202FBonjour\u202F»") })], "fr"), []);
});
test("French copy rejects straight apostrophe", () => {
  assert.ok(findings(inspectLanguage([field({ copy: copy("Action", "L'action") })], "fr")).has("language.apostrophe"));
});
test("French copy rejects ordinary colon spacing", () => {
  assert.ok(findings(inspectLanguage([field({ copy: copy("State", "État : prêt") })], "fr")).has("language.colon"));
});
test("French copy rejects ordinary question spacing", () => {
  assert.ok(findings(inspectLanguage([field({ copy: copy("Continue", "Continuer ?") })], "fr")).has("language.narrow"));
});
test("French copy rejects missing open guillemet space", () => {
  assert.ok(findings(inspectLanguage([field({ copy: copy("Hello", "«Bonjour\u202F»") })], "fr")).has("language.open-quote"));
});
test("French copy rejects missing close guillemet space", () => {
  assert.ok(findings(inspectLanguage([field({ copy: copy("Hello", "«\u202FBonjour»") })], "fr")).has("language.close-quote"));
});
test("missing French copy is reported", () => {
  assert.ok(findings(inspectLanguage([field({ copy: { en: "Ready" } })], "fr")).has("language.copy"));
});
test("invalid language stays unknown", () => {
  assert.ok(findings(inspectLanguage(tree(), "es")).has("language.unknown"));
});
test("safe inventory excludes raw text", () => {
  assert.equal(JSON.stringify(safeNodeInventory(tree())).includes("Introduction"), false);
});
test("safe inventory counts references", () => {
  assert.equal(safeNodeInventory([field({ labelledBy: ["target"], describedBy: ["target"] })])[0].refs, 2);
});
test("safe inventory maintains semantic role", () => {
  assert.equal(safeNodeInventory(tree()).find((item) => item.id === "main")?.role, "main");
});
test("safe inventory replaces unsupported role with UNKNOWN", () => {
  assert.equal(safeNodeInventory([field({ role: "other" })])[0].role, "UNKNOWN");
});
test("invalid visible names are flagged without disclosure", () => {
  assert.equal(hasLeakedContent([field({ name: "Bad\u0000Name" })]), true);
});
test("valid visible names are safe", () => {
  assert.equal(hasLeakedContent(tree()), false);
});
test("audit does not mutate source nodes", () => {
  const original = tree();
  const copyOfTree = deepCopy(original);
  auditSemanticSnapshot(original);
  assert.deepEqual(original, copyOfTree);
});
