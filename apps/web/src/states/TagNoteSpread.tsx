import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import type { SavedFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { tsCaption, tsColumns, tsHeading, tsIntro, tsNoKinds, tsOrderGroup, tsOrderLabel, tsPercent, tsSaveCsv, tsTotals } from "./tagNoteMoreCopy.ts";
import { DEFAULT_SPREAD_ORDER, SPREAD_ORDERS, isSpreadOrder, orderSpread, spreadByKind, spreadTotals, type SpreadOrder } from "./tagNoteSpread.ts";
import { spreadCsvFile } from "./tagNoteSpreadExport.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave: (file: SavedFile) => void;
}

/** A table of the compared places by kind, with how many point different ways. A kind is never called worse. */
export function TagNoteSpread({ places, locale, onSave }: Props) {
  const headingId = useId();
  const [order, setOrder] = useState<SpreadOrder>(DEFAULT_SPREAD_ORDER);
  const rows = useMemo(() => spreadByKind(places), [places]);
  const ordered = useMemo(() => orderSpread(rows, order), [rows, order]);
  const c = tsColumns(locale);
  return (
    <section className="stack" aria-labelledby={headingId} data-tag-note-spread>
      <p id={headingId}>
        <strong>{tsHeading(locale)}</strong>
      </p>
      {rows.length === 0 ? (
        <p>{tsNoKinds(locale)}</p>
      ) : (
        <>
          <p>{tsIntro(locale)}</p>
          <p>{tsTotals(spreadTotals(rows), locale)}</p>
          <ChoiceGroup
            label={tsOrderGroup(locale)}
            value={order}
            onChange={(v) => {
              if (isSpreadOrder(v)) setOrder(v);
            }}
            options={SPREAD_ORDERS.map((o) => ({ value: o, label: tsOrderLabel(o, locale) }))}
          />
          <table>
            <caption>{tsCaption(locale)}</caption>
            <thead>
              <tr>
                <th scope="col">{c.kind}</th>
                <th scope="col">{c.checked}</th>
                <th scope="col">{c.flagged}</th>
                <th scope="col">{c.clear}</th>
                <th scope="col">{c.share}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td>{r.checked}</td>
                  <td>{r.flagged}</td>
                  <td>{r.clear}</td>
                  <td>{tsPercent(r.percent, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <Button variant="secondary" onPress={() => onSave(spreadCsvFile(ordered, locale))}>
              {tsSaveCsv(locale)}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
