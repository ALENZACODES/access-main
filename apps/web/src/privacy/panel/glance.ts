// "Privacy at a glance": the counts behind the panel's longer lists, written once so a person can see the size of
// each list and how much of it the App has not confirmed. Every figure is counted from the same registers the
// lists are drawn from, so the summary cannot say more or less than the lists do. A figure the App has not
// confirmed is counted as unknown and shown as unknown; it is never counted as a yes or a no.

import type { AddressRegisterView } from "./addressView";
import type { DeviceRow } from "./deviceRegister";
import type { FeatureRow } from "./featureRegister";
import type { StatementResult } from "./statementRegister";
import type { RegisterRow, UnscannedRow } from "./storageRegister";

export interface GlanceSources {
  /** What the App saves in this browser's storage, and the places the scan could not read */
  kept?: { register: readonly RegisterRow[]; unscanned: readonly UnscannedRow[] };
  /** The App's caches and databases */
  device?: readonly DeviceRow[];
  /** What the App asks of the browser */
  features?: readonly FeatureRow[];
  /** The addresses and network requests in the App's code */
  addresses?: AddressRegisterView;
  /** Where the App says data stays on the device or is not sent, set beside the network requests */
  statements?: readonly StatementResult[];
}

export type GlanceId = "kept" | "kept-asked" | "kept-outside" | "kept-unread" | "caches" | "databases" | "features-used" | "features-asked" | "features-unconfirmed" | "features-unused" | "pages" | "names" | "request-places" | "request-unknown" | "statement-parts" | "statement-unconfirmed";

export type GlanceGroup = "kept" | "device" | "features" | "addresses" | "statements";

export interface GlanceFigure {
  id: GlanceId;
  group: GlanceGroup;
  count: number;
  /** True when the figure counts things the App has not confirmed */
  unknown: boolean;
}

const countWhere = <T>(rows: readonly T[], test: (row: T) => boolean): number => rows.reduce((n, r) => (test(r) ? n + 1 : n), 0);

/** Figures for each source that was given, in a fixed order. A source that was not given adds no figure. */
export function glanceFigures(src: GlanceSources): GlanceFigure[] {
  const out: GlanceFigure[] = [];
  const add = (id: GlanceId, group: GlanceGroup, count: number, unknown = false): void => {
    out.push({ id, group, count, unknown });
  };
  if (src.kept !== undefined) {
    const { register, unscanned } = src.kept;
    add("kept", "kept", register.length);
    add("kept-asked", "kept", countWhere(register, (r) => r.gated));
    add("kept-outside", "kept", countWhere(register, (r) => r.reach === "elsewhere"));
    add("kept-unread", "kept", unscanned.length, true);
  }
  if (src.device !== undefined) {
    add("caches", "device", countWhere(src.device, (r) => r.kind === "cache"));
    add("databases", "device", countWhere(src.device, (r) => r.kind === "database"));
  }
  if (src.features !== undefined) {
    const used = src.features.filter((r) => r.used);
    add("features-used", "features", used.length);
    add("features-asked", "features", countWhere(used, (r) => r.asks === "yes"));
    add("features-unconfirmed", "features", countWhere(used, (r) => r.asks === "UNKNOWN"), true);
    add("features-unused", "features", src.features.length - used.length);
  }
  if (src.addresses !== undefined) {
    add("pages", "addresses", countWhere(src.addresses.addresses, (a) => a.kind === "link"));
    add("names", "addresses", countWhere(src.addresses.addresses, (a) => a.kind === "identifier"));
    add("request-places", "addresses", src.addresses.calls.length);
    add("request-unknown", "addresses", countWhere(src.addresses.calls, (c) => c.destination === "UNKNOWN"), true);
  }
  if (src.statements !== undefined) {
    add("statement-parts", "statements", src.statements.length);
    // A part that makes requests, or was not checked, is not a pass: it is counted as unconfirmed.
    add("statement-unconfirmed", "statements", countWhere(src.statements, (r) => r.check !== "no-requests-in-file"), true);
  }
  return out;
}

/** How many figures count things the App has not confirmed, and how many things that is in all. */
export function glanceUnknowns(figures: readonly GlanceFigure[]): { figures: number; things: number } {
  const unknown = figures.filter((f) => f.unknown && f.count > 0);
  return { figures: unknown.length, things: unknown.reduce((n, f) => n + f.count, 0) };
}
