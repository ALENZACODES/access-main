import { useTranslation } from "react-i18next";
import type { ModuleId, ModuleResult, Provenance } from "@access/shared";

type Locale = "en" | "fr";

export interface ItemView {
  key: string;
  label: string;
  /** Set when the label is in a language other than the screen's. */
  lang?: Locale;
  source: string | null;
  licence: string | null;
  date: string | null;
  tier: string | null;
}

/** Lane message keys are not shell strings. The shell chooses its own sentence for each state. */
export function statusKey(result: ModuleResult<unknown>): string {
  if (result.availability === "ready") return "modules.ready";
  if (result.availability === "stub") return "modules.unavailable";
  return result.messageKey === "modules.contractError" ? "modules.contractError" : "modules.error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, locale: Locale): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (isRecord(value) && typeof value[locale] === "string" && (value[locale] as string).trim()) return value[locale] as string;
  return null;
}

function fromProvenance(provenance: Provenance): Pick<ItemView, "source" | "licence" | "date" | "tier"> {
  return {
    source: provenance.source_name,
    licence: provenance.licence,
    date: provenance.source_date.slice(0, 10),
    tier: String(provenance.tier),
  };
}

/**
 * Turns a checked lane item into what the screen lists. The shell only gets
 * here after `guardModules` has accepted the result, so provenance is present
 * where the contract requires it. Nothing is filled in: a licence of UNKNOWN
 * is shown as Unknown.
 */
export function toItemView(id: ModuleId, item: unknown, locale: Locale, index: number): ItemView | null {
  if (!isRecord(item)) return null;
  const key = typeof item.id === "string" ? item.id : `item-${index}`;
  if (id === "navigator") {
    const label = text(item.name, locale);
    if (!label) return null;
    return {
      key,
      label,
      source: text(item.sourceName, locale),
      licence: text(item.licenceNote, locale),
      date: text(item.retrievedOn, locale),
      tier: "E",
    };
  }
  const label = text(item.name, locale) ?? text(item.title, locale) ?? text(item.summary, locale);
  if (!label) return null;
  const lang = item.locale === "en" || item.locale === "fr" ? (item.locale as Locale) : undefined;
  const meta = isRecord(item.provenance)
    ? fromProvenance(item.provenance as unknown as Provenance)
    : { source: null, licence: null, date: null, tier: null };
  return { key, label, ...(lang && lang !== locale ? { lang } : {}), ...meta };
}

export function ResultItems({ id, items }: { id: ModuleId; items: readonly unknown[] }) {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const views = items
    .map((item, index) => toItemView(id, item, locale, index))
    .filter((view): view is ItemView => view !== null);
  if (views.length === 0) return null;
  const unknown = (value: string | null) => (value && value.toUpperCase() !== "UNKNOWN" ? value : t("modules.unknownValue"));
  return (
    <ul className="stack result-items">
      {views.map((view) => (
        <li key={view.key}>
          <p className="result-name" lang={view.lang}>
            {view.label}
          </p>
          {view.tier !== null ? (
            <dl className="result-meta">
              <div>
                <dt>{t("modules.itemSource")}</dt>
                <dd>{unknown(view.source)}</dd>
              </div>
              <div>
                <dt>{t("modules.itemLicence")}</dt>
                <dd>{unknown(view.licence)}</dd>
              </div>
              <div>
                <dt>{t("modules.itemDate")}</dt>
                <dd>{unknown(view.date)}</dd>
              </div>
              <div>
                <dt>{t("modules.itemTier")}</dt>
                <dd>{t("modules.itemTierValue", { tier: view.tier })}</dd>
              </div>
            </dl>
          ) : null}
          {view.lang ? <p className="result-note">{t(view.lang === "en" ? "modules.inEnglish" : "modules.inFrench")}</p> : null}
        </li>
      ))}
    </ul>
  );
}
