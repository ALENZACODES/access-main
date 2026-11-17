import { useTranslation } from "react-i18next";
import type { TileFile, TileProblem } from "./tileCache.ts";

export interface TileFailure {
  file: Pick<TileFile, "key" | "family" | "band">;
  reason: TileProblem;
}

type T = ReturnType<typeof useTranslation>["t"];

/** "OpenStreetMap places, latitude 43° to 44° N" for the key odbl/n43; the family name alone for an unsplit file. */
export function tileAreaLabel(file: TileFailure["file"], t: T): string {
  const family = t(file.family === "odbl" ? "map.familyOdbl" : "map.familyOpen");
  const lat = file.band.lat ? /^([ns])(\d+)$/.exec(file.band.lat) : null;
  if (!lat || lat[1] !== "n") return family;
  const from = Number(lat[2]);
  const lon = file.band.lon ? /^w(\d+)$/.exec(file.band.lon) : null;
  if (!lon) return t("map.areaLat", { family, from, to: from + 1 });
  const west = Number(lon[1]);
  return t("map.areaLatLon", { family, from, to: from + 1, west, east: west - 1 });
}

/**
 * Which map data files are unavailable and why. The container is a status
 * region that is always present, so a file that fails while the map is open
 * is announced. The other files keep working.
 */
export function TileBandNotice({ failures, listUnavailable }: { failures: readonly TileFailure[]; listUnavailable: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="map-tile-status" data-testid="map-tile-status">
      {listUnavailable ? <p>{t("map.tileListUnavailable")}</p> : null}
      {failures.length > 0 ? (
        <ul>
          {failures.map((failure) => (
            <li key={failure.file.key} data-tile-key={failure.file.key} data-tile-problem={failure.reason}>
              {t(failure.reason === "integrity" ? "map.tileIntegrity" : "map.tileNetwork", { area: tileAreaLabel(failure.file, t) })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
