import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { defaultControl, defaultProject, updateControl, reviewProject, type Control, type Language } from "./model.ts";
import { COMMANDS, initialMachine, stepMachine, type Command } from "./engine.ts";
import { commandLabel, decisionLabel, workbenchCopy } from "./copy.ts";
const target = { minWidth: 44, minHeight: 44, padding: "9px 12px" } as const;
export function WorkbenchPage() {
  const { i18n } = useTranslation();
  const locale: Language = i18n.language.startsWith("fr") ? "fr" : "en";
  const copy = workbenchCopy(locale);
  const [project, setProject] = useState(defaultProject);
  const [machine, setMachine] = useState(initialMachine);
  const [english, setEnglish] = useState("");
  const [french, setFrench] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionFr, setDescriptionFr] = useState("");
  const [error, setError] = useState(false);
  const assessment = useMemo(() => reviewProject(project), [project]);
  function addControl() {
    if (!english.trim() || !french.trim() || !descriptionEn.trim() || !descriptionFr.trim()) {
      setError(true); return;
    }
    const control: Control = {
      ...defaultControl(`control-${project.controls.length + 1}`),
      name: { en: english.trim(), fr: french.trim() },
      description: { en: descriptionEn.trim(), fr: descriptionFr.trim() },
    };
    setProject(current => updateControl(current, control));
    setEnglish(""); setFrench(""); setDescriptionEn(""); setDescriptionFr(""); setError(false);
  }
  function run(command: Command) {
    setMachine(current => stepMachine(current, command, project).machine);
  }
  return <div className="stack">
    <h1>{copy.title}</h1><p>{copy.intro}</p><p>{copy.caveat}</p><p>{copy.local}</p>
    <section className="panel" aria-labelledby="workbench-editor">
      <h2 id="workbench-editor">{copy.project}</h2>
      <label htmlFor="workbench-en">{copy.nameEn}</label>
      <input id="workbench-en" style={target} value={english} onChange={event => setEnglish(event.target.value)} />
      <label htmlFor="workbench-fr">{copy.nameFr}</label>
      <input id="workbench-fr" style={target} value={french} onChange={event => setFrench(event.target.value)} />
      <label htmlFor="workbench-description-en">{copy.descriptionEn}</label>
      <textarea id="workbench-description-en" style={target} value={descriptionEn} onChange={event => setDescriptionEn(event.target.value)} />
      <label htmlFor="workbench-description-fr">{copy.descriptionFr}</label>
      <textarea id="workbench-description-fr" style={target} value={descriptionFr} onChange={event => setDescriptionFr(event.target.value)} />
      {error ? <p role="alert">{copy.validation}</p> : null}
      <button type="button" style={target} onClick={addControl}>{copy.add}</button>
    </section>
    <section className="panel" aria-labelledby="workbench-controls">
      <h2 id="workbench-controls">{copy.control} ({project.controls.length})</h2>
      {project.controls.length === 0 ? <p>{copy.empty}</p> : <ol>{project.controls.map(control => <li key={control.id}><strong>{control.name[locale]}</strong><p>{control.description[locale]}</p></li>)}</ol>}
    </section>
    <section className="panel" aria-labelledby="workbench-switch">
      <h2 id="workbench-switch">{copy.switchInput}</h2>
      <div role="group" aria-label={copy.switchInput}>{COMMANDS.map(command => <button key={command} type="button" style={target} onClick={() => run(command)}>{commandLabel(command, locale)}</button>)}</div>
      <p role="status" aria-live="polite">{copy.status} — {machine.phase}</p>
    </section>
    <section className="panel" aria-labelledby="workbench-report">
      <h2 id="workbench-report">{copy.report}</h2>
      <p role="status" aria-live="polite">{decisionLabel(assessment.decision, locale)}</p>
      <Link to="/" style={{ display: "inline-flex", minHeight: 44, alignItems: "center" }}>{copy.finish}</Link>
    </section>
  </div>;
}
