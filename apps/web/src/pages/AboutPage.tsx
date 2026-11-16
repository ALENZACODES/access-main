import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BUILD_ID, CONTRACT_VERSION } from "../buildInfo.ts";
import { summarizeStorage, type StorageSummary } from "../storage/repository.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { renderOnDeviceNoticeHtml } from "../privacy/onDeviceNotice/index.ts";

export function AboutPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
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
        <p>
          <Link className="text-link" to="/build-card">{t("buildCard.link")}</Link>
        </p>
      </section>
      <p>{t("about.frenchNote")}</p>
      <p>{t("about.audit")}</p>

      <div
        dangerouslySetInnerHTML={{
          __html: renderOnDeviceNoticeHtml({
            locale,
            items: [
              { id: "profile", label: { en: "Profile", fr: "Profil" }, where: "on-device" },
              { id: "cache", label: { en: "Cached records", fr: "Enregistrements en cache" }, where: "on-device" },
              { id: "outbox", label: { en: "Contribution export drafts", fr: "Brouillons d’export de contribution" }, where: "on-device" },
            ],
            reviewedOn: "2026-11-15",
          }),
        }}
      />
      <p>{t("about.notices")}</p>
    </div>
  );
}
