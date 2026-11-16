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
