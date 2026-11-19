import { useId, useMemo } from "react";
import { computeFreshness, freshnessSummary, bucketLines, rangeLine, undatedLine } from "./packFreshness.ts";
import { parsePackPlaces } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The `places` array of the pack stored on this device, as read. It is parsed here, not trusted. */
  places: unknown;
  locale: Locale;
  /** ISO date; defaults to today on this device. */
  today?: string;
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * How old the retrieval dates of the saved places are. It reports dates and never says the data is
 * current. Reading only: nothing is fetched. Shown as a polite status so it does not interrupt.
 */
export function PackFreshness({ places, locale, today }: Props) {
  const headingId = useId();
  const f = useMemo(() => computeFreshness(parsePackPlaces(places).places, today ?? localToday()), [places, today]);
  if (f.level === "empty") return null;
  const range = rangeLine(f, locale);
  const undated = undatedLine(f, locale);
  return (
    <section aria-labelledby={headingId} lang={locale} data-freshness={f.level}>
      <h2 id={headingId}>{t(locale, "How old the saved places are", "Ancienneté des lieux enregistrés")}</h2>
      <p>{freshnessSummary(f, locale)}</p>
      {range ? <p>{range}</p> : null}
      {bucketLines(f, locale).length > 0 ? (
        <ul>
          {bucketLines(f, locale).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {undated ? <p>{undated}</p> : null}
    </section>
  );
}
