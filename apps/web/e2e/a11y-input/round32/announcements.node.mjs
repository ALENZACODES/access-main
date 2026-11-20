import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIVE_ROLES, LIVE_POLICIES, OFFLINE_STATUSES, EVIDENCE_TIERS,
  ACCESS_STATES, dayNumber, bilingualMessage, auditMessage,
  auditMessageEvents, compareLiveText, auditOfflineEvidence,
  offlineDecision, offlineAnnouncement, announcementSummary,
  announcementInventory, detectAnnouncementStorm, eventDelta,
  replayAnnouncements,
} from "./announcement-audit.mjs";
import { copy, message, events, offline, codes, deepCopy } from "./fixtures.node.mjs";

const codesOf = (findings) => new Set(codes(findings));
const baseline = () => events();

test("live roles are explicitly enumerated", () => {
  assert.deepEqual(LIVE_ROLES, ["status", "alert", "log", "timer", "marquee"]);
});
test("live policies include off", () => {
  assert.deepEqual(LIVE_POLICIES, ["polite", "assertive", "off"]);
});
test("offline statuses include unknown", () => {
  assert.ok(OFFLINE_STATUSES.includes("UNKNOWN"));
});
test("evidence tiers include unknown", () => {
  assert.ok(EVIDENCE_TIERS.includes("UNKNOWN"));
});
test("access states include unknown", () => {
  assert.ok(ACCESS_STATES.includes("UNKNOWN"));
});
test("live roles are frozen", () => {
  assert.equal(Object.isFrozen(LIVE_ROLES), true);
});
test("live policies are frozen", () => {
  assert.equal(Object.isFrozen(LIVE_POLICIES), true);
});
test("calendar ordinal accepts valid date", () => {
  assert.equal(typeof dayNumber("2026-11-19"), "number");
});
test("calendar ordinal accepts leap day", () => {
  assert.equal(typeof dayNumber("2024-02-29"), "number");
});
test("calendar ordinal rejects invalid leap day", () => {
  assert.equal(dayNumber("2026-02-29"), null);
});
test("calendar ordinal rejects April thirty-first", () => {
  assert.equal(dayNumber("2026-04-31"), null);
});
test("calendar ordinal rejects month zero", () => {
  assert.equal(dayNumber("2026-00-15"), null);
});
test("calendar ordinal rejects month thirteen", () => {
  assert.equal(dayNumber("2026-13-15"), null);
});
test("calendar ordinal rejects non-ISO date", () => {
  assert.equal(dayNumber("19-11-2026"), null);
});
test("calendar ordinal rejects low year", () => {
  assert.equal(dayNumber("1969-12-31"), null);
});
test("calendar ordinal rejects non-string date", () => {
  assert.equal(dayNumber(null), null);
});
test("English message uses English copy", () => {
  assert.equal(bilingualMessage(copy("Ready", "Prêt"), "en"), "Ready");
});
test("French message uses French copy", () => {
  assert.equal(bilingualMessage(copy("Ready", "Prêt"), "fr"), "Prêt");
});
test("unsupported message language is unknown", () => {
  assert.equal(bilingualMessage(copy(), "de"), "UNKNOWN");
});
test("incomplete message copy is unknown", () => {
  assert.equal(bilingualMessage({ en: "Ready" }, "en"), "UNKNOWN");
});
test("invalid message copy is unknown", () => {
  assert.equal(bilingualMessage(null, "en"), "UNKNOWN");
});
test("ordinary status announcement is valid", () => {
  assert.deepEqual(auditMessage(message()), []);
});
test("ordinary assertive alert is valid", () => {
  assert.deepEqual(auditMessage(message({ role: "alert", live: "assertive" })), []);
});
test("invalid message is reported", () => {
  assert.ok(codesOf(auditMessage(null)).has("message.object"));
});
test("bad message ID is reported", () => {
  assert.ok(codesOf(auditMessage(message({ id: "bad id" }))).has("message.id"));
});
test("bad live role is reported", () => {
  assert.ok(codesOf(auditMessage(message({ role: "other" }))).has("message.role"));
});
test("bad politeness is reported", () => {
  assert.ok(codesOf(auditMessage(message({ live: "now" }))).has("message.live"));
});
test("bad atomic flag is reported", () => {
  assert.ok(codesOf(auditMessage(message({ atomic: "true" }))).has("message.atomic"));
});
test("bad relevant setting is reported", () => {
  assert.ok(codesOf(auditMessage(message({ relevant: "everything" }))).has("message.relevant"));
});
test("missing French message is reported", () => {
  assert.ok(codesOf(auditMessage(message({ copy: { en: "Ready" } }))).has("message.fr"));
});
test("missing English message is reported", () => {
  assert.ok(codesOf(auditMessage(message({ copy: { fr: "Prêt" } }))).has("message.en"));
});
test("invalid sequence is reported", () => {
  assert.ok(codesOf(auditMessage(message({ sequence: -1 }))).has("message.sequence"));
});
test("silent alert is reported", () => {
  assert.ok(codesOf(auditMessage(message({ role: "alert", live: "off" }))).has("message.silent-alert"));
});
test("interrupting routine status is reported", () => {
  assert.ok(codesOf(auditMessage(message({ role: "status", live: "assertive" }))).has("message.interrupting-status"));
});
test("hidden live message is reported", () => {
  assert.ok(codesOf(auditMessage(message({ hidden: true }))).has("message.hidden"));
});
test("inert live message is reported", () => {
  assert.ok(codesOf(auditMessage(message({ inert: true }))).has("message.hidden"));
});
test("normal ordered message list is valid", () => {
  assert.deepEqual(auditMessageEvents(baseline()), []);
});
test("non-array messages are rejected", () => {
  assert.ok(codesOf(auditMessageEvents(null)).has("events.array"));
});
test("duplicate message IDs are reported", () => {
  assert.ok(codesOf(auditMessageEvents([message(), message({ sequence: 2 })])).has("events.duplicate"));
});
test("out-of-order message sequence is reported", () => {
  assert.ok(codesOf(auditMessageEvents([message({ sequence: 2 }), message({ id: "two", sequence: 1 })])).has("events.order"));
});
test("repeated message sequence is reported", () => {
  assert.ok(codesOf(auditMessageEvents([message(), message({ id: "two" })])).has("events.order"));
});
test("assertive cancellation is reported", () => {
  assert.ok(codesOf(auditMessageEvents([message({ role: "alert", live: "assertive", action: "CANCEL" })])).has("events.cancel-interrupt"));
});
test("event list is bounded", () => {
  assert.ok(codesOf(auditMessageEvents(Array(1001).fill(message()))).has("events.limit"));
});
test("matching live text is unchanged", () => {
  assert.deepEqual(compareLiveText("Ready", "Ready"), { changed: false, status: "UNCHANGED" });
});
test("different live text is changed", () => {
  assert.deepEqual(compareLiveText("Ready", "Next"), { changed: true, status: "CHANGED" });
});
test("non-string live text is unknown", () => {
  assert.equal(compareLiveText(null, "Next").status, "UNKNOWN");
});
test("control-code live text is unknown", () => {
  assert.equal(compareLiveText("Ready\u0000", "Ready").status, "UNKNOWN");
});
test("valid offline evidence has no findings", () => {
  assert.deepEqual(auditOfflineEvidence(offline()), []);
});
test("invalid offline evidence is reported", () => {
  assert.ok(codesOf(auditOfflineEvidence(null)).has("evidence.object"));
});
test("invalid evidence ID is reported", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ id: "bad id" }))).has("evidence.id"));
});
test("invalid cache status is reported", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ cache: "maybe" }))).has("evidence.cache"));
});
test("invalid evidence tier is reported", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ tier: "unknown" }))).has("evidence.tier"));
});
test("invalid evidence access is reported", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ access: "possible" }))).has("evidence.access"));
});
test("missing publisher is reported", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ publisher: "" }))).has("evidence.publisher"));
});
test("missing licence is reported", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ licence: "" }))).has("evidence.licence"));
});
test("invalid evidence date is reported", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ collectedOn: "invalid" }))).has("evidence.date"));
});
test("unknown access cannot have promoted tier", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ access: "UNKNOWN" }))).has("evidence.unknown-tier"));
});
test("cached evidence requires cache identifier", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ cacheId: null }))).has("evidence.cache-id"));
});
test("absent cache must not claim cache identifier", () => {
  assert.ok(codesOf(auditOfflineEvidence(offline({ cache: "MISSING" }))).has("evidence.unexpected-cache-id"));
});
test("normal offline evidence is ready", () => {
  assert.equal(offlineDecision(offline()).decision, "READY");
});
test("unknown cache stays unknown", () => {
  assert.equal(offlineDecision(offline({ cache: "UNKNOWN", cacheId: null })).decision, "UNKNOWN");
});
test("unknown access stays unknown", () => {
  assert.equal(offlineDecision(offline({ access: "UNKNOWN", tier: "UNKNOWN" })).decision, "UNKNOWN");
});
test("unknown tier stays unknown", () => {
  assert.equal(offlineDecision(offline({ tier: "UNKNOWN" })).decision, "UNKNOWN");
});
test("missing cache is held", () => {
  assert.equal(offlineDecision(offline({ cache: "MISSING", cacheId: null })).decision, "HOLD");
});
test("unsupported access is held", () => {
  assert.equal(offlineDecision(offline({ access: "UNSUPPORTED" })).decision, "HOLD");
});
test("invalid evidence is held", () => {
  assert.equal(offlineDecision(offline({ publisher: "" })).decision, "HOLD");
});
test("ready English announcement names offline status", () => {
  assert.equal(offlineAnnouncement(offline(), "en"), "Offline copy available");
});
test("ready French announcement names offline status", () => {
  assert.equal(offlineAnnouncement(offline(), "fr"), "Copie hors ligne disponible");
});
test("unknown English evidence is labelled UNKNOWN", () => {
  assert.equal(offlineAnnouncement(offline({ tier: "UNKNOWN" }), "en"), "UNKNOWN");
});
test("unknown French evidence is labelled UNKNOWN", () => {
  assert.equal(offlineAnnouncement(offline({ tier: "UNKNOWN" }), "fr"), "UNKNOWN");
});
test("invalid language remains UNKNOWN", () => {
  assert.equal(offlineAnnouncement(offline(), "de"), "UNKNOWN");
});
test("announcement summary reports valid event count", () => {
  assert.equal(announcementSummary(baseline()).events, 3);
});
test("announcement summary is ready for valid events", () => {
  assert.equal(announcementSummary(baseline()).decision, "READY");
});
test("announcement summary holds for duplicate events", () => {
  assert.equal(announcementSummary([message(), message({ sequence: 2 })]).decision, "HOLD");
});
test("announcement summary marks invalid input unknown", () => {
  assert.equal(announcementSummary(null).decision, "UNKNOWN");
});
test("inventory keeps event order", () => {
  assert.deepEqual(announcementInventory(baseline()).map((item) => item.id), ["one", "two", "three"]);
});
test("inventory does not leak raw French copy", () => {
  assert.equal(JSON.stringify(announcementInventory(baseline())).includes("Suivant"), false);
});
test("inventory reports bilingual availability", () => {
  assert.equal(announcementInventory(baseline())[0].bilingual, true);
});
test("inventory replaces unknown roles", () => {
  assert.equal(announcementInventory([message({ role: "custom" })])[0].role, "UNKNOWN");
});
test("repeat storm notices fourth identical announcement", () => {
  assert.ok(codesOf(detectAnnouncementStorm(["Ready", "Ready", "Ready", "Ready"])).has("storm.repeated"));
});
test("repeat storm ignores changed announcements", () => {
  assert.deepEqual(detectAnnouncementStorm(["Ready", "Next", "Done"]), []);
});
test("repeat storm rejects invalid input", () => {
  assert.ok(codesOf(detectAnnouncementStorm(null)).has("storm.array"));
});
test("event delta detects newly added announcement", () => {
  assert.deepEqual(eventDelta([message()], [message(), message({ id: "second" })]).added, ["second"]);
});
test("event delta detects removed announcement", () => {
  assert.deepEqual(eventDelta([message()], []).removed, ["status-one"]);
});
test("event delta stays unknown on invalid input", () => {
  assert.equal(eventDelta(null, []).status, "UNKNOWN");
});
test("event delta does not mutate inputs", () => {
  const input = baseline();
  const original = deepCopy(input);
  eventDelta(input, []);
  assert.deepEqual(input, original);
});
test("replay returns the most recent event", () => {
  assert.equal(replayAnnouncements(baseline()).latest, "three");
});
test("replay reports total events", () => {
  assert.equal(replayAnnouncements(baseline()).count, 3);
});
test("replay refuses broken ordering", () => {
  assert.equal(replayAnnouncements([message({ sequence: 2 }), message({ id: "second", sequence: 1 })]).status, "HOLD");
});
test("replay marks invalid history unknown", () => {
  assert.equal(replayAnnouncements(null).status, "UNKNOWN");
});
test("event audits never change input", () => {
  const input = baseline();
  const original = deepCopy(input);
  auditMessageEvents(input);
  assert.deepEqual(input, original);
});
