import {
  DEMO_CITATIONS, DEMO_CONSENT_LEDGER, DEMO_DELIVERIES, DEMO_INPUT_SETS, DEMO_PURPOSE, DEMO_REGIONS, DEMO_REPORTS,
  DEMO_REPORT_AS_OF, DEMO_REVIEWS,
} from "@hub/advocacy-demo";
import { ReportsPanel, type HubPackFile } from "@hub/advocacy-reports";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { consentStatus } from "../features/consent.ts";
import { PackageView } from "./PackageView";

const INPUT = { reports: DEMO_REPORTS, inputSets: DEMO_INPUT_SETS, regions: DEMO_REGIONS, consentLedger: DEMO_CONSENT_LEDGER };
const OPTIONS = { asOf: DEMO_REPORT_AS_OF, requiredPurpose: DEMO_PURPOSE };
const LOGS = { deliveries: DEMO_DELIVERIES, citations: DEMO_CITATIONS, reviews: DEMO_REVIEWS };

function saveFiles(files: HubPackFile[]): void {
  for (const file of files) {
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * The report tables screen of this repository's advocacy package, over its labelled demonstration set.
 * Saving the files needs the same permission as the evidence pack in Settings. Without it nothing is saved.
 */
export default function ReportsPage() {
  const { t } = useTranslation("hub");
  const [blocked, setBlocked] = useState<"denied" | "unavailable" | null>(null);
  const onExportFiles = (files: HubPackFile[]) => {
    void consentStatus("advocacy-export").then((status) => {
      if (status === "granted") {
        setBlocked(null);
        saveFiles(files);
      } else {
        setBlocked(status);
      }
    });
  };
  return (
    <PackageView page="reports" component={ReportsPanel} props={{ input: INPUT, options: OPTIONS, logs: LOGS, onExportFiles }}>
      <p>{t("reportsNote")}</p>
      {blocked ? (
        <p role="alert">
          {t(blocked === "denied" ? "reportsExportBlocked" : "reportsExportUnavailable")}{" "}
          <Link to="/settings/consent" style={{ display: "inline-flex", minHeight: 44, alignItems: "center" }}>{t("reportsConsentLink")}</Link>
        </p>
      ) : null}
    </PackageView>
  );
}
