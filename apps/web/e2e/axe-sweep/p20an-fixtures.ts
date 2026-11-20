import { type Evidence, type EvidenceInventory, type Provenance, type Locale, type Connection } from "./p20an-evidence.ts";
import { type Control, type Screen, type Step, type Announcement } from "./p20an-interactions.ts";
import { type CachedResource, type OfflineObservation, type ResourceBudget } from "./p20an-offline.ts";
/** Synthetic examples, never records for a real location or provider. */
export function exampleProvenance(change: Partial<Provenance> = {}): Provenance {
  return { source: "Example dataset", licence: "Example licence", retrievedOn: "2026-11-20", tier: "E", ...change };
}
export function exampleEvidence(change: Partial<Evidence> = {}): Evidence {
  return { id: "example-1", label: "Illustrative description", value: "Illustrative value",
    provenance: exampleProvenance(), unknownReason: null, ...change };
}
export function exampleInventory(change: Partial<EvidenceInventory> = {}): EvidenceInventory {
  return { route: "/places", locale: "en", records: [exampleEvidence()], observedAt: "2026-11-20", ...change };
}
export function exampleControl(change: Partial<Control> = {}): Control {
  return { id: "search", role: "button", accessibleName: "Search", visible: true, enabled: true,
    inert: false, tabIndex: 0, width: 44, height: 44, focusVisible: true, dialogId: null, ...change };
}
export function exampleAnnouncement(change: Partial<Announcement> = {}): Announcement {
  return { id: "status", text: "Results are ready.", language: "en", politeness: "polite", emittedAt: 50,
    busy: false, ...change };
}
export function exampleScreen(change: Partial<Screen> = {}): Screen {
  return { route: "/places", locale: "en", connection: "online", phase: "ready", title: "Places",
    heading: "Places", mainCount: 1, focusId: "search", activeDialogId: null,
    scrollY: 0, historyIndex: 0, controls: [exampleControl()], announcements: [], ...change };
}
export function exampleStep(change: Partial<Step> = {}): Step {
  return { kind: "disconnect", before: exampleScreen(), after: exampleScreen({ connection: "offline" }),
    observed: true, expectedRoute: "/places", preserveFocus: true, at: 100, ...change };
}
export function exampleResource(change: Partial<CachedResource> = {}): CachedResource {
  return { url: "/assets/site.js", cached: "present", bytes: 2048, contentType: "application/javascript",
    required: true, responseOk: true, ...change };
}
export function exampleBudget(change: Partial<ResourceBudget> = {}): ResourceBudget {
  return { maximumEntryBytes: 524288, maximumTotalBytes: 8388608, totalBytes: 2048, ...change };
}
export function exampleOffline(change: Partial<OfflineObservation> = {}): OfflineObservation {
  return { route: "/places", connection: "offline", serviceWorker: "controlling",
    cacheNames: ["app-shell"], resources: [exampleResource()], fallbackVisible: true,
    retryAvailable: true, testedAt: "2026-11-20", ...change };
}
export function localizedScreen(locale: Locale, connection: Connection): Screen {
  const control = exampleControl({ accessibleName: locale === "fr" ? "Rechercher" : "Search" });
  return exampleScreen({ locale, connection, controls: [control] });
}
