import type { ReactElement } from "react";
import type { RegionStatus } from "../../../../packages/data-client/src/index.ts";
import { RECOVERY_COPY, recoveryItems } from "./recoveryActions.ts";

export interface RecoveryWorkbenchProps {
  readonly locale: "en" | "fr";
  readonly regions: readonly RegionStatus[];
  readonly busy: boolean;
  readonly onRecheck: (regionId: string) => void;
}

export function RecoveryWorkbench({ locale, regions, busy, onRecheck }: RecoveryWorkbenchProps): ReactElement {
  const copy = RECOVERY_COPY[locale];
  return <section className="panel stack" lang={locale} aria-label={copy.inventory}>
    <h3>{copy.inventory}</h3>
    <p>{copy.explanation}</p>
    <ul>{recoveryItems(regions, locale).map((item) => <li key={item.id}>
      <span>{item.label} — {item.state === "missing" ? copy.missing : item.state === "downloaded" ? copy.downloaded : copy.unknown}</span>{" "}
      <button type="button" disabled={busy} style={{ minHeight: 44, minWidth: 44 }} onClick={() => onRecheck(item.id)}>{copy.check}</button>
    </li>)}</ul>
  </section>;
}
