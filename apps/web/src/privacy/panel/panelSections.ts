import { formatActivityTime, type ActivityEntry } from "./activityLog";
import type { ChangesView } from "./changes";
import type { Purpose } from "./consent";
import { activityText, EXTRA_STRINGS, formatBytes, storedSummary } from "./copyExtra";
import type { Locale } from "./copyLint";
import { button, esc } from "./html";
import type { InventoryEntry } from "./inventory";
import type { Reconciled } from "./reconcile";
import type { BlockedView } from "./egressLog";
import { MORE_STRINGS } from "./copyMore";
import { formatActivityTime as fmtTime } from "./activityLog";

const colon = (locale: Locale): string => (locale === "fr" ? "\u00a0:" : ":");

export function renderActivityHtml(
  locale: Locale,
  entries: readonly ActivityEntry[],
  purposes: readonly Purpose[],
): string {
  const x = EXTRA_STRINGS[locale].activity;
  const labelOf = (id: string): string | undefined => purposes.find((p) => p.id === id)?.label[locale];
  const body =
    entries.length === 0
      ? `<p>${esc(x.empty)}</p>`
      : `<ol>${entries
          .map(
            (e) =>
              `<li><time datetime="${esc(e.at)}">${esc(formatActivityTime(e.at))}</time> — ${esc(activityText(locale, e, labelOf))}</li>`,
          )
          .join("")}</ol>`;
  return `<div data-privacy-activity><h3>${esc(x.heading)}</h3><p>${esc(x.note)}</p>${body}</div>`;
}

export function renderStoredHtml(
  locale: Locale,
  stored: Reconciled,
  inventory: readonly InventoryEntry[],
): string {
  const x = EXTRA_STRINGS[locale].stored;
  const summary = esc(
    storedSummary(locale, { count: stored.items.length, bytes: stored.totalBytes, undocumented: stored.undocumented.length }),
  );
  const note = stored.unmatchable.length > 0 ? `<p>${esc(x.unmatchable)}</p>` : "";
  if (stored.items.length === 0) {
    return `<div data-privacy-stored><h3>${esc(x.heading)}</h3><p>${esc(x.empty)}</p>${note}</div>`;
  }
  const rows = stored.items
    .map((i) => {
      const owner = i.entryId === undefined ? undefined : inventory.find((e) => e.id === i.entryId);
      const expires = i.expiresAt === undefined ? x.noExpiry : formatActivityTime(i.expiresAt).slice(0, 10);
      return (
        `<tr data-key="${esc(i.key)}"><th scope="row">${esc(i.key)}</th><td>${esc(formatBytes(locale, i.bytes))}</td>` +
        `<td>${esc(expires)}</td><td>${esc(owner === undefined ? x.unlisted : owner.label[locale])}</td></tr>`
      );
    })
    .join("");
  const c = x.columns;
  const head = [c.name, c.size, c.expires, c.described].map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  return (
    `<div data-privacy-stored><h3>${esc(x.heading)}</h3><p>${summary}</p>${note}` +
    `<div role="region" aria-labelledby="privacy-stored-caption" style="overflow-wrap:anywhere">` +
    `<table><caption id="privacy-stored-caption">${esc(x.note)}</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`
  );
}

export function renderChangesHtml(locale: Locale, changes: ChangesView): string {
  const x = EXTRA_STRINGS[locale].changes;
  let body: string;
  if (changes.kind === "first-view") {
    body = `<p>${esc(x.firstView)}</p>`;
  } else if (changes.kind === "none") {
    body = `<p>${esc(x.none(changes.seenOn))}</p>`;
  } else {
    const group = (name: string, labels: ReadonlyArray<{ en: string; fr: string }>): string =>
      labels.length === 0 ? "" : `<li>${esc(name)}${colon(locale)} ${esc(labels.map((l) => l[locale]).join(", "))}</li>`;
    body =
      `<p>${esc(x.since(changes.seenOn))}</p><ul>${group(x.added, changes.added)}${group(x.changed, changes.changed)}` +
      `${group(x.removed, changes.removed)}</ul>${button("mark-seen", x.markSeen)}`;
  }
  return `<div data-privacy-changes><h3>${esc(x.heading)}</h3>${body}</div>`;
}

