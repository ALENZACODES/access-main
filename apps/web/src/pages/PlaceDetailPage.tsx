import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { tierMessageKey, type ModuleResult, type PackPlace } from "@access/shared";
import { torontoContent } from "../packs/bundledToronto.ts";
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
  const [loaded, setLoaded] = useState<{ id: string; result: ModuleResult<PlaceDetail>; bundled: PackPlace | null } | null>(null);
  const locale = i18n.language.startsWith("fr") ? ("fr" as const) : ("en" as const);

  useEffect(() => {
    let current = true;
    const ctx = { locale, offline: !online, profile, nowIso: new Date().toISOString() };
    getModules()
      .places.get(id, ctx)
      .then(async (result) => {
        if (!current) return;
        const content = !result.items.length && result.availability !== "error" ? await torontoContent() : null;
        if (current) setLoaded({ id, result, bundled: content?.places.find((place) => place.id === id) ?? null });
      });
    return () => {
      current = false;
    };
  }, [id, locale, online, profile]);

  const result = loaded?.id === id ? loaded.result : null;
  const detail = result?.items[0] ?? null;
  const bundled = loaded?.id === id ? loaded.bundled : null;
  const field = (value: string) => value === "UNKNOWN" ? t("offline.unknown") : value;
  const heading = detail ? (detail.name === "UNKNOWN" ? t("placeDetail.nameUnknown") : detail.name) : (bundled?.name ?? t("placeDetail.title"));
  useDocumentTitle(heading);

  const today = new Date().toISOString().slice(0, 10);
  const connectivity = initialConnectivity(online);
  const routeCtx = { locale, connectivity, today } as const;
  // Error and not-found use the shared state views. When a detail is present,
  // PackPlaceView stays the body so recorded facts are not hidden behind an empty state.
  const routeView =
    result === null
      ? null
      : detail || bundled
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
      {result === null ? <p role="status">{t("placeDetail.loading")}</p> : <p role="status">{t(bundled ? "placeDetail.found" : result.messageKey)}</p>}
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
      {bundled ? (
        <div className="stack">
          <p>{t("offline.placeCategory", { value: field(bundled.category) })}</p>
          <p>{t("offline.placeWheelchair", { value: field(bundled.wheelchair) })}</p>
          <p>{t("offline.placeAddress", { value: field(bundled.address) })}</p>
          <p>{t("offline.placeSource", {
            name: bundled.provenance.source_name, licence: bundled.provenance.licence,
            date: bundled.provenance.retrieved_at, tier: String(bundled.provenance.tier),
          })} {t(tierMessageKey(bundled.provenance.tier))}</p>
          <p>{t("offline.osmCredit")}</p>
        </div>
      ) : null}
      {detail ? (
        <Suspense fallback={<SectionLoading />}>
          <PackPlaceView record={detail.record} sources={detail.sources} locale={locale} />
        </Suspense>
      ) : null}
      {detail ? (
        <p>
          <Link
            to={`/more/route-reports?place=${encodeURIComponent(detail.id)}`}
            style={{ display: "inline-flex", minHeight: 44, alignItems: "center" }}
          >
            {t("placeDetail.reportRoute")}
          </Link>
        </p>
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
