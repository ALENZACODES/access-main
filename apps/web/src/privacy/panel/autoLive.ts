// Asks the browser what offline workers this site has right now, and sets that beside the list in autoRegister.ts. The
// list says the App can register a worker; this says whether one is registered, whether one controls the page that is
// open, and whether a newer one is waiting. It shows only the part of each address that follows the site name, never
// the script's address. An answer the browser will not give is shown as unreadable, never as none, and a browser with
// no offline workers is shown as that.

import type { Locale } from "./copyLint";
import type { AutoRow } from "./autoRegister";

export type WorkerState = "installing" | "waiting" | "active" | "none";

export interface WorkerRegistration {
  /** The path of the part of the site the worker covers, such as "/" */
  scope: string;
  state: WorkerState;
}

/** What the check asks. Tests give their own; the App's is `browserWorkerHost`. */
export interface WorkerHost {
  /** Whether this browser has offline workers at all */
  supported(): boolean;
  /** Whether one controls the page that is open. Null when the browser does not say. */
  controlled?(): boolean | null;
  /** The registered workers. Rejects or is missing when the browser will not say. */
  registrations?(): Promise<readonly WorkerRegistration[]>;
}

export interface WorkerReading {
  supported: boolean;
  controlled: boolean | null;
  /** Null when the browser would not say */
  registrations: readonly WorkerRegistration[] | null;
}

export type WorkerCode = "unsupported" | "unreadable" | "none-registered" | "registered" | "controls-page" | "not-controlling" | "waiting" | "unlisted";

export interface WorkerFinding {
  code: WorkerCode;
  detail: { count?: number };
}

/** The shape of the browser's own container, as far as the check uses it. */
export interface BrowserWorkers {
  serviceWorker?: {
    controller?: unknown;
    getRegistrations?(): Promise<ReadonlyArray<{ scope: string; active?: unknown; waiting?: unknown; installing?: unknown }>>;
  };
}

/** The path of an address, or null when it cannot be read. Only the path is kept. */
export function scopePath(scope: string): string | null {
  try {
    const p = new URL(scope).pathname;
    return p === "" ? "/" : p;
  } catch {
    return null;
  }
}

function stateOf(r: { active?: unknown; waiting?: unknown; installing?: unknown }): WorkerState {
  if (r.waiting) return "waiting";
  if (r.installing) return "installing";
  return r.active ? "active" : "none";
}

/** The host for the browser the App is running in. A browser with no offline workers says so. */
export function browserWorkerHost(nav: BrowserWorkers | undefined = typeof navigator === "undefined" ? undefined : (navigator as BrowserWorkers)): WorkerHost {
  const sw = nav?.serviceWorker;
  if (sw === undefined) return { supported: () => false };
  const get = sw.getRegistrations;
  return {
    supported: () => true,
    controlled: () => (sw.controller === undefined ? null : sw.controller !== null),
    ...(get === undefined
      ? {}
      : {
          registrations: async () =>
            (await get.call(sw)).flatMap((r) => {
              const scope = scopePath(r.scope);
              return scope === null ? [] : [{ scope, state: stateOf(r) }];
            }),
        }),
  };
}

/** Reads the host. Never throws: a failed question is null, not none. */
export async function readWorkers(host: WorkerHost): Promise<WorkerReading> {
  let supported: boolean;
  try {
    supported = host.supported();
  } catch {
    return { supported: false, controlled: null, registrations: null };
  }
  if (!supported) return { supported: false, controlled: null, registrations: [] };
  let controlled: boolean | null = null;
  try {
    controlled = host.controlled === undefined ? null : host.controlled();
  } catch {
    controlled = null;
  }
  let registrations: readonly WorkerRegistration[] | null = null;
  try {
    registrations = host.registrations === undefined ? null : await host.registrations();
  } catch {
    registrations = null;
  }
  return { supported: true, controlled, registrations };
}

/**
 * What the reading means beside the list. A registered worker is "unlisted" when the list has no row that says the
 * App registers one. Facts that are not differences (a worker is registered, one controls the page) are findings too,
 * because the person asked what is running.
 */
