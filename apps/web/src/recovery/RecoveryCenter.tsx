import type { ReactElement } from "react";
import type { RegionStatus } from "../../../../packages/data-client/src/index.ts";
import { RecoveryWorkbench } from "./RecoveryWorkbench.tsx";
import { RecoveryQueuePanel } from "./RecoveryQueuePanel.tsx";
import { RECOVERY_COPY } from "./recoveryActions.ts";

/** Renders live region status without guessing integrity or starting background transfers. */
export interface RecoveryCenterProps {
  readonly locale: "en" | "fr";
  readonly regions: readonly RegionStatus[];
  readonly busy: boolean;
  readonly onRecheck: (regionId: string) => void;
  readonly onDownload: (regionId: string) => void;
}

export function RecoveryCenter({ locale, regions, busy, onRecheck, onDownload }: RecoveryCenterProps): ReactElement {
  return <section className="stack" lang={locale} aria-label={RECOVERY_COPY[locale].title}>
    <h2>{RECOVERY_COPY[locale].title}</h2>
    <RecoveryWorkbench locale={locale} regions={regions} busy={busy} onRecheck={onRecheck} />
    <RecoveryQueuePanel locale={locale} regions={regions} busy={busy} onDownload={onDownload} />
  </section>;
}
