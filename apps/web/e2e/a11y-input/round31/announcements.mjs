/** Live-region and assistive-technology announcement analysis. */
import { calendarDay, finding, LANGUAGES, plain, sortFindings, frenchSpacing } from "./contracts.mjs";

export const LIVE_POLITENESS = Object.freeze(["off", "polite", "assertive"]);
export const LIVE_ATOMIC = Object.freeze(["true", "false"]);
export const LIVE_RELEVANT = Object.freeze(["additions", "removals", "text", "all"]);
export const EVENT_TYPES = Object.freeze(["update", "clear", "focus", "submit", "navigate", "error", "restore"]);
export const CHANNELS = Object.freeze(["status", "alert", "log", "timer", "progressbar", "generic"]);

export function announcementRegion(region) {
  if (!plain(region)) return null;
  if (typeof region.id !== "string" || !region.id) return null;
  if (!CHANNELS.includes(region.role)) return null;
  if (!LIVE_POLITENESS.includes(region.live)) return null;
  return {
    id: region.id,
    role: region.role,
    live: region.live,
    atomic: region.atomic ?? "false",
    relevant: region.relevant ?? "additions text",
    hidden: region.hidden === true,
    busy: region.busy === true,
    text: typeof region.text === "string" ? region.text : "",
    lang: region.lang ?? null,
  };
}

export function auditLiveRegions(regions) {
  if (!Array.isArray(regions)) return [finding("live.regions-array", "regions")];
  const issues = [];
  const ids = new Set();
  for (const [index, raw] of regions.entries()) {
    const path = `regions[${index}]`;
    const region = announcementRegion(raw);
    if (!region) {
      issues.push(finding("live.invalid-region", path));
      continue;
    }
    if (ids.has(region.id)) issues.push(finding("live.duplicate-region", `${path}.id`));
    ids.add(region.id);
    if (region.hidden) issues.push(finding("live.hidden-region", path));
    if (region.role === "status" && region.live === "off") issues.push(finding("live.silent-status", path));
    if (region.role === "alert" && region.live !== "assertive") issues.push(finding("live.alert-politeness", path, "review"));
    if (region.role === "progressbar" && region.live === "assertive") issues.push(finding("live.noisy-progress", path, "review"));
    if (!LIVE_ATOMIC.includes(region.atomic)) issues.push(finding("live.atomic", `${path}.atomic`));
    const tokens = region.relevant.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.some((token) => !LIVE_RELEVANT.includes(token))) {
      issues.push(finding("live.relevant", `${path}.relevant`));
    }
    if (region.lang && !LANGUAGES.includes(region.lang)) issues.push(finding("live.language", `${path}.lang`));
    if (region.text.length > 1200) issues.push(finding("live.overlong", `${path}.text`, "review"));
    if (region.busy && region.text.length === 0) issues.push(finding("live.stuck-busy", path, "review"));
  }
  return sortFindings(issues);
}

/** Events describe observations; no speech synthesis is claimed or simulated. */
export function auditAnnouncementEvents(input, options = {}) {
  if (!Array.isArray(input)) return [finding("announcements.array", "events")];
  const issues = [];
  const regionIds = new Set(options.regionIds ?? []);
  let lastSequence = -1;
  for (const [index, event] of input.entries()) {
    const at = `events[${index}]`;
    if (!plain(event)) {
      issues.push(finding("announcements.object", at));
      continue;
    }
    if (!EVENT_TYPES.includes(event.type)) issues.push(finding("announcements.event-type", `${at}.type`));
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      issues.push(finding("announcements.sequence", `${at}.sequence`));
    } else if (event.sequence <= lastSequence) {
      issues.push(finding("announcements.out-of-order", `${at}.sequence`));
    }
    if (Number.isSafeInteger(event.sequence)) lastSequence = event.sequence;
    if (event.type === "update" || event.type === "error" || event.type === "submit") {
      if (typeof event.regionId !== "string" || !event.regionId) issues.push(finding("announcements.region-id", `${at}.regionId`));
      else if (regionIds.size > 0 && !regionIds.has(event.regionId)) {
        issues.push(finding("announcements.missing-region", `${at}.regionId`));
      }
      if (typeof event.text !== "string" || !event.text.trim()) issues.push(finding("announcements.empty-update", `${at}.text`));
      if (event.live === "off") issues.push(finding("announcements.silent-update", `${at}.live`));
    }
    if (event.type === "focus" || event.type === "restore") {
      if (!event.focusTarget) issues.push(finding("announcements.focus-id", `${at}.focusTarget`));
    }
    if (event.type === "error" && event.live !== "assertive") {
      issues.push(finding("announcements.error-urgency", `${at}.live`, "review"));
    }
    if (event.type === "navigate" && event.external) issues.push(finding("announcements.external-navigation", at));
    if (event.language && !LANGUAGES.includes(event.language)) issues.push(finding("announcements.language", `${at}.language`));
  }
  return sortFindings(issues);
}

