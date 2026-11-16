import {
  RouteReportForm, RouteReportsList, corroborateReports, validateReport, type HubRouteReport,
} from "@access-maps/conditions";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { getPlaceDetail, getPackSource } from "../modules/linked.ts";
import { PackageView } from "./PackageView";

export const ROUTE_REPORTS_KEY = "access.routeReports.v1";
/** Reports made here stay on this device. No sharing licence has been set for them, so it is recorded as unknown. */
const DEVICE_SOURCE = "this-device";
const DEVICE_LICENCE = "UNKNOWN";

/** Reads the reports kept on this device. Anything that fails the package's own check is left out. */
export function readDeviceReports(storage: Pick<Storage, "getItem"> | null): HubRouteReport[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(ROUTE_REPORTS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const checked = validateReport(item);
      return checked.ok ? [checked.report] : [];
    });
  } catch {
    return [];
  }
}

function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `report-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Place = { state: "none" | "checking" | "missing" } | { state: "found"; id: string; name: string };

function Reports(props: { language?: "en" | "fr" }) {
  const { t } = useTranslation("hub");
  const language = props.language ?? "en";
  const [params] = useSearchParams();
  const placeId = params.get("place")?.trim() ?? "";
  const [reports, setReports] = useState<HubRouteReport[]>(() => readDeviceReports(deviceStorage()));
  const [kept, setKept] = useState(true);
  const [place, setPlace] = useState<Place>({ state: placeId ? "checking" : "none" });

  useEffect(() => {
    if (!placeId) { setPlace({ state: "none" }); return; }
    let active = true;
    setPlace({ state: "checking" });
    void getPlaceDetail(getPackSource(), placeId).then((result) => {
      if (!active) return;
      const detail = result.availability === "ready" ? result.items[0] : undefined;
      setPlace(detail ? { state: "found", id: detail.id, name: detail.name } : { state: "missing" });
    });
    return () => { active = false; };
  }, [placeId]);

  const save = (report: HubRouteReport) => {
    const next = [...reports, report];
    setReports(next);
    try {
      deviceStorage()?.setItem(ROUTE_REPORTS_KEY, JSON.stringify(next));
      setKept(deviceStorage() !== null);
    } catch {
      setKept(false);
    }
  };

  return (
    <>
      {kept ? null : <p role="alert">{t("routeReportsNotKept")}</p>}
      <RouteReportsList groups={corroborateReports(reports, new Date())} language={language} />
      {place.state === "found" ? (
        <RouteReportForm
          language={language}
          location={{ type: "feature", feature_id: place.id }}
          locationLabel={place.name.toUpperCase() === "UNKNOWN" ? t("unknown") : place.name}
          sourceId={DEVICE_SOURCE}
          licence={DEVICE_LICENCE}
          reporterRef={null}
          newId={newId}
          onSave={save}
        />
      ) : (
        <p>
          {t(place.state === "checking" ? "loading" : place.state === "missing" ? "routeReportsPlaceMissing" : "routeReportsChoosePlace")}{" "}
          {place.state === "checking" ? null : (
            <Link to="/places" style={{ display: "inline-flex", minHeight: 44, alignItems: "center" }}>{t("routeReportsPlaces")}</Link>
          )}
        </p>
      )}
    </>
  );
}

export default function RouteReportsPage() {
  const { t } = useTranslation("hub");
  return (
    <PackageView page="routeReports" component={Reports}>
      <p>{t("routeReportsNote")}</p>
    </PackageView>
  );
}
