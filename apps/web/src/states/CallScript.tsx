import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup, TextInput } from "../design/fields.tsx";
import { DEFAULT_SCRIPT_OPTIONS, buildCallScript, type CallScript as Script, type ScriptLine, type ScriptOptions } from "./callScript.ts";
import {
  callScriptAddressLabel, callScriptCannotSave, callScriptFilterHint, callScriptFilterLabel, callScriptHeading, callScriptIntro, callScriptMoreLine, callScriptNoMatch, callScriptNoPlaces, callScriptNoSpeech,
  callScriptPickLabel, callScriptQuestionsLabel, callScriptReadAloud, callScriptSaveHtml, callScriptSaveText, callScriptSavedLine, callScriptSpeedLabel, callScriptSpeedOptions, callScriptSpellLabel, callScriptStopReading, callScriptToggle,
  scriptCopy,
} from "./callScriptCopy.ts";
import { scriptHtmlFile, scriptTextFile } from "./callScriptExport.ts";
import { pickLabel, pickPlaces } from "./callScriptPick.ts";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import { canSpeak, isSpeechRate, makeReader, type MakeUtterance, type SpeechLike, type SpeechRate, type UtteranceLike } from "./speak.ts";
import type { Locale } from "./stateCopy.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** The device's day, YYYY-MM-DD. */
  today: string;
  onSave?: (file: SavedFile) => boolean;
  /** The browser's speech, or null for none. Left out, the browser's own is used when it has one. */
  speech?: SpeechLike | null;
  makeUtterance?: MakeUtterance;
}

function browserSpeech(): SpeechLike | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? (window.speechSynthesis as unknown as SpeechLike) : null;
}

const browserUtterance: MakeUtterance = (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike;

function Line({ line, locale }: { line: ScriptLine; locale: Locale }) {
  return (
    <>
      {line.kind === "field" ? <strong>{line.text}</strong> : line.text}
      {line.basis ? (
        <>
          <br />
          <small>
            {scriptCopy.basisLabel(locale)} {line.basis}
          </small>
        </>
      ) : null}
    </>
  );
}

function ScriptView({ script, locale }: { script: Script; locale: Locale }) {
  return (
    <div className="stack" data-call-script-text>
      <p>
        <strong>{script.title}</strong>
      </p>
      {script.sections.map((s) =>
        s.id === "questions" ? (
          <div key={s.id} className="stack">
            <p>
              <strong>{s.heading}</strong>
            </p>
            {s.lines.length === 0 ? (
              <p>{scriptCopy.noQuestions(locale)}</p>
            ) : (
              <ol>
                {s.lines.map((l, i) => (
                  <li key={i}>
                    <Line line={l} locale={locale} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <div key={s.id} className="stack">
            <p>
              <strong>{s.heading}</strong>
            </p>
            {s.lines.map((l, i) => (
              <p key={i}>
                <Line line={l} locale={locale} />
              </p>
            ))}
          </div>
        ),
      )}
      <p>
        <small>{script.footer}</small>
      </p>
    </div>
  );
}

/**
 * A script for phoning one place, built from what the pack holds about it. Closed until asked for.
 * Nothing is dialled or sent; a file is made on this device from the script on screen, and the
 * browser's own voice can read it out.
 */
export function CallScript({ places, locale, today, onSave = saveTextFile, speech, makeUtterance = browserUtterance }: Props) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [options, setOptions] = useState<ScriptOptions>(DEFAULT_SCRIPT_OPTIONS);
  const [rate, setRate] = useState<SpeechRate>("normal");
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState("");

  const voice = speech === undefined ? browserSpeech() : speech;
  const speechOk = canSpeak(voice);
  const reader = useMemo(() => makeReader(voice, makeUtterance), [voice, makeUtterance]);
  const readerRef = useRef(reader);
  readerRef.current = reader;
  useEffect(() => () => readerRef.current.stop(), []);

  const found = useMemo(() => pickPlaces(places, query), [places, query]);
  const picked = places.find((p) => p.id === pickedId && p.name !== null) ?? null;
  const script = useMemo(() => (picked ? buildCallScript(picked, locale, today, options) : null), [picked, locale, today, options]);

  const named = places.some((p) => p.name !== null);
  if (!named) return null;

  const stopReading = () => {
    reader.stop();
    setReading(false);
  };
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    stopReading();
    set(v);
  };
  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? callScriptSavedLine(file.name, locale) : callScriptCannotSave(locale));
  };
  const toggleRead = () => {
    if (!script) return;
    if (reading) {
      stopReading();
      return;
    }
    setReading(reader.start(script.spoken, locale, rate, () => setReading(false)));
  };

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-call-script>
      <p id={headingId}>
        <strong>{callScriptHeading(locale)}</strong>
      </p>
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onPress={() => {
          if (open) stopReading();
          setOpen((o) => !o);
        }}
      >
        {callScriptToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open} className="stack" data-call-script-body>
        {open ? (
          <>
            <p>{callScriptIntro(locale)}</p>
            <TextInput label={callScriptFilterLabel(locale)} description={callScriptFilterHint(locale)} value={query} onChange={change(setQuery)} />
            {found.total === 0 ? (
              <p>{places.length === 0 ? callScriptNoPlaces(locale) : callScriptNoMatch(locale)}</p>
            ) : (
              <ChoiceGroup
                label={callScriptPickLabel(locale)}
                value={found.shown.some((p) => p.id === pickedId) ? pickedId : ""}
                onChange={change(setPickedId)}
                options={found.shown.map((p) => ({ value: p.id, label: pickLabel(p, found.shown) }))}
              />
            )}
            {found.hidden > 0 ? <p>{callScriptMoreLine(found.hidden, locale)}</p> : null}
            {picked && script ? (
              <>
                <CheckField label={callScriptSpellLabel(locale)} isSelected={options.spellName} onChange={change((v: boolean) => setOptions((o) => ({ ...o, spellName: v })))} />
                <CheckField label={callScriptAddressLabel(locale)} isSelected={options.readAddress} onChange={change((v: boolean) => setOptions((o) => ({ ...o, readAddress: v })))} />
                <CheckField label={callScriptQuestionsLabel(locale)} isSelected={options.includeQuestions} onChange={change((v: boolean) => setOptions((o) => ({ ...o, includeQuestions: v })))} />
                <ScriptView script={script} locale={locale} />
                <div className="row">
                  <Button variant="secondary" onPress={() => save(scriptTextFile(script, locale))}>
                    {callScriptSaveText(locale)}
                  </Button>
                  <Button variant="secondary" onPress={() => save(scriptHtmlFile(script, locale))}>
                    {callScriptSaveHtml(locale)}
                  </Button>
                </div>
                {speechOk ? (
                  <>
                    <ChoiceGroup
                      label={callScriptSpeedLabel(locale)}
                      value={rate}
                      onChange={(v) => {
                        if (isSpeechRate(v)) change(setRate)(v);
                      }}
                      options={callScriptSpeedOptions(locale).map((o) => ({ value: o.id, label: o.label }))}
                    />
                    <Button variant="secondary" aria-pressed={reading} onPress={toggleRead}>
                      {reading ? callScriptStopReading(locale) : callScriptReadAloud(locale)}
                    </Button>
                  </>
                ) : (
                  <p>{callScriptNoSpeech(locale)}</p>
                )}
              </>
            ) : null}
            <p aria-live="polite">{status}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
