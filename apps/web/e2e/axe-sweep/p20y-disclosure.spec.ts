import { expect, test } from "@playwright/test";
import {
  compositeIssues, disclosureIssues, hasState, keyboardMoveIssues, multiWidgetIssues, nextRovingTarget,
  stateIssues, transitionIssues, widgetAuditSummary, widgetName,
  type CompositeObservation, type DisclosureObservation, type WidgetEvent,
  type WidgetObservation,
} from "./p20y-disclosure";

const widget = (changes: Partial<WidgetObservation> = {}): WidgetObservation => ({
  id: "open", role: "button", label: "Open options", visible: true,
  disabled: false, expanded: "false", pressed: null, selected: null,
  checked: null, controls: ["panel"], labelledBy: [], activeDescendant: null,
  tabIndex: 0, parentId: null, containerId: null, ...changes,
});

const disclosure = (changes: Partial<DisclosureObservation> = {}): DisclosureObservation => ({
  trigger: widget(), panelId: "panel", panelCount: 1, panelVisible: false,
  panelInert: true, modal: false, focusInside: false,
  backdropFocusable: false, ...changes,
});

const event = (changes: Partial<WidgetEvent> = {}): WidgetEvent => ({
  type: "open", before: widget(), after: widget({ expanded: "true" }),
  expectedFocus: "open", focusAfter: "open", interrupted: false, ...changes,
});

const item = (id: string, tabIndex: number, changes: Partial<WidgetObservation> = {}): WidgetObservation => widget({
  id, role: "tab", label: id, expanded: null, controls: [],
  selected: tabIndex === 0 ? "true" : "false", tabIndex, ...changes,
});

const composite = (changes: Partial<CompositeObservation> = {}): CompositeObservation => ({
  id: "tabs", kind: "tabs", children: [item("first", 0), item("second", -1)],
  activeId: "first", selectedIds: ["first"], multiple: false,
  wrapNavigation: true, ...changes,
});

const codes = (items: readonly { code: string }[]): string[] => items.map((item) => item.code);

test("a named disclosure button with a target passes", () => {
  expect(stateIssues(widget())).toEqual([]);
});

for (const state of ["true", "false", "mixed"] as const) {
  test(`recognizes state ${state}`, () => {
    expect(hasState(state)).toBe(true);
  });
}

test("absence of ARIA state remains distinct from false", () => {
  expect(hasState(null)).toBe(false);
  expect(widget({ expanded: null }).expanded).toBeNull();
});

for (const [property, changes] of [
  ["expanded-role", { role: "tabpanel" }],
  ["expanded-no-controls", { controls: [] }],
  ["mixed-state-invalid", { expanded: "mixed" }],
  ["widget-unnamed", { label: "" }],
  ["widget-tabindex", { tabIndex: -3 }],
  ["empty-controls-token", { controls: [""] }],
  ["empty-label-token", { labelledBy: [""] }],
] as const) {
  test(`finds ${property} for disclosure control`, () => {
    expect(codes(stateIssues(widget(changes as Partial<WidgetObservation>)))).toContain(property);
  });
}

test("ARIA state role compatibility is checked for pressed and selected", () => {
  const selectedOnButton = widget({ selected: "true" });
  const pressedOnOption = widget({ role: "option", pressed: "true", expanded: null });
  expect(codes(stateIssues(selectedOnButton))).toContain("selected-role");
  expect(codes(stateIssues(pressedOnOption))).toContain("pressed-role");
});

test("active descendant requires a composite container role", () => {
  expect(codes(stateIssues(widget({ activeDescendant: "item1" })))).toContain("active-descendant-role");
  expect(stateIssues(widget({ role: "combobox", activeDescendant: "item1" }))).toEqual([]);
});

test("valid checked state belongs to compatible roles", () => {
  expect(stateIssues(widget({ role: "option", checked: "true", expanded: null }))).toEqual([]);
  expect(codes(stateIssues(widget({ checked: "true" })))).toContain("checked-role");
});

test("hidden widgets and disabled widgets do not make interactive claims", () => {
  expect(stateIssues(widget({ visible: false, label: "" }))).toEqual([]);
  expect(stateIssues(widget({ disabled: true, label: "" }))).toEqual([]);
});

test("the collapsed disclosure snapshot passes", () => {
  expect(disclosureIssues(disclosure())).toEqual([]);
});

