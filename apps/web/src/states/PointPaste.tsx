import { useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { TextInput } from "../design/fields.tsx";
import type { Point } from "./packGeo.ts";
import { pointEquivalents, pointPasteHelp, pointProblemText, pointReadText } from "./pointCopy.ts";
import { readPoint } from "./pointRead.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  locale: Locale;
  /** The point now in the latitude and longitude fields, if it is a good one. Shown in other forms. */
  current?: Point | null;
  /** Puts a point into the two fields, as text with five decimals. */
  onUse: (lat: string, lon: string) => void;
}

/**
 * One field to paste a point into, instead of typing two. It reads the text on this device, says
 * what it understood, and fills the latitude and longitude fields only when the person presses the
 * button. The pasted text is not kept after it is used and nothing is sent.
 */
export function PointPaste({ locale, current = null, onUse }: Props) {
  const [text, setText] = useState("");
  const [done, setDone] = useState("");
  const read = useMemo(() => readPoint(text), [text]);
  const forms = useMemo(() => (current ? pointEquivalents(current, locale) : []), [current, locale]);

  const change = (v: string) => {
    setText(v);
    setDone("");
  };
  const use = () => {
    if (read.status !== "ok") return;
    onUse(read.point.lat.toFixed(5), read.point.lon.toFixed(5));
    setText("");
    setDone(t(locale, "The latitude and longitude are filled in.", "La latitude et la longitude sont remplies."));
  };

  return (
    <div className="stack" lang={locale} data-point-paste>
      <TextInput label={t(locale, "Paste a point (optional)", "Coller un point (facultatif)")} description={pointPasteHelp(locale)} value={text} onChange={change} error={read.status === "invalid" ? pointProblemText(read.problem, locale) : undefined} />
      {read.status === "ok" ? (
        <>
          <p aria-live="polite" data-point-read>
            {pointReadText(read, locale)}
          </p>
          <Button variant="secondary" onPress={use}>
            {t(locale, "Use this point", "Utiliser ce point")}
          </Button>
        </>
      ) : (
        <p aria-live="polite" data-point-read>
          {done}
        </p>
      )}
      {forms.length > 0 ? (
        <>
          <p>{t(locale, "The point in the fields, written other ways:", "Le point des champs, écrit autrement\u00a0:")}</p>
          <ul data-point-forms>
            {forms.map((f) => (
              <li key={f.style}>{`${f.label}\u00a0: ${f.text}`}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
