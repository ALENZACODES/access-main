/**
 * HTML renderers for the map, compare, sources, correction and settings views. Same
 * conventions as renderHtml.ts: labelled regions, lang attribute, real controls with
 * 44px targets, palette-checked colours, escaped text, status written out in words.
 */
import type { Locale } from "./stateCopy";
import { MIN_TARGET_PX, STATE_PALETTE, styleFor, type Theme } from "./contrast";
import { type CorrectionField, FIELD_ORDER, type CorrectionValues, type FieldErrors } from "./correction";
import { FEATURE_IDS, featureLabel } from "./dataStatus";
import { message } from "./messages";
import type { CompareView } from "./compare";
import type { MapRouteView } from "./mapRoute";
import { type Preferences, TEXT_SCALES } from "./preferences";
import { type RenderOptions, escapeHtml, renderBanner, renderLink, renderStateView } from "./renderHtml";
import type { SourcesView } from "./sourcesPage";
import type { CoverageView } from "./coverage";

const BOX = `min-width:${MIN_TARGET_PX}px;min-height:${MIN_TARGET_PX}px`;
const theme = (o: RenderOptions): Theme => o.theme ?? "light";

function section(o: RenderOptions, id: string, role: "body" | "status" | "alert", inner: string, attrs = ""): string {
  return `<section lang="${o.locale}"${attrs} aria-labelledby="${id}-h" style="${styleFor(role, theme(o))}">${inner}</section>`;
}
const note = (text: string, o: RenderOptions, role: "status" | "alert" = "status"): string =>
  `<p role="note" style="${styleFor(role, theme(o))}">${escapeHtml(text)}</p>`;

export function renderMapRoute(v: MapRouteView, o: RenderOptions): string {
  const p = o.idPrefix ?? "map";
  if (v.kind === "error") return renderStateView(v.view, o, `${p}-error`);
  const banner = renderBanner(v.banner, { ...o, idPrefix: p });
  if (v.kind === "empty") return banner + renderStateView(v.view, o, `${p}-empty`);
  const items = v.entries
    .map((e, i) => {
      const name = e.id && o.placeHref ? renderLink(o.placeHref(e.id), e.name, theme(o)) : escapeHtml(e.name);
      const loc = e.known
        ? escapeHtml(e.locationText)
        : `<strong style="${styleFor("unknown", theme(o))}">${escapeHtml(e.locationText)}</strong>`;
      const dist = e.distanceText ? `<p>${escapeHtml(e.distanceText)}</p>` : "";
      const src = e.sourceLine ? `<p>${escapeHtml(e.sourceLine)}</p>` : "";
      const open = e.geoHref && e.openLabel ? renderLink(e.geoHref, e.openLabel, theme(o)) : "";
      return `<li><article lang="${o.locale}" aria-labelledby="${p}-e${i}-h" style="${styleFor("body", theme(o))}"><h3 id="${p}-e${i}-h">${name}</h3><p>${loc}</p>${dist}${src}${open}</article></li>`;
    })
    .join("");
  const nf = v.nearForm;
  const nearErr = nf.error ? `<p id="${p}-near-err" style="${styleFor("alert", theme(o))}">${escapeHtml(nf.error)}</p>` : "";
  const nearAttr = nf.error ? ` aria-invalid="true" aria-describedby="${p}-near-err"` : "";
  const field = (name: "lat" | "lon", label: string, value: string): string =>
    `<div><label for="${p}-${name}" style="display:block">${escapeHtml(label)}</label><input id="${p}-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" maxlength="20" value="${escapeHtml(value)}"${nearAttr} style="${FIELD_STYLE(o)}"></div>`;
  const nearForm =
    `<form method="get" action=""><fieldset><legend>${escapeHtml(nf.legend)}</legend>` +
    field("lat", nf.latLabel, nf.latValue) + field("lon", nf.lonLabel, nf.lonValue) + nearErr +
    `<p>${escapeHtml(nf.privacy)}</p>` +
    `<button type="submit" style="${BOX};${styleFor("button", theme(o))}">${escapeHtml(nf.submitLabel)}</button></fieldset></form>`;
  const inner =
    `<h2 id="${p}-h">${escapeHtml(v.heading)}</h2>` + note(v.note, o) + nearForm +
    (v.unlocatedNotice ? `<p role="status">${escapeHtml(v.unlocatedNotice)}</p>` : "") +
    `<ul>${items}</ul>`;
  return banner + section(o, p, "body", inner);
}