test("expanded disclosure with visible active panel passes", () => {
  expect(disclosureIssues(disclosure({
    trigger: widget({ expanded: "true" }), panelVisible: true,
    panelInert: false,
  }))).toEqual([]);
});

for (const [changes, expected] of [
  [{ trigger: widget({ expanded: null }) }, "disclosure-no-state"],
  [{ trigger: widget({ controls: ["other"] }) }, "disclosure-controls"],
  [{ panelCount: 0 }, "disclosure-panel-count"],
  [{ panelCount: 2 }, "disclosure-panel-count"],
  [{ trigger: widget({ expanded: "true" }) }, "disclosure-open-hidden"],
  [{ trigger: widget({ expanded: "true" }), panelVisible: true }, "disclosure-open-inert"],
  [{ panelVisible: true, panelInert: false }, "disclosure-closed-visible"],
] as const) {
  test(`disclosure catches ${expected}: ${JSON.stringify(changes)}`,  () => {
    expect(codes(disclosureIssues(disclosure(changes)))).toContain(expected);
  });
}

test("modal focus must not leak to the page", () => {
  const before = disclosure({ trigger: widget({ expanded: "true" }),
    panelVisible: true, panelInert: false, modal: true, focusInside: false });
  expect(codes(disclosureIssues(before))).toContain("modal-focus-outside");
});

test("modal background controls must be inert", () => {
  const before = disclosure({ trigger: widget({ expanded: "true" }),
    panelVisible: true, panelInert: false, modal: true, focusInside: true,
    backdropFocusable: true });
  expect(codes(disclosureIssues(before))).toContain("modal-background-active");
});

test("opening and closing transitions pass when controls update", () => {
  expect(transitionIssues(event())).toEqual([]);
  expect(transitionIssues(event({ type: "close", before: widget({ expanded: "true" }),
    after: widget({ expanded: "false" }) }))).toEqual([]);
});

for (const [changes, expected] of [
  [{ after: widget() }, "widget-open-no-change"],
  [{ type: "close", after: widget({ expanded: "true" }) }, "widget-close-no-change"],
  [{ type: "escape", after: widget({ expanded: "true" }) }, "widget-close-no-change"],
  [{ type: "select", after: widget() }, "widget-select-no-change"],
  [{ type: "deselect", after: widget() }, "widget-deselect-no-change"],
  [{ focusAfter: null }, "widget-focus-mismatch"],
  [{ interrupted: true }, "widget-event-interrupted"],
  [{ after: widget({ id: "different", expanded: "true" }) }, "widget-identity-shift"],
] as const) {
  test(`widget transition catches ${expected}: ${JSON.stringify(changes)}`,  () => {
    expect(codes(transitionIssues(event(changes as Partial<WidgetEvent>)))).toContain(expected);
  });
}

test("selected and deselected transitions require corresponding states", () => {
  expect(transitionIssues(event({ type: "select", after: widget({ selected: "true" }) }))).toEqual([]);
  expect(transitionIssues(event({ type: "deselect", after: widget({ selected: "false" }) }))).toEqual([]);
});

test("tabs with one selected and one roving target pass", () => {
  expect(compositeIssues(composite())).toEqual([]);
});

for (const [changes, code] of [
  [{ activeId: "missing" }, "composite-active-missing"],
  [{ selectedIds: ["first", "second"] }, "composite-multiple-selection"],
  [{ selectedIds: ["missing"] }, "composite-selected-unavailable"],
  [{ children: [item("first", -1), item("second", -1)] }, "composite-roving-tabindex"],
  [{ children: [item("first", 0), item("second", 0)] }, "composite-roving-tabindex"],
  [{ children: [item("first", 0), item("first", -1)] }, "composite-duplicate-id"],
  [{ children: [item("first", 0, { role: "button" })] }, "composite-child-role"],
  [{ children: [item("first", 0, { selected: "false" })] }, "composite-selected-state"],
] as const) {
  test(`composite reports ${code}: ${JSON.stringify(changes)}`,  () => {
    expect(codes(compositeIssues(composite(changes as Partial<CompositeObservation>)))).toContain(code);
  });
}

test("a roving target must match the active item", () => {
  expect(codes(compositeIssues(composite({ children: [item("first", -1), item("second", 0)] }))))
    .toContain("composite-roving-not-active");
});

