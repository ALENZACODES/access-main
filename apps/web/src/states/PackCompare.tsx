import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import { type PackDiff, diffPacks, isUnchanged } from "./packDiff.ts";
import { type EarlierFile, MAX_LISTED_SKIPS, readEarlierFile } from "./packEarlier.ts";
import { DIFF_CSV_FILENAMES, DIFF_TEXT_FILENAMES, diffSummaryLine, diffToCsv, diffToText, fieldCountsLine, fieldLabel, placesWord } from "./packDiffText.ts";
import { problemText, skipText } from "./packCompareCopy.ts";
import { readExportRecords } from "./packExport.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

/** Longest list of places shown on the page. The saved files always hold every one. */
export const MAX_SHOWN = 50;

interface Props {
  /** The `places` array of the pack stored on this device. It is parsed here, not trusted. */
  places: unknown;
  locale: Locale;
  /** ISO date (YYYY-MM-DD). */
  today: string;
  /** Reads a chosen file as text. Replaceable for tests; the default reads it in the browser. */
  readFile?: (file: File) => Promise<string>;
  /** Receives a file to save; returns false when the browser cannot make one. */
  onSave?: (file: SavedFile) => boolean;
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("read-failed"));
    reader.readAsText(file);
  });
}

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "reading"; readonly name: string }
  | { readonly kind: "unreadable"; readonly name: string }
  | { readonly kind: "read"; readonly name: string; readonly file: EarlierFile };

function Capped<T>({ items, render, locale }: { items: readonly T[]; render: (item: T) => React.ReactNode; locale: Locale }) {
  const shown = items.slice(0, MAX_SHOWN);
  return (
    <>
      <ul>{shown.map(render)}</ul>
      {items.length > shown.length ? (
        <p>{t(locale, `${items.length - shown.length} more are in the saved files.`, `${items.length - shown.length} autres sont dans les fichiers enregistrés.`)}</p>
      ) : null}
    </>
  );
}

/**
 * Compares a places file the person saved earlier with the pack stored now, and says what is new,
 * no longer listed or different. The file is read on this device and never sent anywhere.
 */
