import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createScan, replaySwitch, currentControl, scanSummary,
  scanAnnouncement, explicitDecision, auditControls,
  groupControls, eligibleControls, applySwitch,
} from "./switch-model.mjs";
import {
  auditSemanticSnapshot, inspectLanguage, safeNodeInventory,
  accessibleName, referenceIndex, relationFindings,
  tabOrder, semanticSummary, compositeIssues,
} from "./semantic-audit.mjs";
import {
  announcementSummary, offlineDecision, offlineAnnouncement,
  auditMessageEvents, announcementInventory, eventDelta,
  replayAnnouncements, detectAnnouncementStorm,
} from "./announcement-audit.mjs";
import {
  control, controls, copy, node, semanticTree, message,
  events, offline, codes, deepCopy,
} from "./fixtures.node.mjs";

const keyboard = () => controls();
const current = () => semanticTree();
const announcements = () => events();
const ok = (items) => assert.deepEqual(items, []);

test("switch navigation begins before any selection exists", () => {
  assert.equal(createScan(keyboard()).selected, null);
});
test("the first explicit advance has a resolvable ID", () => {
  assert.equal(currentControl(replaySwitch(keyboard(), ["ADVANCE"]))?.id, "first");
});
test("selected switch target remains represented in eligible controls", () => {
  const input = keyboard();
  const result = replaySwitch(input, ["ADVANCE", "SELECT"]);
  assert.ok(eligibleControls(input).some((item) => item.id === result.selected));
});
test("all scan controls belong to a group", () => {
  const groups = groupControls(keyboard());
  const members = new Set(groups.flatMap((group) => group.controls.map((item) => item.id)));
  assert.deepEqual(members, new Set(["first", "second", "third"]));
});
test("moving between groups does not duplicate the selected target", () => {
  const result = replaySwitch(keyboard(), ["ADVANCE", "ADVANCE", "ADVANCE", "SELECT"]);
  assert.equal(result.selected, "third");
  assert.equal(result.groupCursor, 1);
});
test("selection readiness requires a concrete target", () => {
  const result = replaySwitch(keyboard(), ["ADVANCE", "SELECT"]);
  assert.equal(explicitDecision(result).decision, "READY");
});
test("a scan cancelled before selection cannot be ready", () => {
  const result = replaySwitch(keyboard(), ["ADVANCE", "CANCEL"]);
  assert.equal(explicitDecision(result).decision, "HOLD");
});
test("an UNKNOWN scan cannot be promoted by a select event", () => {
  const result = replaySwitch([control(), control()], ["ADVANCE", "SELECT"]);
  assert.equal(explicitDecision(result).decision, "UNKNOWN");
});
test("a malformed target cannot enter candidate groups", () => {
  const group = groupControls([control({ group: "bad group" })]);
  assert.deepEqual(group, []);
});
test("invalid controls remain diagnosable independently", () => {
  assert.ok(codes(auditControls([control({ group: "bad group" })])).includes("control.group"));
});
test("the selection sequence remains reproducible", () => {
  const a = replaySwitch(keyboard(), ["ADVANCE", "ADVANCE", "SELECT"]);
  const b = replaySwitch(keyboard(), ["ADVANCE", "ADVANCE", "SELECT"]);
  assert.deepEqual(scanSummary(a), scanSummary(b));
});
test("switch summary avoids raw label copy", () => {
  assert.equal(JSON.stringify(scanSummary(replaySwitch(keyboard(), ["ADVANCE"]))).includes("Premier"), false);
});
test("announced French label comes from selected control", () => {
  assert.equal(scanAnnouncement(replaySwitch(keyboard(), ["ADVANCE"]), "fr"), "Premier");
});
test("selecting a missing control never creates a label", () => {
  assert.equal(scanAnnouncement(createScan([]), "fr"), "UNKNOWN");
});
test("an invalid action does not alter the event log", () => {
  const start = createScan(keyboard());
  assert.deepEqual(applySwitch(start, "AUTOMATIC").history, []);
});
test("all semantic focus targets are backed by IDs", () => {
  const index = referenceIndex(current());
  for (const id of tabOrder(current())) assert.ok(index.has(id));
});
test("semantic landmarks are structurally intact", () => {
  assert.equal(semanticSummary(current()).status, "READY");
});
test("accessible names are available on focus targets", () => {
  for (const item of current().filter((entry) => entry.focusable)) {
    assert.ok(accessibleName(item).length > 0);
  }
});
test("a dangling controls reference blocks structural readiness", () => {
  const changed = current().map((item) => item.id === "start" ? { ...item, controls: ["missing"] } : item);
  assert.equal(semanticSummary(changed).status, "HOLD");
});
test("ambiguous ID relationships never pass silently", () => {
  const added = [...current(), node({ id: "start" })];
  assert.ok(auditSemanticSnapshot(added).some((item) => item.code === "node.duplicate-id"));
});
test("semantic inventory excludes original node names", () => {
  assert.equal(JSON.stringify(safeNodeInventory(current())).includes("Introduction"), false);
});
test("semantic inventory keeps control names as boolean evidence only", () => {
  assert.equal(safeNodeInventory(current()).find((item) => item.id === "start")?.named, true);
});
test("a valid semantic snapshot has no dangling references", () => {
  ok(relationFindings(current()));
});
test("unrelated role composites do not generate false findings", () => {
  ok(compositeIssues(current()));
});
test("French source copy can retain correct colon spacing", () => {
  ok(inspectLanguage([node({ copy: copy("Status", "État\u00A0: prêt") })], "fr"));
});
test("French source copy can retain correct narrow space", () => {
  ok(inspectLanguage([node({ copy: copy("Next", "Continuer\u202F?") })], "fr"));
});
test("French source copy with plain ASCII punctuation is rejected", () => {
  assert.ok(inspectLanguage([node({ copy: copy("Next", "Continuer ?") })], "fr").length > 0);
});
test("announcements can be evaluated independently from semantic snapshot", () => {
  assert.equal(announcementSummary(announcements()).decision, "READY");
});
test("live-region event ordering must increase", () => {
  ok(auditMessageEvents(announcements()));
});
test("event inventory retains a stable sequence", () => {
  assert.deepEqual(announcementInventory(announcements()).map((item) => item.sequence), [1, 2, 3]);
});
test("event inventory exposes no private message text", () => {
  assert.equal(JSON.stringify(announcementInventory(announcements())).includes("Complete"), false);
});
test("an interrupted status sequence is held", () => {
  const bad = [message({ role: "status", live: "assertive" })];
  assert.equal(announcementSummary(bad).decision, "HOLD");
});
test("a silent alert is never considered ready", () => {
  const bad = [message({ role: "alert", live: "off" })];
  assert.equal(announcementSummary(bad).decision, "HOLD");
});
test("event replay returns last event without copying text", () => {
  assert.equal(replayAnnouncements(announcements()).latest, "three");
});
test("adding an event changes only the ID inventory delta", () => {
  const added = [...announcements(), message({ id: "four", sequence: 4 })];
  assert.deepEqual(eventDelta(announcements(), added).added, ["four"]);
});
test("removing an event changes only the ID inventory delta", () => {
  const reduced = announcements().slice(0, 2);
  assert.deepEqual(eventDelta(announcements(), reduced).removed, ["three"]);
});
test("repeating one announcement excessively is reported", () => {
  assert.ok(detectAnnouncementStorm(["Ready", "Ready", "Ready", "Ready"]).length > 0);
});
test("offline publication with a known cache is eligible", () => {
  assert.equal(offlineDecision(offline()).decision, "READY");
});
test("missing offline copies cannot claim readiness", () => {
  assert.equal(offlineDecision(offline({ cache: "MISSING", cacheId: null })).decision, "HOLD");
});
test("unknown offline copies cannot claim readiness", () => {
  assert.equal(offlineDecision(offline({ cache: "UNKNOWN", cacheId: null })).decision, "UNKNOWN");
});
test("unknown evidence tier cannot claim readiness", () => {
  assert.equal(offlineDecision(offline({ tier: "UNKNOWN" })).decision, "UNKNOWN");
});
test("unknown accessibility finding cannot claim readiness", () => {
  assert.equal(offlineDecision(offline({ access: "UNKNOWN", tier: "UNKNOWN" })).decision, "UNKNOWN");
});
test("French offline announcement retains unknown", () => {
  assert.equal(offlineAnnouncement(offline({ tier: "UNKNOWN" }), "fr"), "UNKNOWN");
});
test("English offline announcement retains unknown", () => {
  assert.equal(offlineAnnouncement(offline({ tier: "UNKNOWN" }), "en"), "UNKNOWN");
});
test("a ready offline state does not imply a specific location", () => {
  assert.equal(offlineAnnouncement(offline(), "en").includes("entrance"), false);
});
test("access state remains distinct from cache state", () => {
  assert.equal(offlineDecision(offline({ access: "UNSUPPORTED" })).decision, "HOLD");
});
test("switch model does not modify its original control data", () => {
  const input = keyboard();
  const original = deepCopy(input);
  replaySwitch(input, ["ADVANCE", "SELECT"]);
  assert.deepEqual(input, original);
});
test("semantic auditor does not modify its original records", () => {
  const input = current();
  const original = deepCopy(input);
  auditSemanticSnapshot(input);
  assert.deepEqual(input, original);
});
test("announcement auditor does not modify its original messages", () => {
  const input = announcements();
  const original = deepCopy(input);
  auditMessageEvents(input);
  assert.deepEqual(input, original);
});
test("unknown evidence never acquires a fabricated title", () => {
  const evidence = offline({ tier: "UNKNOWN" });
  const result = offlineAnnouncement(evidence, "en");
  assert.equal(result, "UNKNOWN");
});
test("safe semantic inventory does not surface an unsafe control name", () => {
  const inventory = safeNodeInventory([node({ name: "User private description" })]);
  assert.equal(JSON.stringify(inventory).includes("User private description"), false);
});
test("cross-module diagnostics are deterministic", () => {
  const first = [codes(auditControls(keyboard())), codes(auditSemanticSnapshot(current())), codes(auditMessageEvents(announcements()))];
  const second = [codes(auditControls(keyboard())), codes(auditSemanticSnapshot(current())), codes(auditMessageEvents(announcements()))];
  assert.deepEqual(first, second);
});
