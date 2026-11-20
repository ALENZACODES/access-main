import { useId, useMemo } from "react";
import type { Point } from "./packGeo.ts";
import { nearestByTag, nearestDistance, nearestName, nearestNote, nearestTagLabel, noNearestText, unmeasuredLine } from "./packNearest.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  from: Point | null;
  locale: Locale;
}

/**
 * The closest place for each wheelchair tag, as a table. Shown on screen only; nothing here can be
 * saved or copied by the page, because a distance to a named place says roughly where it was typed from.
 */
export function PackNearest({ places, from, locale }: Props) {
  const headingId = useId();
  const result = useMemo(() => (from === null ? null : nearestByTag(places, from)), [places, from]);
  if (result === null || places.length === 0) return null;
  const note = unmeasuredLine(result.unmeasured, locale);
  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-pack-nearest>
      <p id={headingId}>
        <strong>{t(locale, "Closest place for each tag", "Lieu le plus proche pour chaque indication")}</strong>
      </p>
      <p>{nearestNote(locale)}</p>
      <table>
        <caption>{t(locale, "Closest place by wheelchair tag", "Lieu le plus proche par indication pour fauteuil roulant")}</caption>
        <thead>
          <tr>
            <th scope="col">{t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")}</th>
            <th scope="col">{t(locale, "Places", "Lieux")}</th>
            <th scope="col">{t(locale, "Closest place", "Lieu le plus proche")}</th>
            <th scope="col">{t(locale, "Distance", "Distance")}</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.tag} data-tag={row.tag}>
              <th scope="row">{nearestTagLabel(row.tag, locale)}</th>
              <td>{row.total}</td>
              {row.nearest === null ? (
                <td colSpan={2}>{noNearestText(row, locale)}</td>
              ) : (
                <>
                  <td>{nearestName(row.nearest, locale)}</td>
                  <td>{nearestDistance(row.nearest, locale)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {note ? <p>{note}</p> : null}
    </section>
  );
}