export function renderCompareRoute(v: CompareView, o: RenderOptions): string {
  const p = o.idPrefix ?? "compare";
  if (v.kind === "error") return renderStateView(v.view, o, `${p}-error`);
  const banner = renderBanner(v.banner, { ...o, idPrefix: p });
  const notices = v.notices.map((n) => note(n, o)).join("");
  if (v.kind === "too-few") {
    return banner + section(o, p, "body", `<h2 id="${p}-h">${escapeHtml(v.heading)}</h2><p role="status">${escapeHtml(v.text)}</p>${notices}`);
  }
  const head = `<th scope="col">${escapeHtml(v.detailHeader)}</th>` + v.columns.map((c) => `<th scope="col">${escapeHtml(c.name)}</th>`).join("");
  const rows = v.rows
    .map((r) => {
      const cells = r.cells
        .map((c) => {
          const text = c.status === "unknown"
            ? `<strong style="${styleFor("unknown", theme(o))}">${escapeHtml(c.statusText)}</strong>`
            : `<strong>${escapeHtml(c.statusText)}</strong>`;
          return `<td>${text}${c.sourceLine ? `<br><small>${escapeHtml(c.sourceLine)}</small>` : ""}</td>`;
        })
        .join("");
      const flag = r.differsText ? `<br><small>${escapeHtml(r.differsText)}</small>` : "";
      return `<tr><th scope="row">${escapeHtml(r.label)}${flag}</th>${cells}</tr>`;
    })
    .join("");
  const inner =
    `<h2 id="${p}-h">${escapeHtml(v.heading)}</h2>${notices}` +
    `<table><caption>${escapeHtml(v.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  return banner + section(o, p, "body", inner);
}

export function renderSourcesRoute(v: SourcesView, o: RenderOptions): string {
  const p = o.idPrefix ?? "sources";
  if (v.kind === "error") return renderStateView(v.view, o, `${p}-error`);
  const banner = renderBanner(v.banner, { ...o, idPrefix: p });
  const head = `<h2 id="${p}-h">${escapeHtml(v.heading)}</h2><p>${escapeHtml(v.intro)}</p>`;
  if (v.kind === "empty") return banner + section(o, p, "body", `${head}<p role="status">${escapeHtml(v.text)}</p>`);
  const rows = v.rows
    .map((r) => {
      const name = r.url ? renderLink(r.url, r.source, theme(o)) : escapeHtml(r.source);
      return `<tr><th scope="row">${name}</th><td>${escapeHtml(r.licenceName)}</td><td>${r.details}</td><td>${escapeHtml(r.latestText)}</td></tr>`;
    })
    .join("");
  const cols = [v.headers.source, v.headers.licence, v.headers.details, v.headers.latest]
    .map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("");
  return banner + section(o, p, "body", `${head}<table><caption>${escapeHtml(v.caption)}</caption><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>`);
}

function fieldError(o: RenderOptions, id: string, err: string | undefined): string {
  return err ? `<p id="${id}-err" style="${styleFor("alert", theme(o))}">${escapeHtml(err)}</p>` : "";
}
function invalid(id: string, err: string | undefined): string {
  return err ? ` aria-invalid="true" aria-describedby="${id}-err"` : "";
}
const FIELD_STYLE = (o: RenderOptions): string => {
  const b = STATE_PALETTE[theme(o)].roles.body;
  return `${BOX};color:${b.fg};background:${b.bg}`;
};

export interface CorrectionFormState {
  readonly placeName: string;
  readonly values: CorrectionValues;
  readonly errors: FieldErrors;
}

export function renderCorrectionForm(s: CorrectionFormState, o: RenderOptions): string {
  const p = o.idPrefix ?? "report";
  const L: Locale = o.locale;
  const errMsg = (f: CorrectionField): string | undefined => {
    const id = s.errors[f];
    return id ? message(id, L) : undefined;
  };
  const failed = FIELD_ORDER.filter((f) => s.errors[f] !== undefined);
  const summary = failed.length === 0 ? "" :
    `<div id="${p}-errors" role="alert" tabindex="-1" style="${styleFor("alert", theme(o))}"><p>${escapeHtml(message("report.errorSummary", L, { n: failed.length }))}</p><ul>` +
    failed.map((f) => `<li>${renderLink(`#${p}-${f}`, errMsg(f)!, theme(o))}</li>`).join("") + `</ul></div>`;

  const sel = (id: string, name: string, label: string, options: readonly (readonly [string, string])[], value: string, f: CorrectionField): string => {
    const opts = [`<option value="">${escapeHtml(message("report.choose", L))}</option>`]
      .concat(options.map(([v, t]) => `<option value="${escapeHtml(v)}"${v === value ? " selected" : ""}>${escapeHtml(t)}</option>`)).join("");
    return `<div><label for="${id}" style="display:block">${escapeHtml(label)}</label><select id="${id}" name="${name}" required${invalid(id, errMsg(f))} style="${FIELD_STYLE(o)}">${opts}</select>${fieldError(o, id, errMsg(f))}</div>`;
  };

  const featureOpts = FEATURE_IDS.map((id) => [id, featureLabel(id, L)] as const);
  const valueOpts = (["yes", "no", "partial", "unknown"] as const).map((v) => [v, message(`report.opt.${v}` as const, L)] as const);
  const noteId = `${p}-note`, contactId = `${p}-contact`, consentId = `${p}-consent`;

  const form =
    `<form method="post" action="">` +
    `<input type="hidden" name="placeId" value="${escapeHtml(s.values.placeId)}">` +
    sel(`${p}-feature`, "feature", message("report.feature", L), featureOpts, s.values.feature, "feature") +
    sel(`${p}-suggested`, "suggested", message("report.suggested", L), valueOpts, s.values.suggested, "suggested") +
    `<div><label for="${noteId}" style="display:block">${escapeHtml(message("report.note", L))}</label><textarea id="${noteId}" name="note" rows="4" maxlength="500"${invalid(noteId, errMsg("note"))} style="${FIELD_STYLE(o)}">${escapeHtml(s.values.note)}</textarea>${fieldError(o, noteId, errMsg("note"))}</div>` +
    `<div><label for="${contactId}" style="display:block">${escapeHtml(message("report.contact", L))}</label><input id="${contactId}" name="contact" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(s.values.contact)}"${invalid(contactId, errMsg("contact"))} style="${FIELD_STYLE(o)}">${fieldError(o, contactId, errMsg("contact"))}</div>` +
    `<div><input id="${consentId}" name="consent" type="checkbox"${s.values.consent ? " checked" : ""}${invalid(consentId, errMsg("consent"))} style="${FIELD_STYLE(o)}"><label for="${consentId}" style="display:inline-block;min-height:${MIN_TARGET_PX}px">${escapeHtml(message("report.consent", L))}</label>${fieldError(o, consentId, errMsg("consent"))}</div>` +
    `<button type="submit" style="${BOX};${styleFor("button", theme(o))}">${escapeHtml(message("report.submit", L))}</button></form>`;

  const inner =
    `<h2 id="${p}-h">${escapeHtml(message("report.heading", L))}</h2>` +
    `<p>${escapeHtml(message("report.place", L, { name: s.placeName }))}</p>` +
    `<p>${escapeHtml(message("report.intro", L))}</p>` + summary + form;
  return section(o, p, "body", inner);
}

