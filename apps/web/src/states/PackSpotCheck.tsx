import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup, TextInput } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import { DEFAULT_SAMPLE_SIZE, MAX_SEED_CHARS, SAMPLE_SIZES, cleanSeed, parseSampleSize, sampleForSpotCheck } from "./spotSample.ts";
import { buildSpotSheet } from "./spotSheet.ts";
import { SpotResults } from "./SpotResults.tsx";
import { SPOT_FILENAMES, spotSampleLine, tagWord, tallyLine } from "./spotSheetCopy.ts";
import { spotSheetToCsv, spotSheetToHtml, spotSheetToText } from "./spotSheetExport.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The places on screen: the sheet is chosen from these. */
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** ISO date; the seed starts as this, so the sheet is the same all day. Defaults to today on this device. */
  today?: string;
  /** Receives the file to save; returns false when the browser cannot make one. */
  onSave?: (file: SavedFile) => boolean;
  /** Writes text to the clipboard. Defaults to the browser's; returns false when it cannot. */
  copy?: (text: string) => Promise<boolean>;
}

const browserCopy = async (text: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * A short list of places to look at in person, and a sheet to fill in while looking. Closed by
 * default and adds no heading. The list is chosen from the seed, so it can be drawn again; nothing
 * the person writes on the sheet is read, kept or sent by the App.
 */
export function PackSpotCheck({ places, locale, today, onSave = (file) => saveTextFile(file), copy = browserCopy }: Props) {
  const panelId = useId();
  const day = today ?? localToday();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<number>(DEFAULT_SAMPLE_SIZE);
  const [seedText, setSeedText] = useState("");
  const [balanced, setBalanced] = useState(true);
  const [draws, setDraws] = useState(0);
  const [status, setStatus] = useState("");

  const baseSeed = cleanSeed(seedText, day);
  const seed = draws === 0 ? baseSeed : `${baseSeed.slice(0, MAX_SEED_CHARS - 6)}#${draws + 1}`;
  const sample = useMemo(() => (open ? sampleForSpotCheck(places, { size, seed, balanced }) : null), [open, places, size, seed, balanced]);
  const sheet = useMemo(() => (sample ? buildSpotSheet(sample, seed, balanced, locale, day) : null), [sample, seed, balanced, locale, day]);

  const save = (file: SavedFile) => {
    let ok = false;
    try {
      ok = onSave(file);
    } catch {
      ok = false;
    }
    setStatus(ok ? t(locale, `Saved ${file.name}.`, `Fichier ${file.name} enregistré.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };
  const names = SPOT_FILENAMES[locale];

  return (
    <div data-spot-check lang={locale}>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide the spot-check sheet", "Masquer la feuille d’observation sur place") : t(locale, "Make a spot-check sheet to fill in while you look", "Préparer une feuille d’observation à remplir sur place")}
      </Button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <>
            <p>{t(locale, "This picks a few of the places on screen for you to look at in person, and makes a sheet to compare what the pack reports with what you see. The same places and seed always give the same list.", "Cet outil choisit quelques lieux affichés à aller voir sur place et prépare une feuille pour comparer ce que rapporte le jeu de lieux avec ce que vous constatez. Les mêmes lieux et la même valeur de départ donnent toujours la même liste.")}</p>
            <ChoiceGroup
              label={t(locale, "How many places", "Nombre de lieux")}
              value={String(size)}
              onChange={(v) => setSize(parseSampleSize(v))}
              options={SAMPLE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            />
            <TextInput
              label={t(locale, "Seed", "Valeur de départ")}
              description={t(locale, `Any short text. Left blank, it is today’s date (${day}).`, `N’importe quel court texte. Laissée vide, c’est la date du jour (${day}).`)}
              value={seedText}
              onChange={(v) => {
                setSeedText(v.slice(0, MAX_SEED_CHARS));
                setDraws(0);
              }}
            />
            <CheckField
              label={t(locale, "Take places in turn from each wheelchair tag", "Prendre des lieux à tour de rôle selon chaque étiquette de fauteuil roulant")}
              description={t(locale, "So a rare tag is not crowded out. Turn off for a plain random draw.", "Pour qu’une étiquette rare ne soit pas écartée. Désactivez pour un tirage au hasard simple.")}
              isSelected={balanced}
              onChange={setBalanced}
            />
            <Button variant="secondary" onPress={() => setDraws((n) => n + 1)}>
              {t(locale, "Draw a different list", "Tirer une autre liste")}
            </Button>
            {sample && sheet ? (
              <div data-spot-result>
                <p role="status">{spotSampleLine(sample.picks.length, sample.wanted, sample.available, locale)}</p>
                {sample.picks.length > 0 ? (
                  <>
                    <p>{tallyLine(sample.byTag, locale)}</p>
                    <ol>
                      {sample.picks.map((pick) => (
                        <li key={pick.place.id}>
                          {pick.place.name ?? "UNKNOWN"} ({tagWord(pick.tag, locale)})
                        </li>
                      ))}
                    </ol>
                    <div className="stack" role="group" aria-label={t(locale, "Save the sheet", "Enregistrer la feuille")}>
                      <Button variant="secondary" onPress={() => save({ name: names.html, mime: "text/html;charset=utf-8", content: spotSheetToHtml(sheet) })}>
                        {t(locale, "Save the sheet to print (web page)", "Enregistrer la feuille à imprimer (page web)")}
                      </Button>
                      <Button variant="secondary" onPress={() => save({ name: names.text, mime: "text/plain;charset=utf-8", content: spotSheetToText(sheet) })}>
                        {t(locale, "Save the sheet (text)", "Enregistrer la feuille (texte)")}
                      </Button>
                      <Button variant="secondary" onPress={() => save({ name: names.csv, mime: "text/csv;charset=utf-8", content: spotSheetToCsv(sheet, { bom: true }) })}>
                        {t(locale, "Save the sheet (CSV)", "Enregistrer la feuille (CSV)")}
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            <SpotResults locale={locale} today={day} copy={copy} onSave={onSave} />
            <p aria-live="polite" data-spot-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
