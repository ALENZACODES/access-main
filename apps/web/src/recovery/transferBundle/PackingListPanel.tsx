import { useId, useRef, useState } from "react";
import { saveTextFile } from "../../states/downloadFile";
import type { BundleLocale } from "./copy";
import type { BundleMember } from "./model";
import { comparePackingList, encodePackingList, readPackingList, type PackingComparison } from "./packingList";

const en = {
  save: "Save packing list",
  saved: "Packing list prepared for download.",
  failed: "The browser could not save the packing list.",
  purpose: "Save a separate list to check the files and their order at delivery. It includes fingerprints that can identify matching files.",
  choose: "Choose a packing list",
  hint: "Choose the separate JSON list saved by the sender.",
  working: "Checking the packing list…",
  size: "Choose a non-empty packing list no larger than 16 KiB.",
  format: "Choose a valid recovery packing list.",
  read: "The browser could not read this list. Select the file again.",
  duplicate: "This list contains the same fingerprint twice.",
  complete: "All files match the packing list in the expected order.",
  different: "The received bundle differs from the packing list.",
  source: "Packing list position",
  destination: "Bundle position",
  missing: "Missing from the bundle",
  extra: "Absent from the packing list",
  reordered: "Relative order changed",
  kind: "File type differs",
  byteLength: "File size differs",
  recordCount: "Record count differs",
  matches: "Matching file fingerprints",
  identical: "File details match",
};

const fr: typeof en = {
  save: "Enregistrer la liste de fichiers",
  saved: "La liste de fichiers est prête à télécharger.",
  failed: "Le navigateur n’a pas pu enregistrer la liste de fichiers.",
  purpose: "Enregistrez une liste séparée pour vérifier les fichiers et leur ordre à la réception. Les empreintes de la liste permettent de reconnaître les fichiers identiques.",
  choose: "Choisir une liste de fichiers",
  hint: "Choisissez la liste JSON enregistrée séparément par la personne qui a préparé le lot.",
  working: "Vérification de la liste de fichiers…",
  size: "Choisissez une liste de fichiers non vide de 16 Kio ou moins.",
  format: "Choisissez une liste de fichiers de récupération valide.",
  read: "Le navigateur n’a pas pu lire cette liste. Sélectionnez de nouveau le fichier.",
  duplicate: "Cette liste contient deux fois la même empreinte.",
  complete: "Tous les fichiers correspondent à la liste et suivent l’ordre prévu.",
  different: "Le lot reçu diffère de la liste de fichiers.",
  source: "Position dans la liste",
  destination: "Position dans le lot",
  missing: "Fichier manquant dans le lot",
  extra: "Fichier absent de la liste",
  reordered: "Ordre relatif modifié",
  kind: "Type de fichier différent",
  byteLength: "Taille de fichier différente",
  recordCount: "Nombre d’entrées différent",
  matches: "Empreintes de fichier correspondantes",
  identical: "Les détails du fichier concordent",
};

interface Props {
  members: readonly BundleMember[];
  locale: BundleLocale;
}

export function PackingListExport({ members, locale }: Props) {
  const copy = locale === "fr" ? fr : en;
  const [message, setMessage] = useState<"saved" | "failed" | null>(null);
  const hint = useId();
  function save() {
    try {
      const prepared = saveTextFile({
        name: "recovery-packing-list.json",
        mime: "application/json",
        content: encodePackingList(members),
      });
      setMessage(prepared ? "saved" : "failed");
    } catch {
      setMessage("failed");
    }
  }
  return <div>
    <p id={hint}>{copy.purpose}</p>
    <button type="button" aria-describedby={hint} disabled={members.length === 0}
      onClick={save}>{copy.save}</button>
    <p role="status">{message && copy[message]}</p>
  </div>;
}

function ComparisonDetails({ report, copy }: { report: PackingComparison; copy: typeof en }) {
  return <div>
    {(report.missing.length > 0 || report.extra.length > 0) && <ul>
      {report.missing.map(n => <li key={"m" + n}>{copy.source} {n} — {copy.missing}</li>)}
      {report.extra.map(n => <li key={"e" + n}>{copy.destination} {n} — {copy.extra}</li>)}
    </ul>}
    {report.matched.length > 0 && <details>
      <summary>{copy.matches} ({report.matched.length})</summary>
      <ul>{report.matched.map(row => <li key={row.expectedSlot}>
        {copy.source} {row.expectedSlot} → {copy.destination} {row.receivedSlot}
        <ul>
          <li>{row.metadataChanges.length
            ? row.metadataChanges.map(field => copy[field]).join(", ")
            : copy.identical}</li>
          {row.reordered && <li>{copy.reordered}</li>}
        </ul>
      </li>)}</ul>
    </details>}
  </div>;
}

type CheckState =
  | { stage: "idle" | "working" }
  | { stage: "error"; issue: "size" | "format" | "read" | "duplicate" }
  | { stage: "ready"; report: PackingComparison };

function Check({ members, locale }: Props) {
  const copy = locale === "fr" ? fr : en;
  const id = useId();
  const ticket = useRef(0);
  const [state, setState] = useState<CheckState>({ stage: "idle" });
  async function check(file?: Blob) {
    const run = ++ticket.current;
    if (!file) {
      setState({ stage: "idle" });
      return;
    }
    setState({ stage: "working" });
    const result = await readPackingList(file);
    if (run !== ticket.current) return;
    setState(result.ok
      ? { stage: "ready", report: comparePackingList(result.entries, members) }
      : { stage: "error", issue: result.issue });
  }
  return <div>
    <label htmlFor={id}>{copy.choose}</label>
    <p id={id + "-hint"}>{copy.hint}</p>
    <input id={id} type="file" accept=".json,application/json"
      aria-describedby={id + "-hint " + id + "-state"}
      aria-invalid={state.stage === "error"}
      onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        void check(file);
      }} />
    <p id={id + "-state"} role="status">
      {state.stage === "working" && copy.working}
      {state.stage === "error" && copy[state.issue]}
      {state.stage === "ready" && (state.report.complete ? copy.complete : copy.different)}
    </p>
    {state.stage === "ready" && <ComparisonDetails report={state.report} copy={copy} />}
  </div>;
}

export function PackingListCheck(props: Props) {
  if (props.members.length === 0) return null;
  return <Check key={props.members.map(row => row.digest).join("/")} {...props} />;
}
