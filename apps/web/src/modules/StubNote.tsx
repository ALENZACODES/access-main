import { useTranslation } from "react-i18next";
import { laneBinding, type ModuleId } from "@access/shared";

/** Plain sentence for a route whose package is not loaded, with the package name in a disclosure. */
export function StubNote({ id, search = false }: { id: ModuleId; search?: boolean }) {
  const { t } = useTranslation();
  const binding = laneBinding(id);
  return (
    <div className="stack">
      <p id={`${id}-unavailable`}>{t("modules.unavailable")}</p>
      {search ? <p id={`${id}-search-unavailable`}>{t("modules.searchUnavailable")}</p> : null}
      <details className="lane-note">
        <summary>{t("modules.detailsSummary")}</summary>
        <p>{t("modules.detailsBody", { packageName: binding.packageName, repository: binding.repository })}</p>
      </details>
    </div>
  );
}
