import { useEffect, useId, useRef, useState } from "react";
import type { Language } from "./robust/regionDownload";

type Tool = "questions" | "brief" | "snapshots" | "dependencies";
type Mount = (host: HTMLElement, language: Language) => () => void;

const tools: Record<Tool, () => Promise<Mount>> = {
  async questions() {
    const { mountOfflineQuestionSheet } = await import("./robust/offlineQuestionSheetPanel");
    return (host, language) => mountOfflineQuestionSheet(host, null, null, language);
  },
  async brief() {
    const { mountOfflineCoordinationBrief } = await import("./robust/coordinationBriefPanel");
    return (host, language) => mountOfflineCoordinationBrief(host, null, language);
  },
  async dependencies() {
    const { mountOfflineDependencyPlanner } = await import("./robust/dependencyPlannerPanel");
    return (host, language) => mountOfflineDependencyPlanner(host, null, null, language);
  },
  async snapshots() {
    const { mountSnapshotComparison } = await import("./robust/snapshotComparisonPanel");
    return (host, language) => mountSnapshotComparison(host, null, null, language);
  },
};

const copy = {
  en: {
    title: "Planning without a region pack",
    error: "This tool could not open. Select it again to retry.",
    questions: ["Open question sheet", "Close question sheet"],
    brief: ["Open coordination brief", "Close coordination brief"],
    dependencies: ["Open dependency planner", "Close dependency planner"],
    snapshots: ["Open snapshot comparison", "Close snapshot comparison"],
  },
  fr: {
    title: "Planification sans pack régional",
    error: "L’outil n’a pas pu s’ouvrir. Sélectionnez-le de nouveau pour réessayer.",
    questions: ["Ouvrir la fiche de questions", "Fermer la fiche de questions"],
    brief: ["Ouvrir la fiche de coordination", "Fermer la fiche de coordination"],
    dependencies: ["Ouvrir le planificateur de dépendances", "Fermer le planificateur de dépendances"],
    snapshots: ["Ouvrir la comparaison des instantanés", "Fermer la comparaison des instantanés"],
  },
} as const;

function PersonalTool({ tool, language }: { tool: Tool; language: Language }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const host = ref.current;
    if (!host || !open) return;
    let active = true;
    let unmount: (() => void) | undefined;
    void tools[tool]().then((mount) => {
      if (active) unmount = mount(host, language);
    }).catch(() => {
      if (!active) return;
      host.replaceChildren();
      setFailed(true);
      setOpen(false);
    });
    return () => {
      active = false;
      unmount?.();
    };
  }, [tool, language, open]);
  const c = copy[language];
  return <div className="stack">
    <button type="button" aria-expanded={open} aria-controls={id} style={{ minHeight: 44, minWidth: 44 }}
      onClick={() => { setFailed(false); setOpen(!open); }}>{c[tool][open ? 1 : 0]}</button>
    {failed && <p role="status">{c.error}</p>}
    <div id={id} ref={ref} hidden={!open} />
  </div>;
}

export function PersonalOfflineTools({ language }: { language: Language }) {
  const id = useId();
  return <section className="panel stack" aria-labelledby={id}>
    <h2 id={id}>{copy[language].title}</h2>
    <PersonalTool tool="questions" language={language} />
    <PersonalTool tool="brief" language={language} />
    <PersonalTool tool="snapshots" language={language} />
    <PersonalTool tool="dependencies" language={language} />
  </section>;
}