export function auditAnnouncementTransition(before, after) {
  const issues = [];
  if (!plain(before) || !plain(after)) return [finding("transition.object", "transition")];
  if (before.id !== after.id) issues.push(finding("transition.replaced-region", "transition.id"));
  if (after.hidden) issues.push(finding("transition.hidden", "transition.hidden"));
  if (before.text === after.text && after.expectedChange) issues.push(finding("transition.no-change", "transition.text"));
  if (before.busy && after.busy && after.expectedComplete) issues.push(finding("transition.still-busy", "transition.busy"));
  if (before.live !== after.live && after.expectedChange) issues.push(finding("transition.live-mode-changed", "transition.live"));
  if (after.language && before.language && after.language !== before.language && !after.localized) {
    issues.push(finding("transition.unlocalized", "transition.language"));
  }
  if (after.expectedChange && !after.text) issues.push(finding("transition.empty", "transition.text"));
  if (after.expectedChange && after.live === "off") issues.push(finding("transition.not-announced", "transition.live"));
  return sortFindings(issues);
}

export function auditStatusMessage(message) {
  if (!plain(message)) return [finding("message.object", "message")];
  const issues = [];
  if (!LANGUAGES.includes(message.language)) issues.push(finding("message.language", "message.language"));
  if (!CHANNELS.includes(message.channel)) issues.push(finding("message.channel", "message.channel"));
  if (typeof message.text !== "string" || !message.text.trim()) issues.push(finding("message.copy", "message.text"));
  if (message.language === "fr" && typeof message.text === "string") {
    for (const code of frenchSpacing(message.text)) issues.push(finding(code, "message.text"));
  }
  if (message.status === "UNKNOWN" && message.confidence && message.confidence !== "UNKNOWN") {
    issues.push(finding("message.unknown-upgraded", "message.confidence"));
  }
  if (message.status === "UNKNOWN" && message.claimedComplete) issues.push(finding("message.false-completion", "message.claimedComplete"));
  if (message.status === "error" && message.channel === "generic") issues.push(finding("message.error-channel", "message.channel"));
  if (message.kind === "progress" && (!Number.isFinite(message.value) || message.value < 0 || message.value > 100)) {
    issues.push(finding("message.progress-range", "message.value"));
  }
  if (message.kind === "count" && (!Number.isSafeInteger(message.value) || message.value < 0)) {
    issues.push(finding("message.count-range", "message.value"));
  }
  return sortFindings(issues);
}

export function auditBilingualMessages(messages) {
  if (!Array.isArray(messages)) return [finding("messages.array", "messages")];
  const issues = [];
  const groups = new Map();
  for (const [index, message] of messages.entries()) {
    issues.push(...auditStatusMessage(message).map((issue) => ({ ...issue, path: `messages[${index}].${issue.path}` })));
    if (!plain(message) || typeof message.key !== "string" || !message.key || !LANGUAGES.includes(message.language)) continue;
    const group = groups.get(message.key) ?? new Set();
    if (group.has(message.language)) issues.push(finding("messages.duplicate-language", `messages[${index}].language`));
    group.add(message.language);
    groups.set(message.key, group);
  }
  for (const [key, group] of groups) {
    for (const language of LANGUAGES) {
      if (!group.has(language)) issues.push(finding("messages.missing-translation", `translations.${key}.${language}`));
    }
  }
  return sortFindings(issues);
}

export function auditProgressState(input) {
  if (!plain(input)) return [finding("progress.object", "progress")];
  const issues = [];
  if (!Number.isFinite(input.min) || !Number.isFinite(input.max) || input.max <= input.min) {
    issues.push(finding("progress.invalid-range", "progress.range"));
  }
  if (input.value !== null && input.value !== undefined) {
    if (!Number.isFinite(input.value)) issues.push(finding("progress.invalid-value", "progress.value"));
    else if (input.value < input.min || input.value > input.max) issues.push(finding("progress.out-of-range", "progress.value"));
  } else if (input.complete === true) issues.push(finding("progress.completion-without-value", "progress.complete"));
  if (input.complete && input.value !== input.max) issues.push(finding("progress.premature-completion", "progress.complete"));
  if (input.indeterminate && input.value !== null) issues.push(finding("progress.indeterminate-value", "progress.value"));
  if (!input.label) issues.push(finding("progress.no-name", "progress.label"));
  if (!input.live && input.complete && input.announceCompletion) issues.push(finding("progress.silent-completion", "progress.live"));
  return sortFindings(issues);
}