export function PackCompare({ places, locale, today, readFile = readFileText, onSave = (file) => saveTextFile(file) }: Props) {
  const headingId = useId();
  const inputId = useId();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [saved, setSaved] = useState<{ name: string; ok: boolean } | null>(null);
  const parsed = useMemo(() => readExportRecords(places), [places]);
  const diff = useMemo<PackDiff | null>(() => {
    if (state.kind !== "read" || !state.file.ok) return null;
    const current = parsed.records.map((r) => r.place);
    const tiers = new Map(parsed.records.map((r) => [r.place.id, r.tier] as const));
    return diffPacks(state.file.places, current, { tiers });
  }, [state, parsed]);

  if (parsed.records.length === 0) return null;

  const choose = async (file: File | undefined) => {
    setSaved(null);
    if (!file) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "reading", name: file.name });
    try {
      const text = await readFile(file);
      setState({ kind: "read", name: file.name, file: readEarlierFile(text) });
    } catch {
      setState({ kind: "unreadable", name: file.name });
    }
  };
  const save = (file: SavedFile) => setSaved({ name: file.name, ok: onSave(file) });
  const name = (n: string | null) => n ?? "UNKNOWN";

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-pack-compare>
      <h2 id={headingId}>{t(locale, "Compare with an earlier file", "Comparer avec un fichier précédent")}</h2>
      <p>
        {t(
          locale,
          "Choose a places file (CSV) you saved earlier to see what is new, no longer listed or different in the pack stored now. The file stays on this device.",
          "Choisissez un fichier de lieux (CSV) enregistré plus tôt pour voir ce qui est nouveau, ne figure plus ou diffère dans le pack enregistré maintenant. Le fichier reste sur cet appareil.",
        )}
      </p>
      <label htmlFor={inputId}>{t(locale, "Earlier places file", "Fichier de lieux précédent")}</label>
      <input id={inputId} type="file" accept=".csv,text/csv" onChange={(e) => void choose(e.target.files?.[0])} />
      <p aria-live="polite" data-compare-status>
        {state.kind === "reading" ? t(locale, `Reading ${state.name}…`, `Lecture de ${state.name}…`) : ""}
        {state.kind === "unreadable" ? t(locale, `${state.name} could not be read.`, `${state.name} n’a pas pu être lu.`) : ""}
        {state.kind === "read" && !state.file.ok ? problemText(state.file.problem, locale, state.file.missing) : ""}
        {diff ? diffSummaryLine(diff, locale) : ""}
      </p>
      {state.kind === "read" && state.file.ok && diff ? (
        <>
          {fieldCountsLine(diff, locale) ? <p>{fieldCountsLine(diff, locale)}</p> : null}
          {state.file.skippedTotal > 0 ? (
            <details>
              <summary>
                {t(locale, `${placesWord(state.file.skippedTotal, locale)} in the file could not be used`, `${placesWord(state.file.skippedTotal, locale)} du fichier n’ont pas pu être utilisés`)}
              </summary>
              <ul>
                {state.file.skipped.map((s) => (
                  <li key={s.line}>{t(locale, `Line ${s.line}: ${skipText(s.reason, "en")}`, `Ligne ${s.line}\u00a0: ${skipText(s.reason, "fr")}`)}</li>
                ))}
              </ul>
              {state.file.skippedTotal > MAX_LISTED_SKIPS ? <p>{t(locale, "Only the first lines are listed.", "Seules les premières lignes sont listées.")}</p> : null}
            </details>
          ) : null}
          {diff.added.length > 0 ? (
            <details>
              <summary>{t(locale, `Added (${diff.added.length})`, `Ajoutés (${diff.added.length})`)}</summary>
              <Capped locale={locale} items={diff.added} render={(p) => <li key={p.id}>{name(p.name)}</li>} />
            </details>
          ) : null}
          {diff.removed.length > 0 ? (
            <details>
              <summary>{t(locale, `No longer listed (${diff.removed.length})`, `Ne figurent plus (${diff.removed.length})`)}</summary>
              <p>{t(locale, "The pack no longer lists these places. That does not say they are gone.", "Le pack ne liste plus ces lieux. Cela ne dit pas qu’ils ont disparu.")}</p>
              <Capped locale={locale} items={diff.removed} render={(p) => <li key={p.id}>{name(p.name)}</li>} />
            </details>
          ) : null}
          {diff.changed.length > 0 ? (
            <details>
              <summary>{t(locale, `Changed (${diff.changed.length})`, `Modifiés (${diff.changed.length})`)}</summary>
              <Capped
                locale={locale}
                items={diff.changed}
                render={(c) => (
                  <li key={c.id}>
                    <strong>{name(c.name)}</strong>
                    <ul>
                      {c.changes.map((f) => (
                        <li key={f.field}>
                          {fieldLabel(f.field, locale)}
                          {locale === "fr" ? "\u00a0:" : ":"} {f.before} → {f.after}
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              />
            </details>
          ) : null}
          {isUnchanged(diff) ? null : (
            <div className="stack" role="group" aria-label={t(locale, "Save the changes", "Enregistrer les changements")}>
              <Button variant="secondary" onPress={() => save({ name: DIFF_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: diffToCsv(diff, { bom: true }) })}>
                {t(locale, "Save the changes (CSV)", "Enregistrer les changements (CSV)")}
              </Button>
              <Button variant="secondary" onPress={() => save({ name: DIFF_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: diffToText(diff, locale, today) })}>
                {t(locale, "Save the changes (text)", "Enregistrer les changements (texte)")}
              </Button>
            </div>
          )}
        </>
      ) : null}
      <p aria-live="polite" data-compare-saved>
        {saved === null
          ? ""
          : saved.ok
            ? t(locale, `Saved ${saved.name}.`, `Fichier ${saved.name} enregistré.`)
            : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.")}
      </p>
    </section>
  );
}
