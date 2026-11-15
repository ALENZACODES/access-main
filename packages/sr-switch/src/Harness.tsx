import { useCallback, useEffect, useRef, useState } from "react";
import en from "./catalogs/en.json";
import fr from "./catalogs/fr.json";
import { records } from "./fixtures/records.ts";
import { advance, select, type Target } from "./scanner/state.ts";

type Language = "en" | "fr";
type Catalog = typeof en;
type Key = keyof Catalog;
const catalogs: Record<Language, Catalog> = { en, fr };

const pageTargets = ["language-en", "language-fr", "request-label", "submit-request", "view-summary", "view-details", "open-dialog"];
const modalTargets = ["cancel-dialog", "confirm-dialog"];

export function Harness() {
  const [lang, setLang] = useState<Language>("en");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<Key | null>(null);
  const [view, setView] = useState<"summary" | "details">("summary");
  const [open, setOpen] = useState(false);
  const [scanIndex, setScanIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const t = catalogs[lang];
  const ids = open ? modalTargets : pageTargets;
  const targets: Target[] = ids.map((id) => ({ id, enabled: true }));
  const activeId = select({ index: scanIndex }, targets);
  const activeElement = activeId ? document.getElementById(activeId) : null;
  const targetName = activeElement instanceof HTMLInputElement
    ? activeElement.labels?.[0]?.textContent?.trim() || t.none
    : activeElement?.getAttribute("aria-label") || activeElement?.textContent?.trim() || t.none;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.appTitle;
  }, [lang, t.appTitle]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.getElementById("cancel-dialog")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      openerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    document.querySelectorAll("[data-current-scan]").forEach((element) => element.removeAttribute("data-current-scan"));
    if (!activeId) return;
    const element = document.getElementById(activeId);
    element?.setAttribute("data-current-scan", "true");
    element?.scrollIntoView({ block: "nearest" });
  }, [activeId, open]);

  const next = useCallback(() => {
    setScanIndex((index) => advance({ index }, targets).index);
  }, [targets]);
  const activate = useCallback(() => {
    const id = select({ index: scanIndex }, targets);
    if (!id) return;
    const element = document.getElementById(id);
    if (element instanceof HTMLInputElement && element.type === "text") element.focus();
    else element?.click();
  }, [scanIndex, targets]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const element = event.target;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        next();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        activate();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [next, activate]);

  function closeDialog(confirmed: boolean) {
    setNotice(confirmed ? "confirmed" : "cancelled");
    setOpen(false);
    setScanIndex(0);
  }

  function scanControls() {
    return (
      <div className="scan-controls">
        <button type="button" onClick={next}>{t.next}</button>
        <button type="button" onClick={activate}>{t.select}</button>
        <p role="status" aria-live="polite">{t.scanTarget}{t.labelSeparator}<strong data-testid="scan-name">{targetName}</strong></p>
      </div>
    );
  }

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>
      <header>
        <h1>{t.appTitle}</h1>
        <fieldset className="language-picker" role="radiogroup">
          <legend>{t.language}</legend>
          <label htmlFor="language-en"><input data-scan id="language-en" type="radio" name="language" value="en" checked={lang === "en"} onChange={() => { setLang("en"); setScanIndex(0); }} />{t.english}</label>
          <label htmlFor="language-fr"><input data-scan id="language-fr" type="radio" name="language" value="fr" checked={lang === "fr"} onChange={() => { setLang("fr"); setScanIndex(0); }} />{t.french}</label>
        </fieldset>
      </header>
      <main id="main" tabIndex={-1}>
        <p>{t.intro}</p>
        <section aria-labelledby="form-title">
          <h2 id="form-title">{t.formHeading}</h2>
          <form noValidate onSubmit={(event) => {
            event.preventDefault();
            if (!value.trim()) { setError(true); setNotice(null); document.getElementById("request-label")?.focus(); }
            else { setError(false); setNotice("submitted"); }
          }}>
            <label htmlFor="request-label">{t.name}</label>
            <p id="request-hint">{t.nameHint}</p>
            <input data-scan id="request-label" type="text" value={value} onChange={(event) => { setValue(event.target.value); if (event.target.value.trim()) setError(false); }} aria-describedby={`request-hint${error ? " request-error" : ""}`} aria-invalid={error} />
            <p id="request-error" className="error" aria-live="assertive" aria-atomic="true">{error ? t.nameRequired : ""}</p>
            <button data-scan id="submit-request" type="submit">{t.submit}</button>
          </form>
        </section>
        <section aria-labelledby="records-title">
          <h2 id="records-title">{t.recordsHeading}</h2>
          <p>{t.recordsDescription}</p>
          <ul className="records">
            {records.map((record) => (
              <li key={record.id}>
                <h3>{t[record.id]}</h3>
                <dl>
                  <div><dt>{t.source}</dt><dd>{record.source ? t[record.source as "demoSource"] : t.unknown}</dd></div>
                  <div><dt>{t.licence}</dt><dd>{record.licence ? t[record.licence as "demoLicence"] : t.unknown}</dd></div>
                  <div><dt>{t.date}</dt><dd>{record.date ?? t.unknown}</dd></div>
                  <div><dt>{t.tier}</dt><dd>{record.tier === null ? t.unknown : `${record.tier} · ${record.prototypeLabel ?? t.unknown}`}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="options-title">
          <h2 id="options-title">{t.optionsHeading}</h2>
          <fieldset role="radiogroup">
            <legend>{t.optionLegend}</legend>
            <label htmlFor="view-summary"><input data-scan id="view-summary" type="radio" name="view" checked={view === "summary"} onChange={() => setView("summary")} />{t.optionOne}</label>
            <label htmlFor="view-details"><input data-scan id="view-details" type="radio" name="view" checked={view === "details"} onChange={() => setView("details")} />{t.optionTwo}</label>
          </fieldset>
          <p aria-live="polite">{view === "summary" ? t.optionOneContent : t.optionTwoContent}</p>
        </section>
        <section aria-labelledby="scanner-title">
          <h2 id="scanner-title">{t.scannerHeading}</h2>
          <p>{t.scannerHelp}</p>
          {scanControls()}
        </section>
        <button data-scan id="open-dialog" type="button" ref={openerRef} onClick={() => { setScanIndex(0); setOpen(true); }}>{t.openDialog}</button>
        <p role="status" aria-live="polite">{notice ? t[notice] : ""}</p>
      </main>
      <dialog ref={dialogRef} aria-labelledby="dialog-title" aria-describedby="dialog-description" onCancel={(event) => { event.preventDefault(); closeDialog(false); }}>
        <h2 id="dialog-title">{t.dialogHeading}</h2>
        <p id="dialog-description">{t.dialogDescription}</p>
        <div className="dialog-actions">
          <button data-scan id="cancel-dialog" type="button" onClick={() => closeDialog(false)}>{t.cancel}</button>
          <button data-scan id="confirm-dialog" type="button" onClick={() => closeDialog(true)}>{t.confirm}</button>
        </div>
        {scanControls()}
      </dialog>
    </>
  );
}