export interface NetworkView {
  selfOrigin: string;
  allowedOrigins: readonly string[];
  blocked: BlockedView;
}

export function renderNetworkHtml(locale: Locale, v: NetworkView): string {
  const x = MORE_STRINGS[locale].network;
  const allowed =
    `<li>${esc(x.self)}: ${esc(v.selfOrigin)}</li>` + v.allowedOrigins.map((o) => `<li>${esc(o)}</li>`).join("");
  const others = v.allowedOrigins.length === 0 ? `<p>${esc(x.noOthers)}</p>` : "";
  let blocked: string;
  if (v.blocked.hosts.length === 0) {
    blocked = `<p>${esc(x.noneBlocked)}</p>`;
  } else {
    const total = v.blocked.hosts.reduce((a, h) => a + h.count, 0);
    const rows = v.blocked.hosts
      .map(
        (h) =>
          `<tr data-host="${esc(h.host)}"><th scope="row">${esc(h.host)}</th><td>${h.count}</td>` +
          `<td><time datetime="${esc(h.lastAt)}">${esc(fmtTime(h.lastAt))}</time></td></tr>`,
      )
      .join("");
    const head = [x.columns.host, x.columns.times, x.columns.last].map((c) => `<th scope="col">${esc(c)}</th>`).join("");
    blocked =
      `<p>${esc(x.summary(total, v.blocked.hosts.length))}</p>` +
      `<div role="region" aria-labelledby="privacy-network-caption" style="overflow-wrap:anywhere">` +
      `<table><caption id="privacy-network-caption">${esc(x.blockedNote)}</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return (
    `<div data-privacy-network><h3>${esc(x.heading)}</h3><p>${esc(x.note)}</p>` +
    `<h4>${esc(x.allowedHeading)}</h4><ul>${allowed}</ul>${others}<h4>${esc(x.blockedHeading)}</h4>${blocked}</div>`
  );
}

export function renderImportHtml(locale: Locale, pending: boolean): string {
  const x = MORE_STRINGS[locale].importer;
  const input =
    `<label for="privacy-import-file" style="display:inline-flex;align-items:center;min-height:44px;min-width:44px">${esc(x.fileLabel)}</label> ` +
    `<input id="privacy-import-file" type="file" accept="application/json,.json" data-import-file style="min-width:44px;min-height:44px">`;
  const actions = pending ? `${button("import-confirm", x.confirmButton)}${button("import-cancel", x.cancelButton)}` : "";
  return `<div data-privacy-import><h3>${esc(x.heading)}</h3><p>${esc(x.note)}</p><div>${input}</div>${actions}</div>`;
}

// ---- browser signals, offline storage and protected copies (P10G) ----

import { DEVICE_STRINGS } from "./copyDevice";
import type { DeviceScan } from "./deviceStorage";
import type { Signals } from "./signals";

export const UNKNOWN_SIGNALS: Signals = {
  gpc: "unknown",
  dnt: "unknown",
  cookies: "unknown",
  secureContext: "unknown",
  persistent: "unknown",
  usageBytes: null,
  quotaBytes: null,
};

export function renderSignalsHtml(locale: Locale, signals: Signals | null): string {
  const x = DEVICE_STRINGS[locale].signals;
  const s = signals ?? UNKNOWN_SIGNALS;
  const rows: Array<[string, Signals[keyof Signals]]> = [
    [x.rows.gpc, s.gpc],
    [x.rows.dnt, s.dnt],
    [x.rows.cookies, s.cookies],
    [x.rows.secure, s.secureContext],
    [x.rows.persistent, s.persistent],
  ];
  const body = rows.map(([name, v]) => `<tr><th scope="row">${esc(name)}</th><td>${esc(x.value[v as "yes" | "no" | "unknown"])}</td></tr>`).join("");
  return (
    `<div data-privacy-signals><h3>${esc(x.heading)}</h3><p>${esc(x.note)}</p>` +
    `<table><caption>${esc(x.heading)}</caption><thead><tr><th scope="col">${esc(x.columns.signal)}</th>` +
    `<th scope="col">${esc(x.columns.value)}</th></tr></thead><tbody>${body}</tbody></table>` +
    `<p>${esc(x.usage(s.usageBytes, s.quotaBytes))}</p></div>`
  );
}

export interface DeviceView {
  scan: DeviceScan | null;
  /** A cache or database prefix was configured, so removal is offered */
  canErase: boolean;
  confirming: boolean;
  removableCaches: number;
  removableDatabases: number;
}

export function renderDeviceHtml(locale: Locale, v: DeviceView): string {
  const x = DEVICE_STRINGS[locale].device;
  const group = (heading: string, names: string[] | null): string => {
    const body =
      names === null ? `<p>${esc(x.unknown)}</p>` : names.length === 0 ? `<p>${esc(x.none)}</p>` : `<ul>${names.map((nm) => `<li>${esc(nm)}</li>`).join("")}</ul>`;
    return `<h4>${esc(heading)}</h4>${body}`;
  };
  let body: string;
  if (v.scan === null) {
    body = `<p>${esc(x.notChecked)}</p>`;
  } else {
    body =
      `<p>${esc(x.checkedAt(v.scan.at.slice(0, 10)))}</p>` +
      group(x.cachesHeading, v.scan.caches) +
      group(x.databasesHeading, v.scan.databases) +
      group(x.cookiesHeading, v.scan.cookies);
  }
  let clear = "";
  if (v.canErase && v.scan !== null) {
    clear =
      v.removableCaches + v.removableDatabases === 0
        ? `<p>${esc(x.nothingToClear)}</p>`
        : v.confirming
          ? `<div role="group" aria-labelledby="privacy-device-confirm-title" data-privacy-device-confirm>` +
            `<h4 id="privacy-device-confirm-title">${esc(x.confirmTitle)}</h4><p>${esc(x.confirmBody(v.removableCaches, v.removableDatabases))}</p>` +
            `${button("clear-device-cancel", x.confirmNo)}${button("clear-device-confirm", x.confirmYes)}</div>`
          : button("clear-device-ask", x.clearButton);
  }
  return `<div data-privacy-device><h3>${esc(x.heading)}</h3><p>${esc(x.note)}</p>${body}<div>${button("scan-device", x.scanButton)}</div>${clear}</div>`;
}

export function renderProtectedHtml(locale: Locale): string {
  const x = DEVICE_STRINGS[locale].copy;
  const field = "min-width:44px;min-height:44px";
  const label = "display:inline-flex;align-items:center;min-height:44px;min-width:44px";
  return (
    `<div role="group" aria-labelledby="privacy-protected-title" data-privacy-protected>` +
    `<h3 id="privacy-protected-title">${esc(x.heading)}</h3><p>${esc(x.note)}</p><p id="privacy-protected-hint">${esc(x.hint)}</p>` +
    `<div><label for="privacy-protected-pass" style="${label}">${esc(x.passLabel)}</label> ` +
    `<input id="privacy-protected-pass" type="password" autocomplete="new-password" spellcheck="false" data-protected-pass aria-describedby="privacy-protected-hint" style="${field}"></div>` +
    `<div><label for="privacy-protected-confirm" style="${label}">${esc(x.confirmLabel)}</label> ` +
    `<input id="privacy-protected-confirm" type="password" autocomplete="new-password" spellcheck="false" data-protected-confirm style="${field}"></div>` +
    `${button("export-protected", x.exportButton)}` +
    `<div><label for="privacy-protected-file" style="${label}">${esc(x.fileLabel)}</label> ` +
    `<input id="privacy-protected-file" type="file" accept="application/json,.json" data-protected-file style="${field}"></div></div>`
  );
}
