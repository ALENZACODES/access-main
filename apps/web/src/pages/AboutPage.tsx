import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BUILD_ID, CONTRACT_VERSION } from "../buildInfo.ts";
import { summarizeStorage, type StorageSummary } from "../storage/repository.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

export function AboutPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  useDocumentTitle(t("about.title"));

  useEffect(() => {
    void summarizeStorage().then(setSummary);
  }, []);

  return (
    <div className="stack">
      <h1>{t("about.title")}</h1>
      <p className="lead">{t("about.lead")}</p>
      <p>{t("noEndorsement")}</p>
      <p>{t("noMedical")}</p>
      <p>{t("noEligibility")}</p>
      <p>{t("about.local")}</p>
      <section className="panel" aria-labelledby="counts-title">
        <h2 id="counts-title">{t("about.countsTitle")}</h2>
        <p>{t("about.countsIntro")}</p>
        <p>{summary ? t("storage.cacheCount", { count: summary.cacheCount }) : t("home.checking")}</p>
        <p>{t("about.verified", { count: summary?.verifiedClaimCount ?? 0 })}</p>
        <p>{t("footer.build", { id: BUILD_ID })}</p>
        <p>{t("footer.contract", { version: CONTRACT_VERSION })}</p>
      </section>
      <p>{t("about.frenchNote")}</p>
      <p>{t("about.audit")}</p>
      <p>{t("about.notices")}</p>
    </div>
  );
}
