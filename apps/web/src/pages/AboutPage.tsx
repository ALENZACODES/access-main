import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BUILD_ID, CONTRACT_VERSION } from "../buildInfo.ts";
import { summarizeStorage, type StorageSummary } from "../storage/repository.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { LIVE_PURPOSES, LIVE_RULES, PRIVACY_STORAGE_PREFIX, liveRefused } from "../privacy/panel/live.ts";
import { outsideItems } from "../privacy/panel/outsideSection.ts";
import { STORAGE_REGISTER, UNSCANNED } from "../privacy/panel/storageRegister.ts";
import { aboutNoticeItems } from "../privacy/onDeviceNotice/index.ts";
import { adaptElement, browserDownload, mountPrivacyPanel } from "../privacy/panel/mount.ts";
import { createPrivacyController } from "../privacy/panel/controller.ts";
import { safeLocalStorage } from "../privacy/panel/storage.ts";
import type { InventoryEntry } from "../privacy/panel/inventory.ts";

const REVIEWED_ON = "2026-11-15";

const INVENTORY_SOURCE = {
  en: "Written for the App by the project team",
  fr: "Rédigé pour l’App par l’équipe du projet",
} as const;

const INVENTORY_KEPT_FOR = {
  en: "Until you erase them",
  fr: "Jusqu’à ce que vous les effaciez",
} as const;

/** Purpose text for each About-page inventory id from aboutNoticeItems(). */
const INVENTORY_PURPOSE: Record<string, { en: string; fr: string }> = {
  profile: { en: "Remember settings on this device", fr: "Conserver les réglages sur cet appareil" },
  cache: { en: "Read records again without another download", fr: "Relire les enregistrements sans nouveau téléchargement" },
  outbox: { en: "Keep a file you can export yourself", fr: "Conserver un fichier que vous pouvez exporter vous-même" },
  language: {
    en: "Remember the language you chose on this device",
    fr: "Conserver la langue que vous avez choisie sur cet appareil",
  },
  geolocation: {
    en: "Show your position on maps on this device. The App does not upload it",
    fr: "Afficher votre position sur les cartes sur cet appareil. L’App ne l’envoie pas",
  },
};

/**
 * The panel renders #62's on-device notice from this same inventory, so the
 * five About items stay on the page without a second notice (which would
 * duplicate the privacy-on-device-title id).
 */
const ABOUT_INVENTORY: readonly InventoryEntry[] = aboutNoticeItems().map((item) => ({
  id: item.id,
  label: item.label,
  ...(item.where !== undefined ? { where: item.where } : {}),
  ...(INVENTORY_PURPOSE[item.id] !== undefined ? { purpose: INVENTORY_PURPOSE[item.id] } : {}),
  keptFor: INVENTORY_KEPT_FOR,
  source: INVENTORY_SOURCE,
  recordedOn: REVIEWED_ON,
}));

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
      purposes: LIVE_PURPOSES,
      refused: liveRefused,
      withdrawRules: LIVE_RULES,
      outside: outsideItems(STORAGE_REGISTER, UNSCANNED, PRIVACY_STORAGE_PREFIX),
      now: () => new Date(),
      reviewedOn: REVIEWED_ON,
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
