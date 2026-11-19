import { useId, useMemo } from "react";
import { type CreditRecord, OSM_CREDIT, buildCredits, dateRangeText, tierCountsText } from "./dataCredits.ts";
import { pluralCategory } from "./messages.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  records: readonly CreditRecord[];
  locale: Locale;
  /** ISO date; defaults to today on this device. */
  today?: string;
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function count(n: number, locale: Locale): string {
  const one = pluralCategory(locale, n) === "one";
  return t(locale, one ? `${n} record` : `${n} records`, one ? `${n} enregistrement` : `${n} enregistrements`);
}

/**
 * Where the saved records came from: source, open licence, retrieval dates and tiers, grouped.
 * Reading only. Nothing here is fetched; it works from the records already on this device.
 */
export function DataCredits({ records, locale, today }: Props) {
  const headingId = useId();
  const credits = useMemo(() => buildCredits(records, today ?? localToday()), [records, today]);
  const heading = t(locale, "Sources of the records saved on this device", "Sources des enregistrements sur cet appareil");

  if (credits.recordCount === 0) {
    return (
      <section aria-labelledby={headingId} lang={locale}>
        <h2 id={headingId}>{heading}</h2>
        <p>{t(locale, "No saved records on this device, so there is nothing to credit yet.", "Aucun enregistrement sur cet appareil : il n’y a encore rien à créditer.")}</p>
      </section>
    );
  }
  return (
    <section aria-labelledby={headingId} lang={locale}>
      <h2 id={headingId}>{heading}</h2>
      {credits.needsOsmCredit ? <p>{OSM_CREDIT}</p> : null}
      <ul className="credit-list">
        {credits.groups.map((g) => (
          <li key={g.key} className="credit-group">
            <h3>{g.source}</h3>
            <p>
              {t(locale, "Licence: ", "Licence : ")}
              <a className="text-link" href={g.licenceUrl} rel="noreferrer noopener">
                {g.licenceName}
              </a>
            </p>
            <p>{count(g.records, locale)}</p>
            <p>{dateRangeText(g, locale)}</p>
            <p>{tierCountsText(g, locale)}</p>
            {g.staleRecords > 0 ? (
              <p>{t(locale, `${g.staleRecords} may be out of date.`, `${g.staleRecords} peuvent être périmés.`)}</p>
            ) : null}
            {g.urls.map((url) => (
              <p key={url}>
                <a className="text-link" href={url} rel="noreferrer noopener">
                  {url}
                </a>
              </p>
            ))}
          </li>
        ))}
      </ul>
      {credits.withoutSource > 0 ? (
        <p>
          {t(
            locale,
            `${count(credits.withoutSource, locale)} carry no usable source, so no detail from them is shown as known.`,
            `${count(credits.withoutSource, locale)} sans source utilisable : aucun détail qui en provient n’est présenté comme connu.`,
          )}
        </p>
      ) : null}
    </section>
  );
}
