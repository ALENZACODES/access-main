/**
 * Framework-agnostic HTML renderers for the state views. Each returns a string with
 * semantic markup: a labelled region with a language attribute, real headings and
 * buttons, 44px targets, and colour pairs from the AA-checked palette. Status is
 * always written out ("UNKNOWN"), never conveyed by colour alone. All dynamic text is
 * escaped. htmlAudit.ts checks the output.
 */
import type { Locale, StateView } from "./stateCopy";
import { MIN_TARGET_PX, STATE_PALETTE, type PaletteRole, styleFor, type Theme } from "./contrast";
import { message } from "./messages";
import type { OfflineBanner } from "./offline";
import type { PlaceRouteView } from "./placeRoute";
import type { PlaceSummary } from "./placeSummary";
import type { PlaceCard, SearchRouteView } from "./searchRoute";
import type { SavedRouteView } from "./savedRoute";

export interface RenderOptions {
  readonly locale: Locale;
  /** Prefix that keeps element ids unique when several views share a page. */
  readonly idPrefix?: string;
  readonly theme?: Theme;
  /** Builds the link target for a place id; when absent, names are plain text. */
  readonly placeHref?: (id: string) => string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TARGET = `min-width:${MIN_TARGET_PX}px;min-height:${MIN_TARGET_PX}px`;

/** Link colours come from the AA-checked palette (focus ring colour on the body background). */
export function linkStyle(theme: Theme): string {
  const pal = STATE_PALETTE[theme];
  return `display:inline-flex;align-items:center;min-height:${MIN_TARGET_PX}px;color:${pal.focusRing};background:${pal.roles.body.bg}`;
}

export function renderLink(href: string, label: string, theme: Theme, extra = ""): string {
  return `<a href="${escapeHtml(href)}"${extra} style="${linkStyle(theme)}">${escapeHtml(label)}</a>`;
}

function nameOrLink(name: string, id: string | null, opts: RenderOptions): string {
  return id !== null && opts.placeHref ? renderLink(opts.placeHref(id), name, opts.theme ?? "light") : escapeHtml(name);
}

function button(action: string, label: string, theme: Theme, extra = ""): string {
  return `<button type="button" data-action="${escapeHtml(action)}"${extra} style="${TARGET};${styleFor("button", theme)}">${escapeHtml(label)}</button>`;
}

function region(role: PaletteRole, opts: RenderOptions, id: string, extraAttrs: string, inner: string): string {
  const theme = opts.theme ?? "light";
  return `<section lang="${opts.locale}"${extraAttrs} aria-labelledby="${id}-h" style="${styleFor(role, theme)}">${inner}</section>`;
}

function actions(view: { readonly actions: readonly { readonly id: string; readonly label: string }[] }, theme: Theme): string {
  if (view.actions.length === 0) return "";
  const items = view.actions.map((a) => `<li>${button(a.id, a.label, theme)}</li>`).join("");
  return `<ul>${items}</ul>`;
}

type ViewLike = Pick<StateView, "title" | "description" | "actions" | "role">;

export function renderStateView(view: ViewLike, opts: RenderOptions, id = `${opts.idPrefix ?? "state"}`): string {
  const theme = opts.theme ?? "light";
  const role: PaletteRole = view.role === "alert" ? "alert" : "status";
  const inner = `<h2 id="${id}-h">${escapeHtml(view.title)}</h2><p>${escapeHtml(view.description)}</p>${actions(view, theme)}`;
  return region(role, opts, id, ` role="${view.role}"`, inner);
}

export function renderBanner(b: OfflineBanner | null, opts: RenderOptions): string {
  if (!b) return "";
  return renderStateView(b, opts, `${opts.idPrefix ?? "page"}-banner`);
}

function note(text: string | null, role: PaletteRole, theme: Theme): string {
  return text ? `<p role="note" style="${styleFor(role, theme)}">${escapeHtml(text)}</p>` : "";
}

export function renderPlaceSummary(s: PlaceSummary, opts: RenderOptions, id = `${opts.idPrefix ?? "place"}`): string {
  const theme = opts.theme ?? "light";
  const rows = s.rows
    .map((r) => {
      const status =
        r.status === "unknown"
          ? `<strong style="${styleFor("unknown", theme)}">${escapeHtml(r.statusText)}</strong>`
          : `<strong>${escapeHtml(r.statusText)}</strong>`;
      const source = r.sourceLine
        ? `<details><summary style="${TARGET};cursor:pointer">${escapeHtml(message("place.showSource", opts.locale))}</summary><p>${escapeHtml(r.sourceLine)}</p><p>${escapeHtml(r.ageText ?? "")}</p></details>`
        : "";
      return `<div><dt>${escapeHtml(r.label)}</dt><dd>${status}${source}</dd></div>`;
    })
    .join("");
  const inner =
    `<h2 id="${id}-h">${escapeHtml(s.name)}</h2><p>${escapeHtml(s.countsText)}</p>` +
    note(s.staleNotice, "status", theme) +
    `<dl>${rows}</dl>`;
  return `<article lang="${opts.locale}" aria-labelledby="${id}-h" style="${styleFor("body", theme)}">${inner}</article>`;
}

export function renderPlaceRoute(v: PlaceRouteView, opts: RenderOptions): string {
  const prefix = opts.idPrefix ?? "place";
  const theme = opts.theme ?? "light";
  switch (v.kind) {
    case "content":
      return (
        renderBanner(v.banner, { ...opts, idPrefix: prefix }) +
        note(v.savedCopyNotice, "status", theme) +
        renderPlaceSummary(v.summary, opts, `${prefix}-summary`)
      );
    case "empty":
      return renderBanner(v.banner, { ...opts, idPrefix: prefix }) + renderStateView(v.view, opts, `${prefix}-empty`);
    case "error":
      return renderStateView(v.view, opts, `${prefix}-error`);
  }
}

function renderCard(c: PlaceCard, opts: RenderOptions, id: string): string {
  const theme = opts.theme ?? "light";
  const extra =
    (c.matchedText ? `<p>${escapeHtml(c.matchedText)}</p>` : "") +
    (c.unknownText ? `<p><strong style="${styleFor("unknown", theme)}">${escapeHtml(c.unknownText)}</strong></p>` : "");
  return `<article lang="${opts.locale}" aria-labelledby="${id}-h" style="${styleFor("body", theme)}"><h3 id="${id}-h">${nameOrLink(c.name, c.id, opts)}</h3><p>${escapeHtml(c.countsText)}</p>${extra}</article>`;
}

export function renderSearchRoute(v: SearchRouteView, opts: RenderOptions): string {
  const prefix = opts.idPrefix ?? "search";
  const theme = opts.theme ?? "light";
  if (v.kind === "error") return renderStateView(v.view, opts, `${prefix}-error`);

  const toggleHtml = v.unknownToggle
    ? button("toggle-unknown", v.unknownToggle.label, theme, ` data-include-unknown="${v.unknownToggle.nextIncludeUnknown ? "1" : "0"}"`)
    : "";
  const notice = note(v.unknownNotice, "status", theme);
  const banner = renderBanner(v.banner, { ...opts, idPrefix: prefix });

  if (v.kind === "empty") {
    return banner + renderStateView(v.view, opts, `${prefix}-empty`) + notice + toggleHtml;
  }
  const cards = v.cards.map((c, i) => `<li>${renderCard(c, opts, `${prefix}-card-${i}`)}</li>`).join("");
  const inner =
    `<h2 id="${prefix}-h">${escapeHtml(v.heading)}</h2>` +
    `<p role="status">${escapeHtml(v.announcement)}</p>` +
    toggleHtml +
    `<ul>${cards}</ul>`;
  return banner + region("body", opts, prefix, "", inner);
}

export function renderSavedRoute(v: SavedRouteView, opts: RenderOptions): string {
  const prefix = opts.idPrefix ?? "saved";
  const theme = opts.theme ?? "light";
  if (v.kind === "error") return renderStateView(v.view, opts, `${prefix}-error`);
  const banner = renderBanner(v.banner, { ...opts, idPrefix: prefix });
  if (v.kind === "empty") return banner + renderStateView(v.view, opts, `${prefix}-empty`);
  const items = v.items
    .map(
      (it, i) =>
        `<li>${it.id !== null && opts.placeHref ? `<p>${renderLink(opts.placeHref(it.id), it.summary.name, theme)}</p>` : ""}${renderPlaceSummary(it.summary, opts, `${prefix}-item-${i}`)}${button("remove-saved", it.removeLabel, theme, ` data-index="${i}"`)}</li>`,
    )
    .join("");
  const inner = `<h2 id="${prefix}-h">${escapeHtml(v.heading)}</h2><p role="status">${escapeHtml(v.countText)}</p><ul>${items}</ul>`;
  return banner + region("body", opts, prefix, "", inner);
}
