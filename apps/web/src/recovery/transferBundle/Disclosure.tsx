import { useEffect, useRef, useState } from "react";
import type { BundleLocale } from "./copy";
import type { RecoveryTransferBundlePanel } from "./Panel";

const control = { minHeight: 44, minWidth: 44, paddingBlock: 10, boxSizing: "border-box" } as const;
type Panel = typeof RecoveryTransferBundlePanel;
type State = { stage: "idle" | "loading" | "failed" } | { stage: "ready"; Pane: Panel };

export function RecoveryTransferBundleDisclosure({ locale }: { locale: BundleLocale }) {
  const [state, setState] = useState<State>({ stage: "idle" });
  const current = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    current.current = true;
    return () => { current.current = false; };
  }, []);
  async function load() {
    if (pending.current || state.stage === "ready") return;
    pending.current = true;
    setState({ stage: "loading" });
    try {
      const module = await import("./Panel");
      if (current.current) setState({ stage: "ready", Pane: module.RecoveryTransferBundlePanel });
    } catch {
      if (current.current) setState({ stage: "failed" });
    } finally {
      pending.current = false;
    }
  }
  return <details data-recovery-transfer="" onToggle={event => {
    if (event.currentTarget.open && state.stage === "idle") void load();
  }}>
    <summary style={control}>{locale === "fr" ? "Lot de transfert de récupération" : "Recovery transfer bundle"}</summary>
    {state.stage === "loading" && <p role="status">{locale === "fr" ? "Ouverture du lot…" : "Opening the bundle tool…"}</p>}
    {state.stage === "failed" && <div>
      <p role="status">{locale === "fr" ? "Impossible d’ouvrir l’outil de transfert." : "The transfer tool could not open."}</p>
      <button style={control} type="button" onClick={() => { void load(); }}>
        {locale === "fr" ? "Réessayer" : "Try again"}
      </button>
    </div>}
    {state.stage === "ready" && <state.Pane locale={locale} />}
  </details>;
}
