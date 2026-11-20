import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { explainPackSearch } from "./packSearchExplain.ts";
import { searchWhyHeading, searchWhyIntro, searchWhyLine, searchWhyNoSingle, searchWhyTakeOut, searchEchoHeading, searchExampleCount, searchExamples, searchHelpHeading, searchHelpIntro, searchHelpToggle, searchProblemsHeading, searchTryLabel } from "./packSearchHelp.ts";
import { filterBySearch } from "./packSearchMatch.ts";
import { parsePackSearch } from "./packSearchParse.ts";
import { whyNoPlaces } from "./packSearchWhy.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface EchoProps {
  text: string;
  locale: Locale;
}

/** How the typed search was read. Shown only when it uses more than plain words, or something in it was left out. */
export function PackSearchEcho({ text, locale }: EchoProps) {
  const explanation = useMemo(() => explainPackSearch(parsePackSearch(text), locale), [text, locale]);
  if (explanation === null) return null;
  return (
    <div className="stack" lang={locale} aria-live="polite" data-pack-search-echo>
      <p>
        <strong>{searchEchoHeading(locale)}</strong>
      </p>
      {explanation.lines.length > 0 ? (
        <ul>
          {explanation.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
      {explanation.problems.length > 0 ? (
        <>
          <p>
            <strong>{searchProblemsHeading(locale)}</strong>
          </p>
          <ul>
            {explanation.problems.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

interface HelpProps {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** Puts an example in the search box. */
  onTry: (text: string) => void;
}

/** Closed until asked for. Each example says how many places in the pack it finds, and can be tried with one press. */
export function PackSearchHelp({ places, locale, onTry }: HelpProps) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const examples = useMemo(() => searchExamples(locale).map((e) => ({ ...e, count: filterBySearch(places, parsePackSearch(e.text)).length })), [places, locale]);
  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-pack-search-help>
      <p id={headingId}>
        <strong>{searchHelpHeading(locale)}</strong>
      </p>
      <Button variant="quiet" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
        {searchHelpToggle(open, locale)}
      </Button>
      {open ? (
        <div className="stack" data-pack-search-help-body>
          <p>{searchHelpIntro(locale)}</p>
          <ul className="stack" aria-label={t(locale, "Examples", "Exemples")}>
            {examples.map((e) => (
              <li key={e.text} className="stack">
                <p>
                  <code>{e.text}</code>
                  <br />
                  {e.meaning} {searchExampleCount(e.count, locale)}.
                </p>
                <Button variant="secondary" aria-label={`${searchTryLabel(locale)}${locale === "fr" ? "\u00a0: " : ": "}${e.text}`} onPress={() => onTry(e.text)}>
                  {searchTryLabel(locale)}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

interface WhyProps {
  places: readonly PackPlaceRecord[];
  text: string;
  locale: Locale;
  /** Puts a changed search in the box. */
  onUse: (text: string) => void;
}

/** For a search of several parts that finds nothing: how many places each part finds, and a way to take one out. */
export function PackSearchWhy({ places, text, locale, onUse }: WhyProps) {
  const why = useMemo(() => whyNoPlaces(places, parsePackSearch(text)), [places, text]);
  if (why === null) return null;
  return (
    <section className="stack" lang={locale} aria-live="polite" data-pack-search-why>
      <p>
        <strong>{searchWhyHeading(locale)}</strong>
      </p>
      <p>{searchWhyIntro(locale)}</p>
      <ul className="stack">
        {why.counts.map((c) => (
          <li key={c.index} className="stack">
            <p>{searchWhyLine(c.typed, c.alone, c.without, locale)}</p>
            {c.without > 0 ? (
              <Button variant="secondary" onPress={() => onUse(c.withoutText)}>
                {searchWhyTakeOut(c.typed, locale)}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {why.best === null ? <p>{searchWhyNoSingle(locale)}</p> : null}
    </section>
  );
}