export function renderConfirmation(text: string, backHref: string, backLabel: string, o: RenderOptions, id = "done"): string {
  return section(o, id, "status", `<h2 id="${id}-h">${escapeHtml(text)}</h2><p>${renderLink(backHref, backLabel, theme(o))}</p>`, ' role="status"');
}

export function renderSettingsForm(prefs: Preferences, o: RenderOptions, notice: string | null = null): string {
  const p = o.idPrefix ?? "settings";
  const L = o.locale;
  const radio = (name: string, value: string, label: string, checked: boolean): string => {
    const id = `${p}-${name}-${value}`;
    return `<div><input id="${id}" type="radio" name="${name}" value="${escapeHtml(value)}"${checked ? " checked" : ""} style="${FIELD_STYLE(o)}"><label for="${id}" style="display:inline-block;min-height:${MIN_TARGET_PX}px">${escapeHtml(label)}</label></div>`;
  };
  const group = (legend: string, inner: string): string => `<fieldset><legend>${escapeHtml(legend)}</legend>${inner}</fieldset>`;
  const form =
    `<form method="post" action="">` +
    group(message("settings.language", L),
      radio("locale", "auto", message("settings.language.auto", L), prefs.locale === "auto") +
      radio("locale", "en", "English", prefs.locale === "en") +
      radio("locale", "fr", "Français", prefs.locale === "fr")) +
    group(message("settings.theme", L),
      radio("theme", "system", message("settings.theme.system", L), prefs.theme === "system") +
      radio("theme", "light", message("settings.theme.light", L), prefs.theme === "light") +
      radio("theme", "dark", message("settings.theme.dark", L), prefs.theme === "dark")) +
    group(message("settings.textSize", L), TEXT_SCALES.map((n) => radio("textScale", String(n), `${n}%`, prefs.textScale === n)).join("")) +
    `<div><input id="${p}-motion" type="checkbox" name="reduceMotion"${prefs.reduceMotion ? " checked" : ""} style="${FIELD_STYLE(o)}"><label for="${p}-motion" style="display:inline-block;min-height:${MIN_TARGET_PX}px">${escapeHtml(message("settings.motion", L))}</label></div>` +
    `<button type="submit" style="${BOX};${styleFor("button", theme(o))}">${escapeHtml(message("settings.save", L))}</button></form>`;
  return section(o, p, "body", `<h2 id="${p}-h">${escapeHtml(message("settings.heading", L))}</h2>${notice ? note(notice, o) : ""}${form}`);
}

