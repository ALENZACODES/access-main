import type { ReactElement } from "react";
import type { RegionStatus } from "../../../../packages/data-client/src/index.ts";
import { RECOVERY_COPY, recoveryItems } from "./recoveryActions.ts";

export interface RecoveryQueuePanelProps {
  readonly locale: "en" | "fr";
  readonly regions: readonly RegionStatus[];
  readonly busy: boolean;
  readonly onDownload: (regionId: string) => void;
}

export function RecoveryQueuePanel({ locale, regions, busy, onDownload }: RecoveryQueuePanelProps): ReactElement {
  const copy = RECOVERY_COPY[locale];
  const missing = recoveryItems(regions, locale).filter((item) => item.state === "missing");
  return <section className="panel stack" lang={locale} aria-label={copy.queue}>
    <h3>{copy.queue}</h3>
    {missing.length === 0 ? <p>{copy.empty}</p> : <ul>{missing.map((item) => <li key={item.id}>
      <span>{item.label} — {copy.missing}</span>{" "}
      <button type="button" disabled={busy} style={{ minHeight: 44, minWidth: 44 }} onClick={() => onDownload(item.id)}>{copy.download}</button>
    </li>)}</ul>}
  </section>;
}