export function auditErrorSummary(input) {
  if (!plain(input)) return [finding("errors.object", "errors")];
  const issues = [];
  if (!Array.isArray(input.errors)) return [finding("errors.array", "errors.errors")];
  if (input.errors.length && !input.summaryId) issues.push(finding("errors.missing-summary", "errors.summaryId"));
  if (input.errors.length && !input.live) issues.push(finding("errors.silent", "errors.live"));
  if (input.errors.length && !input.focusedSummary) issues.push(finding("errors.focus", "errors.focusedSummary"));
  const ids = new Set();
  for (const [index, error] of input.errors.entries()) {
    const at = `errors.errors[${index}]`;
    if (!plain(error) || !error.fieldId) {
      issues.push(finding("errors.field-id", at));
      continue;
    }
    if (ids.has(error.fieldId)) issues.push(finding("errors.duplicate-field", at));
    ids.add(error.fieldId);
    if (!error.message) issues.push(finding("errors.unnamed", at));
    if (!error.describedBy) issues.push(finding("errors.unlinked", at));
    if (error.invalid !== true) issues.push(finding("errors.invalid-state", at));
  }
  return sortFindings(issues);
}

export function auditLanguageChange(input) {
  if (!plain(input)) return [finding("language.object", "language")];
  const issues = [];
  if (!LANGUAGES.includes(input.before) || !LANGUAGES.includes(input.after)) issues.push(finding("language.unsupported", "language"));
  if (input.before === input.after && input.expectedSwitch) issues.push(finding("language.no-switch", "language.after"));
  if (input.documentLanguage !== input.after) issues.push(finding("language.document-mismatch", "language.documentLanguage"));
  if (input.announcedLanguage !== input.after && input.announcementExpected) issues.push(finding("language.announcement-mismatch", "language.announcedLanguage"));
  if (!input.focusPreserved) issues.push(finding("language.focus-lost", "language.focusPreserved"));
  if (!input.controlsNamed) issues.push(finding("language.controls-unnamed", "language.controlsNamed"));
  if (input.after === "fr" && typeof input.sampleCopy === "string") {
    for (const code of frenchSpacing(input.sampleCopy)) issues.push(finding(code, "language.sampleCopy"));
  }
  return sortFindings(issues);
}

export function auditOfflineAnnouncement(input) {
  if (!plain(input)) return [finding("offline.object", "offline")];
  const issues = [];
  if (!LANGUAGES.includes(input.language)) issues.push(finding("offline.language", "offline.language"));
  if (!["PRESENT", "ABSENT", "UNKNOWN"].includes(input.cache)) issues.push(finding("offline.cache", "offline.cache"));
  if (input.cache === "UNKNOWN" && input.claim === "READY") issues.push(finding("offline.unknown-upgraded", "offline.claim"));
  if (input.cache === "ABSENT" && input.claim === "READY") issues.push(finding("offline.absent-ready", "offline.claim"));
  if (!input.statusRegion) issues.push(finding("offline.status-region", "offline.statusRegion"));
  if (!input.keyboardReachable) issues.push(finding("offline.keyboard", "offline.keyboardReachable"));
  if (input.retryAvailable && !input.retryNamed) issues.push(finding("offline.retry-name", "offline.retryNamed"));
  if (input.downloadStarted && !input.progressNamed) issues.push(finding("offline.progress-name", "offline.progressNamed"));
  if (input.downloadFailed && !input.failureAnnounced) issues.push(finding("offline.failure-announcement", "offline.failureAnnounced"));
  if (input.contentDate && calendarDay(input.contentDate) === null) issues.push(finding("offline.content-date", "offline.contentDate"));
  if (input.sourceTier === "UNKNOWN" && input.claim === "READY") issues.push(finding("offline.unknown-tier-ready", "offline.claim"));
  return sortFindings(issues);
}

export function announcementSummary(items) {
  const severity = { error: 0, review: 0 };
  const codes = Object.create(null);
  for (const issue of items) {
    if (issue.severity === "review") severity.review += 1;
    else severity.error += 1;
    codes[issue.code] = (codes[issue.code] ?? 0) + 1;
  }
  return { ...severity, codes: Object.entries(codes).sort(([a], [b]) => a.localeCompare(b, "en")) };
}