test("the next and previous arrow navigation wraps when requested", () => {
  expect(nextRovingTarget(composite(), "next")).toBe("second");
  expect(nextRovingTarget(composite(), "previous")).toBe("second");
  expect(nextRovingTarget(composite({ activeId: "second" }), "next")).toBe("first");
});

test("navigation stops at ends when wrapping disabled", () => {
  expect(nextRovingTarget(composite({ wrapNavigation: false }), "previous")).toBe("first");
  expect(nextRovingTarget(composite({ activeId: "second", wrapNavigation: false }), "next")).toBe("second");
});

test("first, last, missing, and empty roving states are handled", () => {
  expect(nextRovingTarget(composite(), "first")).toBe("first");
  expect(nextRovingTarget(composite(), "last")).toBe("second");
  expect(nextRovingTarget(composite({ activeId: "missing" }), "next")).toBe("first");
  expect(nextRovingTarget(composite({ children: [] }), "next")).toBeNull();
});

test("disabled choices do not enter roving sequence", () => {
  const changed = composite({ children: [item("first", 0), item("second", -1, { disabled: true })] });
  expect(nextRovingTarget(changed, "next")).toBe("first");
});

test("multi-widget audit catches missing references", () => {
  const findings = multiWidgetIssues([widget()]);
  expect(codes(findings)).toContain("widget-controls-missing");
});

test("multi-widget audit catches repeated identifiers", () => {
  const findings = multiWidgetIssues([widget({ controls: [] }), widget({ controls: [] })]);
  expect(codes(findings)).toContain("widget-id-not-unique");
});

test("multi-widget audit accepts linked disclosure nodes", () => {
  const nodes = [widget(), widget({ id: "panel", role: "region", expanded: null, controls: [] })];
  expect(multiWidgetIssues(nodes)).toEqual([]);
});

test("control diagnostics deduplicate and truncate", () => {
  const findings = multiWidgetIssues([widget(), widget()]);
  const text = widgetAuditSummary([...findings, ...findings], 1);
  expect(text).toContain("more findings");
});

test("report limit rejects zero or fractional values", () => {
  expect(() => widgetAuditSummary([], 0)).toThrow();
  expect(() => widgetAuditSummary([], 1.5)).toThrow();
});

test("label normalization retains French characters", () => {
  expect(widgetName("  Détails\n d’une   fiche ")).toBe("Détails d’une fiche");
});

// Keyboard motion uses the real eligible sequence, not array indexes or guessed states.
test("horizontal arrow advances one tab and cancels native scroll", () => {
  const result = keyboardMoveIssues(composite(), [{
    key: "ArrowRight", beforeId: "first", afterId: "second",
    defaultPrevented: true, changedSelection: false,
  }], "horizontal");
  expect(result).toEqual([]);
});

test("keyboard audit catches wrong roving destination", () => {
  const issues = keyboardMoveIssues(composite(), [{
    key: "ArrowRight", beforeId: "first", afterId: "first",
    defaultPrevented: true, changedSelection: false,
  }], "horizontal");
  expect(codes(issues)).toContain("keyboard-roving-order");
});

test("keyboard audit detects an eligible target missing", () => {
  const issues = keyboardMoveIssues(composite(), [{
    key: "ArrowRight", beforeId: "first", afterId: null,
    defaultPrevented: true, changedSelection: false,
  }], "horizontal");
  expect(codes(issues)).toContain("keyboard-after-not-eligible");
});

test("cross-axis arrows must not silently change focus", () => {
  const issues = keyboardMoveIssues(composite(), [{
    key: "ArrowDown", beforeId: "first", afterId: "second",
    defaultPrevented: true, changedSelection: false,
  }], "horizontal");
  expect(codes(issues)).toContain("keyboard-cross-axis-moved");
});

test("keyboard default cancellation is asserted for consumed keys", () => {
  const issues = keyboardMoveIssues(composite(), [{
    key: "End", beforeId: "first", afterId: "second",
    defaultPrevented: false, changedSelection: false,
  }], "horizontal");
  expect(codes(issues)).toContain("keyboard-default-not-cancelled");
});

test("unknown keyboard starting point stays an explicit finding", () => {
  const issues = keyboardMoveIssues(composite(), [{
    key: "Home", beforeId: "missing", afterId: "first",
    defaultPrevented: true, changedSelection: false,
  }], "horizontal");
  expect(codes(issues)).toContain("keyboard-before-not-eligible");
});
