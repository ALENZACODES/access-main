import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ModuleResult } from "@access/shared";
import { getModules } from "../modules/linked.ts";
import { useLaneStrings } from "../modules/strings.ts";
import type { PlaceDetail } from "../modules/types.ts";
import { SectionLoading } from "../modules/Section.tsx";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { StateNotice, initialConnectivity, offlineBanner, placeRouteView } from "../states/index.ts";

const PackPlaceView = lazy(() => import("@access-tools/place").then((module) => ({ default: module.PackPlaceView })));

export function PlaceDetailPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useLaneStrings();
  const { profile } = useProfileState();
  const online = useOnline();
  const navigate = useNavigate();
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

  const today = new Date().toISOString().slice(0, 10);
  const connectivity = initialConnectivity(online);
  const routeCtx = { locale, connectivity, today } as const;
  // Error and not-found use the shared state views. When a detail is present,
  // PackPlaceView stays the body so recorded facts are not hidden behind an empty state.
  const routeView =
    result === null
      ? null
      : detail
        ? null
        : placeRouteView(result.availability === "error" ? { status: "error" } : { status: "not-found" }, routeCtx);
  const banner = detail ? offlineBanner(connectivity, locale) : routeView && routeView.kind !== "error" ? routeView.banner : null;
  const savedCopyNotice =
    detail && !online
      ? locale === "fr"
        ? "Ces renseignements proviennent d’une copie enregistrée sur cet appareil."
        : "These details come from a copy saved on this device."
      : null;
  const odbl = detail?.sources.filter((source) => source.licence.toUpperCase().startsWith("ODBL")) ?? [];

  return (
    <div className="stack">
      <p>
        <Link to="/places">{t("placeDetail.back")}</Link>
      </p>
      <h1>{heading}</h1>
      {result === null ? <p role="status">{t("placeDetail.loading")}</p> : <p role="status">{t(result.messageKey)}</p>}
      {banner ? (
        <p role="status">
          {banner.title} {banner.description}
        </p>
      ) : null}
      {savedCopyNotice ? <p role="status">{savedCopyNotice}</p> : null}
      {routeView && (routeView.kind === "error" || routeView.kind === "empty") ? (
        <StateNotice
          view={routeView.view}
          lang={locale}
          onAction={{
            retry: () => window.location.reload(),
            "go-back": () => navigate("/places"),
          }}
        />
      ) : null}
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
