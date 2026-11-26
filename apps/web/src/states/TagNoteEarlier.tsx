import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { checkPlaces } from "./tagNoteCheck.ts";
import { tnNoName } from "./tagNoteCheckCopy.ts";
import { compareWithEarlier, looksLikeFindingsFile, readEarlierFindings, type EarlierReading } from "./tagNoteEarlier.ts";
import { TE_SHOWN, teCaveat, teChangeLabel, teChangeLine, teClear, teCompare, teEmpty, teFileLabel, teHeading, teIntro, teNotThisFile, teNothing, teProblem, teSkipped, teSummary } from "./tagNoteMoreCopy.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
}

type Result = { readonly kind: "none" } | { readonly kind: "empty" } | { readonly kind: "wrong-file" } | { readonly kind: "read"; readonly reading: EarlierReading };

/**
 * Which places point different ways now compared with a findings file saved earlier. The text is pasted in
 * and read in the page; the comparison is made from the words only and does not say which side is right.
 */
export function TagNoteEarlier({ places, locale }: Props) {
  const headingId = useId();
  const areaId = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result>({ kind: "none" });
  const diff = useMemo(() => (result.kind === "read" && result.reading.ok ? compareWithEarlier(checkPlaces(places).findings, result.reading.findings) : null), [result, places]);

  const compare = () => {
    if (text.trim() === "") return setResult({ kind: "empty" });
    if (!looksLikeFindingsFile(text)) return setResult({ kind: "wrong-file" });
    setResult({ kind: "read", reading: readEarlierFindings(text) });
  };
  const clear = () => {
    setText("");
    setResult({ kind: "none" });
  };

  const status =
    result.kind === "empty" ? teEmpty(locale) : result.kind === "wrong-file" ? teNotThisFile(locale) : result.kind === "read" && !result.reading.ok ? teProblem(result.reading.problem, locale, result.reading.missing) : "";
  const rows = diff ? diff.rows.filter((r) => r.change !== "same") : [];
  return (
    <section className="stack" aria-labelledby={headingId} data-tag-note-earlier>
      <p id={headingId}>
        <strong>{teHeading(locale)}</strong>
      </p>
      <p>{teIntro(locale)}</p>
      <label htmlFor={areaId}>{teFileLabel(locale)}</label>
      <textarea id={areaId} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <Button variant="secondary" onPress={compare}>
          {teCompare(locale)}
        </Button>
        <Button variant="secondary" onPress={clear}>
          {teClear(locale)}
        </Button>
      </div>
      <p role="status">{status}</p>
      {diff && result.kind === "read" && result.reading.ok ? (
        diff.rows.length === 0 ? (
          <p>{teNothing(locale)}</p>
        ) : (
          <>
            <p>{teSummary(diff.counts, locale)}</p>
            {result.reading.skipped > 0 ? <p>{teSkipped(result.reading.skipped, locale)}</p> : null}
            <ul data-tag-note-earlier-list>
              {rows.slice(0, TE_SHOWN).map((r) => (
                <li key={`${r.change}-${r.id}`}>
                  <strong>{r.name ?? tnNoName(locale)}</strong> — {teChangeLabel(r.change, locale)}
                  <br />
                  <small>{teChangeLine(r.change, locale)}</small>
                </li>
              ))}
            </ul>
            {rows.length > TE_SHOWN ? <p>{locale === "fr" ? `${rows.length - TE_SHOWN} autres ne sont pas affichés.` : `${rows.length - TE_SHOWN} more are not shown.`}</p> : null}
            <p>{teCaveat(locale)}</p>
          </>
        )
      ) : null}
    </section>
  );
}