export function checkWorkers(reading: WorkerReading, rows: readonly AutoRow[]): WorkerFinding[] {
  if (!reading.supported) return [{ code: "unsupported", detail: {} }];
  const out: WorkerFinding[] = [];
  if (reading.registrations === null) out.push({ code: "unreadable", detail: {} });
  else if (reading.registrations.length === 0) out.push({ code: "none-registered", detail: {} });
  else {
    out.push({ code: "registered", detail: { count: reading.registrations.length } });
    const waiting = reading.registrations.filter((r) => r.state === "waiting").length;
    if (waiting > 0) out.push({ code: "waiting", detail: { count: waiting } });
    if (!rows.some((r) => r.kind === "service-worker" && r.effect === "runs")) out.push({ code: "unlisted", detail: {} });
  }
  if (reading.controlled === true) out.push({ code: "controls-page", detail: {} });
  else if (reading.controlled === false) out.push({ code: "not-controlling", detail: {} });
  return out;
}

/** The findings that are differences from the list, not facts. */
export function differenceCount(findings: readonly WorkerFinding[]): number {
  return findings.filter((f) => f.code === "unlisted" || f.code === "unreadable").length;
}

const TEXT: Record<Locale, Record<WorkerCode, (f: WorkerFinding) => string>> = {
  en: {
    unsupported: () => "This browser has no offline workers.",
    unreadable: () => "The browser would not say which offline workers are registered, so they were not compared.",
    "none-registered": () => "No offline worker is registered for this site.",
    registered: (f) => `${f.detail.count ?? 0} offline ${f.detail.count === 1 ? "worker is" : "workers are"} registered for this site.`,
    "controls-page": () => "An offline worker controls this page.",
    "not-controlling": () => "No offline worker controls this page.",
    waiting: (f) => `${f.detail.count ?? 0} newer ${f.detail.count === 1 ? "worker is" : "workers are"} waiting to take over.`,
    unlisted: () => "A worker is registered, but the list has no row that says the App registers one.",
  },
  fr: {
    unsupported: () => "Ce navigateur n’a pas d’agents hors ligne.",
    unreadable: () => "Le navigateur n’a pas voulu dire quels agents hors ligne sont enregistrés, donc ils n’ont pas été comparés.",
    "none-registered": () => "Aucun agent hors ligne n’est enregistré pour ce site.",
    registered: (f) => `${f.detail.count ?? 0} ${(f.detail.count ?? 0) <= 1 ? "agent hors ligne est enregistré" : "agents hors ligne sont enregistrés"} pour ce site.`,
    "controls-page": () => "Un agent hors ligne contrôle cette page.",
    "not-controlling": () => "Aucun agent hors ligne ne contrôle cette page.",
    waiting: (f) => `${f.detail.count ?? 0} ${(f.detail.count ?? 0) <= 1 ? "agent plus récent attend" : "agents plus récents attendent"} de prendre le relais.`,
    unlisted: () => "Un agent est enregistré, mais la liste n’a aucune ligne indiquant que l’App en enregistre un.",
  },
};

export function workerFindingText(locale: Locale, f: WorkerFinding): string {
  return TEXT[locale][f.code](f);
}

/** One sentence for the whole check: how many workers were registered and how many differences there were. */
export function workerSummary(locale: Locale, registered: number | null, differences: number): string {
  if (locale === "fr") {
    const head = registered === null ? "Agents hors ligne : nombre inconnu." : `${registered} ${registered <= 1 ? "agent hors ligne enregistré" : "agents hors ligne enregistrés"}.`;
    return `${head.replace(" :", "\u00a0:")} ${differences === 0 ? "Aucune différence trouvée." : `${differences} ${differences <= 1 ? "différence trouvée" : "différences trouvées"}.`}`;
  }
  const head = registered === null ? "Offline workers: count unknown." : `${registered} offline ${registered === 1 ? "worker" : "workers"} registered.`;
  return `${head} ${differences === 0 ? "No differences found." : `${differences} ${differences === 1 ? "difference" : "differences"} found.`}`;
}

/** What the panel keeps after a check: the findings and the number registered, or null when the browser would not say. */
export interface WorkerCheckView {
  registered: number | null;
  findings: readonly WorkerFinding[];
}

export function workerCheck(reading: WorkerReading, rows: readonly AutoRow[]): WorkerCheckView {
  return { registered: reading.registrations === null ? null : reading.registrations.length, findings: checkWorkers(reading, rows) };
}