export function renderCoverageRoute(v: CoverageView, o: RenderOptions): string {
  const p = o.idPrefix ?? "coverage";
  if (v.kind === "error") return renderStateView(v.view, o, `${p}-error`);
  const banner = renderBanner(v.banner, { ...o, idPrefix: p });
  const head = `<h2 id="${p}-h">${escapeHtml(v.heading)}</h2><p>${escapeHtml(v.intro)}</p>`;
  const lines = v.lines.length > 0 ? `<ul>${v.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : "";
  if (v.kind === "empty") return banner + section(o, p, "body", `${head}<p role="status">${escapeHtml(v.text)}</p>${lines}`);
  const h = v.headers;
  const cols = [h.feature, h.yes, h.no, h.partial, h.unknown, h.share].map((x) => `<th scope="col">${escapeHtml(x)}</th>`).join("");
  const rows = v.rows
    .map((r) => `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${r.yes}</td><td>${r.no}</td><td>${r.partial}</td><td><strong style="${styleFor("unknown", theme(o))}">${r.unknown}</strong></td><td>${escapeHtml(r.shareText)}</td></tr>`)
    .join("");
  return banner + section(o, p, "body", `${head}${lines}<table><caption>${escapeHtml(v.caption)}</caption><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>`);
}

/** Static page served (and cached) for navigations that fail while offline. */
export function renderOfflinePage(o: RenderOptions, links: readonly { readonly href: string; readonly label: string }[]): string {
  const p = o.idPrefix ?? "offline";
  const inner =
    `<h2 id="${p}-h">${escapeHtml(message("offline.body", o.locale))}</h2>` +
    `<ul>${links.map((l) => `<li>${renderLink(l.href, l.label, theme(o))}</li>`).join("")}</ul>`;
  return section(o, p, "status", inner, ' role="status"');
}
