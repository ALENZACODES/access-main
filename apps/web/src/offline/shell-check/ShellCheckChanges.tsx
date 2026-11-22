import { useState } from "react";
import { panelCopy, type ShellLanguage } from "./panelCopy";
import type { ShellReport } from "./probe";

type FileObservation = ShellReport["files"][number];
type FileChange =
  | { type: "latest-only" | "earlier-only"; file: FileObservation }
  | { type: "changed"; earlier: FileObservation; latest: FileObservation };

function compareFiles(earlier: FileObservation[], latest: FileObservation[]): FileChange[] {
  const remaining = new Map(earlier.map((file) => [file.path, file]));
  const changes: FileChange[] = [];
  for (const file of latest) {
    const before = remaining.get(file.path);
    if (!before) {
      changes.push({ type: "latest-only", file });
    } else {
      remaining.delete(file.path);
      if (before.state !== file.state || before.kind !== file.kind) {
        changes.push({ type: "changed", earlier: before, latest: file });
      }
    }
  }
  for (const file of remaining.values()) {
    changes.push({ type: "earlier-only", file });
  }
  return changes;
}

const labels = {
  en: {
    summary: "Compare the two latest checks",
    worker: "Change in offline worker information",
    earlier: "Earlier check",
    latest: "Latest check",
    earlierPartial: "The earlier check listed only some startup files.",
    latestPartial: "The latest check listed only some startup files.",
    noFileChange: "Both lists contain the same paths, file types and cache results.",
    files: "Differences between the file lists",
    earlierOnly: "Listed only in the earlier check",
    latestOnly: "Listed only in the latest check",
    oneList: "For a path in only one list, the displayed cache result comes from that check. Its cache status for the other check is UNKNOWN.",
    earlierResult: "Earlier cache result",
    latestResult: "Latest cache result",
    earlierType: "Earlier file type",
    latestType: "Latest file type",
  },
  fr: {
    summary: "Comparer les deux derniers examens",
    worker: "Changement des renseignements sur le service hors ligne",
    earlier: "Examen précédent",
    latest: "Dernier examen",
    earlierPartial: "L’examen précédent a répertorié seulement une partie des fichiers de démarrage.",
    latestPartial: "Le dernier examen a répertorié seulement une partie des fichiers de démarrage.",
    noFileChange: "Les deux listes présentent les mêmes chemins, types de fichiers et résultats du cache.",
    files: "Différences entre les listes de fichiers",
    earlierOnly: "Présent seulement dans la liste précédente",
    latestOnly: "Présent seulement dans la dernière liste",
    oneList: "Pour un chemin présent dans une seule liste, le résultat affiché provient de cet examen. L’état de sa copie dans le cache pour l’autre examen est UNKNOWN.",
    earlierResult: "Résultat précédent du cache",
    latestResult: "Dernier résultat du cache",
    earlierType: "Type de fichier précédent",
    latestType: "Dernier type de fichier",
  },
};

function ChangeItem({ change, language }: { change: FileChange; language: ShellLanguage }) {
  const c = labels[language];
  const { groups, state } = panelCopy[language];
  const file = change.type === "changed" ? change.latest : change.file;
  return (
    <li>
      <bdi dir="ltr" style={{ overflowWrap: "anywhere" }}><code>{file.path}</code></bdi>
      {change.type === "changed" ? (
        <dl>
          {change.earlier.state !== change.latest.state && (
            <>
              <dt>{c.earlierResult}</dt><dd>{state[change.earlier.state]}</dd>
              <dt>{c.latestResult}</dt><dd>{state[change.latest.state]}</dd>
            </>
          )}
          {change.earlier.kind !== change.latest.kind && (
            <>
              <dt>{c.earlierType}</dt><dd>{groups[change.earlier.kind]}</dd>
              <dt>{c.latestType}</dt><dd>{groups[change.latest.kind]}</dd>
            </>
          )}
        </dl>
      ) : (
        <dl>
          <dt>{change.type === "earlier-only" ? c.earlierOnly : c.latestOnly}</dt>
          <dd>{groups[file.kind]} — {state[file.state]}</dd>
        </dl>
      )}
    </li>
  );
}

export default function ShellCheckChanges({ previous, current, language }: {
  previous: ShellReport;
  current: ShellReport;
  language: ShellLanguage;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = labels[language];
  const changes = expanded ? compareFiles(previous.files, current.files) : [];
  return (
    <details lang={language} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary style={{ minHeight: 44, minWidth: 44 }}>{c.summary}</summary>
      {expanded && (
        <div className="stack">
          {previous.limited && <p>{c.earlierPartial}</p>}
          {current.limited && <p>{c.latestPartial}</p>}
          {previous.worker !== current.worker && (
            <div>
              <h4>{c.worker}</h4>
              <dl>
                <dt>{c.earlier}</dt><dd>{panelCopy[language].worker[previous.worker]}</dd>
                <dt>{c.latest}</dt><dd>{panelCopy[language].worker[current.worker]}</dd>
              </dl>
            </div>
          )}
          {changes.length === 0 ? <p>{c.noFileChange}</p> : (
            <>
              {changes.some((change) => change.type !== "changed") && <p>{c.oneList}</p>}
              <ul aria-label={c.files}>
                {changes.map((change) => (
                  <ChangeItem key={change.type === "changed" ? change.latest.path : change.file.path}
                    change={change} language={language} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </details>
  );
}
