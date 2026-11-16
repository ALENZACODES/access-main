import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BUILD_ID, CONTRACT_VERSION } from "../buildInfo.ts";
import { summarizeStorage, type StorageSummary } from "../storage/repository.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import {
  adaptElement,
  browserDownload,
  createPrivacyController,
  mountPrivacyPanel,
  safeLocalStorage,
  type InventoryEntry,
} from "../privacy/panel/index.ts";

const PRIVACY_STORAGE_PREFIX = "access.";

const ABOUT_INVENTORY: readonly InventoryEntry[] = [
  {
    id: "profile",
    label: { en: "Profile", fr: "Profil" },
    where: "on-device",
    purpose: { en: "Remember settings on this device", fr: "Conserver les réglages sur cet appareil" },
    keptFor: { en: "Until you erase them", fr: "Jusqu’à ce que vous les effaciez" },
    source: { en: "Written for the App by the project team", fr: "Rédigé pour l’App par l’équipe du projet" },
    recordedOn: "2026-11-15",
  },
  {
    id: "cache",
    label: { en: "Cached records", fr: "Enregistrements en cache" },
    where: "on-device",
    purpose: { en: "Read records again without another download", fr: "Relire les enregistrements sans nouveau téléchargement" },
    keptFor: { en: "Until you erase them", fr: "Jusqu’à ce que vous les effaciez" },
    source: { en: "Written for the App by the project team", fr: "Rédigé pour l’App par l’équipe du projet" },
    recordedOn: "2026-11-15",
  },
  {
    id: "outbox",
    label: { en: "Contribution export drafts", fr: "Brouillons d’export de contribution" },
    where: "on-device",
    purpose: { en: "Keep a file you can export yourself", fr: "Conserver un fichier que vous pouvez exporter vous-même" },
    keptFor: { en: "Until you erase them", fr: "Jusqu’à ce que vous les effaciez" },
    source: { en: "Written for the App by the project team", fr: "Rédigé pour l’App par l’équipe du projet" },
    recordedOn: "2026-11-15",
  },
];


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

      <PrivacyPanelHost locale={locale} />
      <p>{t("about.notices")}</p>
    </div>
  );
}

function PrivacyPanelHost({ locale }: { locale: "en" | "fr" }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = createPrivacyController({
      storage: safeLocalStorage(),
      prefix: PRIVACY_STORAGE_PREFIX,
      inventory: ABOUT_INVENTORY,
      now: () => new Date(),
      reviewedOn: "2026-11-15",
      languages: [locale],
    });
    const mounted = mountPrivacyPanel(adaptElement(host), controller, { onExport: browserDownload });
    return () => {
      host.innerHTML = "";
      void mounted;
    };
  }, [locale]);

  return <div ref={hostRef} />;
}
