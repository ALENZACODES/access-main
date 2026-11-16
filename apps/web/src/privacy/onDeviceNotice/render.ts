import { STRINGS, type Locale, type Where } from "./strings.ts";

export interface NoticeItem {
  id: string;
  label: { en: string; fr: string };
  /** Omit when not confirmed: it is shown as "unknown", never assumed. */
  where?: Where;
}

export interface NoticeOptions {
  locale: Locale;
  items: readonly NoticeItem[];
  /** ISO date (YYYY-MM-DD) the list was last reviewed by the App's team. */
  reviewedOn?: string;
  showDismiss?: boolean;
}

export const MIN_TARGET_PX = 44;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Static HTML for the notice. Pure: no DOM, safe to render on the server. */
export function renderOnDeviceNoticeHtml(opts: NoticeOptions): string {
  const s = STRINGS[opts.locale];
  const titleId = "privacy-on-device-title";
  const colon = opts.locale === "fr" ? "\u00A0:" : ":";
  const rows = opts.items
    .map((it) => {
      const w = it.where ?? "unknown";
      return `<li data-where="${w}">${esc(it.label[opts.locale])}${colon} <strong>${esc(s.where[w])}</strong></li>`;
    })
    .join("");
  const body = opts.items.length > 0 ? `<ul>${rows}</ul>` : `<p>${esc(s.empty)}</p>`;
  const reviewed =
    opts.reviewedOn !== undefined && ISO_DATE.test(opts.reviewedOn)
      ? `<p>${esc(s.reviewed(opts.reviewedOn))}</p>`
      : "";
  const dismiss = opts.showDismiss
    ? `<button type="button" data-privacy-dismiss style="min-width:${MIN_TARGET_PX}px;min-height:${MIN_TARGET_PX}px">${esc(s.dismiss)}</button>`
    : "";
  return `<section lang="${opts.locale}" aria-labelledby="${titleId}"><h2 id="${titleId}">${esc(s.title)}</h2>${body}${reviewed}${dismiss}</section>`;
}
