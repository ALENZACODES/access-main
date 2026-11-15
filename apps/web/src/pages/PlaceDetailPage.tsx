import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ModuleResult } from "@access/shared";
import { getModules } from "../modules/linked.ts";
import { useLaneStrings } from "../modules/strings.ts";
import type { PlaceDetail } from "../modules/types.ts";
import { SectionLoading } from "../modules/Section.tsx";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";

const PackPlaceView = lazy(() => import("@access-tools/place").then((module) => ({ default: module.PackPlaceView })));

export function PlaceDetailPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useLaneStrings();
  const { profile } = useProfileState();
  const online = useOnline();
  const [loaded, setLoaded] = useState<{ id: string; result: ModuleResult<PlaceDetail> } | null>(null);
  const locale = i18n.language.startsWith("fr") ? ("fr" as const) : ("en" as const);

  useEffect(() => {
    let current = true;
    const ctx = { locale, offline: !online, profile, nowIso: new Date().toISOString() };
    getModules()
      .places.get(id, ctx)
      .then((result) => {
        if (current) setLoaded({ id, result });
      });
    return () => {
      current = false;
    };
  }, [id, locale, online, profile]);

  const result = loaded?.id === id ? loaded.result : null;
  const detail = result?.items[0] ?? null;
  const heading = detail ? (detail.name === "UNKNOWN" ? t("placeDetail.nameUnknown") : detail.name) : t("placeDetail.title");
  useDocumentTitle(heading);

  const odbl = detail?.sources.filter((source) => source.licence.toUpperCase().startsWith("ODBL")) ?? [];

  return (
    <div className="stack">
      <p>
        <Link to="/places">{t("placeDetail.back")}</Link>
      </p>
      <h1>{heading}</h1>
      {result === null ? <p role="status">{t("placeDetail.loading")}</p> : <p role="status">{t(result.messageKey)}</p>}
      {detail ? (
        <Suspense fallback={<SectionLoading />}>
          <PackPlaceView record={detail.record} sources={detail.sources} locale={locale} />
        </Suspense>
      ) : null}
      {odbl.length > 0 ? (
        <section aria-labelledby="place-attribution">
          <h2 id="place-attribution">{t("placeDetail.attribution")}</h2>
          <ul>
            {odbl.map((source) => (
              <li key={source.sourceId}>{source.attribution}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <p>{t("data.liveBody")}</p>
    </div>
  );
}
