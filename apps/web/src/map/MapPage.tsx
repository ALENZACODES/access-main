import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { panMapTo, silenceMapMotion, zoomMapBy } from "./camera.ts";
import { FeatureList } from "./FeatureList.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { StateNotice, getRouteEmpty, getRouteError } from "../states/index.ts";
import { TileBandNotice, type TileFailure } from "./TileBandNotice.tsx";
import { filesForView, readTileList, TileFileUnavailable, VerifiedPMTilesSource, warmRegionTiles, type BBox, type SourceInfo, type TileFile } from "./tileCache.ts";
import { boardingStatus, displayName, fieldLabel, headlineExpression, headlineStatus, mapWord, noteLines, SHOWN_ELSEWHERE, valueLabel, type MapStatus } from "./placeText.ts";
import "./map.css";
import "maplibre-gl/dist/maplibre-gl.css";

type Category = "washroom" | "venue" | "transit";
type Need = "entrance" | "toilet" | "changing" | "boarding";
type Status = MapStatus;
type Fact = { value: unknown; source_id?: string; licence?: string; retrieved_at?: string; tier?: string };
type Place = {
  id: string;
  name: string;
  category: Category;
  lat: number;
  lon: number;
  facts: Record<string, Fact>;
  source?: string;
  licence?: string;
  retrieved?: string;
  tier?: string;
};
const categories: Category[] = ["washroom", "venue", "transit"];
const needs: Need[] = ["entrance", "toilet", "changing", "boarding"];
const fields: Record<Need, string[]> = {
  entrance: ["step_free_entrance", "wheelchair", "entrance_wheelchair"],
  toilet: ["accessible_washroom", "toilets_wheelchair", "wheelchair_toilet"],
  changing: ["changing_table", "changing_table_available"],
  boarding: ["wheelchair_boarding", "wheelchair_boarding_available"],
};
const PAINT: Record<Status, string> = { yes: "#14803c", partly: "#b45f06", no: "#b3261e", unknown: "#ffffff" };
const LEGEND: Status[] = ["yes", "partly", "no", "unknown"];

function factFrom(value: unknown): Fact {
  if (value && typeof value === "object" && "value" in value) return value as Fact;
  return { value };
}

function status(value: unknown): Status {
  if (value === true || value === "yes" || value === "YES" || value === "true" || value === 1 || value === "1") return "yes";
  if (value === false || value === "no" || value === "NO" || value === "false" || value === 0 || value === "0") return "no";
  return "unknown";
}

function needFact(place: Place, need: Need): Fact | undefined {
  for (const name of fields[need]) if (place.facts[name] !== undefined) return place.facts[name];
  return undefined;
}

function needStatus(place: Place, need: Need): Status {
  const fact = needFact(place, need);
  if (need === "boarding" && place.facts.wheelchair_boarding === fact) return boardingStatus(fact?.value);
  return status(fact?.value);
}

/** The headline for a place: wheelchair access for a place, the accessible washroom for a washroom, boarding for a stop. */
function displayStatus(place: Place): Status {
  return headlineStatus(place.category, (field) => place.facts[field]?.value);
}

function fromProperties(props: Record<string, unknown>, lon: number, lat: number): Place | null {
  const id = String(props.id ?? props.place_id ?? "");
  if (!id) return null;
  const rawTranche = String(props.tranche ?? props.category ?? props.kind ?? "venue").toLowerCase();
  const category: Category = rawTranche.includes("washroom") || rawTranche.includes("toilet") ? "washroom"
    : rawTranche.includes("transit") || rawTranche.includes("stop") ? "transit" : "venue";
  let parsed: Record<string, unknown> = {};
  try {
    if (typeof props.fields === "string") parsed = JSON.parse(props.fields) as Record<string, unknown>;
    else if (props.fields && typeof props.fields === "object") parsed = props.fields as Record<string, unknown>;
  } catch { /* Use individual vector tile properties instead. */ }
  const facts: Record<string, Fact> = {};
  for (const [key, value] of Object.entries({ ...props, ...parsed })) {
    if (["id", "place_id", "name", "tranche", "category", "kind", "fields", "lat", "lon"].includes(key)) continue;
    facts[key] = factFrom(value);
  }
  return {
    id, name: String(props.name && props.name !== "UNKNOWN" ? props.name : id), category, lon, lat, facts,
    source: String(props.source_id ?? ""), licence: String(props.licence ?? ""),
    retrieved: String(props.retrieved_at ?? ""), tier: String(props.tier ?? ""),
  };
}

type MapInstance = import("maplibre-gl").Map;
type MapModule = typeof import("maplibre-gl");

function tileLayerName(name: string): Category | null {
  const lower = name.toLowerCase();
  if (lower.includes("washroom") || lower.includes("toilet")) return "washroom";
  if (lower.includes("transit") || lower.includes("stop")) return "transit";
  if (lower.includes("venue") || lower.includes("place")) return "venue";
  return null;
}

export function MapPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("fr") ? "fr" : "en";
  useDocumentTitle(t("map.title"));
  const canvas = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const layerIds = useRef<string[]>([]);
  const layerCategories = useRef(new Map<string, Category>());
  const enabledRef = useRef<Category[]>(categories);
  const [tileFailures, setTileFailures] = useState<TileFailure[]>([]);
  const [tileListUnavailable, setTileListUnavailable] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Category[]>(categories);
  const [selectedNeeds, setSelectedNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const online = useOnline();
  const [libraryError, setLibraryError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [sources, setSources] = useState<Map<string, SourceInfo>>(new Map());
  const revealDetail = useRef(false);
  const listId = "map-place-list";
  const mapControlsOff = libraryError || !mapReady;

  const visible = useMemo(() => places.filter((place) => enabled.includes(place.category) &&
    selectedNeeds.every((need) => needStatus(place, need) !== "no")), [places, enabled, selectedNeeds]);
  const selected = visible.find((place) => place.id === selectedId) ?? null;

  const refresh = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const bounds = map.getBounds();
    const unique = new Map<string, Place>();
    for (const feature of map.queryRenderedFeatures(undefined, { layers: layerIds.current })) {
      if (feature.geometry.type !== "Point") continue;
      const lon = feature.geometry.coordinates[0];
      const lat = feature.geometry.coordinates[1];
      if (typeof lon !== "number" || typeof lat !== "number" || !bounds.contains([lon, lat])) continue;
      const place = fromProperties(feature.properties as Record<string, unknown>, lon, lat);
      if (place) unique.set(place.id, place);
    }
    // Places with recorded access come first; within each group, by name.
    const known = (place: Place) => (displayStatus(place) === "unknown" ? 1 : 0);
    setPlaces(Array.from(unique.values()).sort((a, b) => known(a) - known(b) || displayName(a.name).localeCompare(displayName(b.name), locale)));
    setLoading(false);
  }, [locale]);

  useEffect(() => {
    if (!canvas.current) return;
    let disposed = false;
    let map: MapInstance | undefined;
    let protocol: import("pmtiles").Protocol | undefined;
    let maplibre: MapModule | undefined;
    const init = async () => {
      try {
        const [lib, tiles] = await Promise.all([import("maplibre-gl"), import("pmtiles")]);
        if (disposed || !canvas.current) return;
        maplibre = lib;
        protocol = new tiles.Protocol();
        lib.addProtocol("pmtiles", protocol.tile);
        // The tile files come from the pack manifest's tile list; none is at a fixed path.
        // Without a readable tile list there is no map data, so no map is drawn and its controls stay off.
        let files: TileFile[];
        try {
          const list = await readTileList();
          files = list.files;
          if (!disposed && list.sources) setSources(list.sources);
        } catch {
          if (!disposed) { setTileListUnavailable(true); setLoading(false); }
          return;
        }
        if (disposed || !canvas.current) return;
        map = new lib.Map({
          container: canvas.current,
          attributionControl: false,
          interactive: true,
          keyboard: false,
          style: {
            version: 8,
            sources: {},
            layers: [{ id: "plain-background", type: "background", paint: { "background-color": "#f1f0ec" } }],
          },
          center: [-79.38, 43.65], zoom: 12.5, fadeDuration: 0,
        });
        const activeMap = map;
        mapRef.current = activeMap;
        setMapReady(true);
        silenceMapMotion(activeMap);
        activeMap.getCanvas().tabIndex = -1;
        activeMap.getCanvas().setAttribute("aria-hidden", "true");
        // Each file is added once, when it first covers the view, and only after it passed its check.
        const started = new Set<string>();
        const addFile = async (file: TileFile, index: number) => {
          const archive = new tiles.PMTiles(new VerifiedPMTilesSource(file));
          try {
            const metadata = await archive.getMetadata() as { vector_layers?: Array<{ id: string }> };
            if (disposed) return;
            protocol?.add(archive);
            const sourceId = `tiles-${index}`;
            activeMap.addSource(sourceId, { type: "vector", url: `pmtiles://${file.url}` });
            for (const { id: sourceLayer } of metadata.vector_layers ?? []) {
              // A layer named for one kind holds only that kind. A shared layer (the pack's "access")
              // holds every kind, and each point says its own kind in its "tranche" property.
              const named = tileLayerName(sourceLayer);
              if (!named) {
                // Sidewalks and paths in the pack draw a light street outline under the places.
                activeMap.addLayer({
                  id: `${sourceId}-${sourceLayer}-paths`, type: "line", source: sourceId, "source-layer": sourceLayer,
                  filter: ["==", ["get", "tranche"], "path"] as import("maplibre-gl").FilterSpecification,
                  layout: { "line-cap": "round", "line-join": "round" },
                  paint: {
                    "line-color": "#c5cad6",
                    "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.5, 17, 4],
                  },
                }, layerIds.current[0]);
              }
              for (const category of named ? [named] : categories) {
                const id = named ? `${sourceId}-${sourceLayer}` : `${sourceId}-${sourceLayer}-${category}`;
                const headline = headlineExpression() as unknown as import("maplibre-gl").ExpressionSpecification;
                activeMap.addLayer({
                  id, type: "circle", source: sourceId, "source-layer": sourceLayer,
                  ...(named ? {} : { filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "tranche"], category]] as import("maplibre-gl").FilterSpecification }),
                  layout: {
                    visibility: enabledRef.current.includes(category) ? "visible" : "none",
                    "circle-sort-key": ["match", headline, "unknown", 0, 1],
                  },
                  paint: {
                    // Recorded yes, partly or no is a filled dot; nothing recorded is a small hollow dot,
                    // so the places with known access stand out.
                    "circle-color": ["match", headline, "yes", PAINT.yes, "partly", PAINT.partly, "no", PAINT.no, PAINT.unknown],
                    "circle-radius": ["interpolate", ["linear"], ["zoom"],
                      9, ["match", headline, "unknown", 1.2, 3],
                      12, ["match", headline, "unknown", 2, 4.5],
                      14, ["match", headline, "unknown", 4, 6.5],
                      16, ["match", headline, "unknown", 6, 9]],
                    "circle-stroke-color": ["match", headline, "unknown", "#5b6478", "#ffffff"],
                    "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, ["match", headline, "unknown", 0.8, 1.5], 14, ["match", headline, "unknown", 1.5, 2]],
                  },
                });
                layerIds.current.push(id);
                layerCategories.current.set(id, category);
              }
            }
          } catch (cause) {
            if (disposed) return;
            const reason = cause instanceof TileFileUnavailable ? cause.reason : "integrity";
            setTileFailures((current) => current.some((item) => item.file.key === file.key) ? current : [...current, { file, reason }]);
          }
        };
        const coverView = async () => {
          if (disposed) return;
          const bounds = activeMap.getBounds();
          const view: BBox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
          const wanted = filesForView(files, view).filter((file) => !started.has(file.key));
          for (const file of wanted) started.add(file.key);
          await Promise.all(wanted.map((file) => addFile(file, files.indexOf(file))));
          refresh();
          if (!disposed && files.length > 0 && layerIds.current.length === 0) setLoading(false);
        };
        activeMap.on("load", () => {
          // A ring around the chosen place, drawn above every other layer.
          activeMap.addSource("chosen-place", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          activeMap.addLayer({
            id: "chosen-place-ring", type: "circle", source: "chosen-place",
            paint: { "circle-radius": 14, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#d6006d", "circle-stroke-width": 4 },
          });
          void coverView();
        });
        activeMap.on("moveend", () => { void coverView(); });
        activeMap.on("idle", refresh);
        activeMap.on("click", (event) => {
          const features = activeMap.queryRenderedFeatures(event.point, { layers: layerIds.current });
          const feature = features.find((item) => item.geometry.type === "Point");
          if (feature) {
            const id = String(feature.properties?.id ?? feature.properties?.place_id ?? "");
            if (id) { revealDetail.current = true; setSelectedId(id); }
          }
        });
        activeMap.on("error", () => setError(true));
        // Downloaded regions from I3 may dispatch this event after a completed download.
        const onRegion = (event: Event) => {
          const detail = (event as CustomEvent<{ bbox?: BBox }>).detail;
          if (detail?.bbox) void warmRegionTiles(files, detail.bbox);
        };
        window.addEventListener("access:region-downloaded", onRegion);
        cleanupRegion = () => window.removeEventListener("access:region-downloaded", onRegion);
      } catch {
        if (!disposed) { setLoading(false); setLibraryError(true); setMapReady(false); }
      }
    };
    let cleanupRegion = () => {};
    const categoriesForLayers = layerCategories.current;
    void init();
    return () => {
      disposed = true;
      cleanupRegion();
      map?.remove();
      if (maplibre && protocol) maplibre.removeProtocol("pmtiles");
      mapRef.current = null;
      layerIds.current = [];
      categoriesForLayers.clear();
      setMapReady(false);
    };
  }, [refresh]);

  useEffect(() => {
    const map = mapRef.current;
    const ring = map?.isStyleLoaded() ? map.getSource("chosen-place") as import("maplibre-gl").GeoJSONSource | undefined : undefined;
    ring?.setData({ type: "FeatureCollection", features: selected ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [selected.lon, selected.lat] } }] : [] });
    // A place picked on the map shows its details at once; one picked in the list keeps the list in view.
    if (selected && revealDetail.current) document.querySelector(".map-detail")?.scrollIntoView({ block: "nearest" });
    revealDetail.current = false;
  }, [selected]);

  // Map instance is assigned only after construction, not after the first render.
  useEffect(() => {
    enabledRef.current = enabled;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const id of layerIds.current) {
      const category = layerCategories.current.get(id) ?? null;
      map.setLayoutProperty(id, "visibility", category && enabled.includes(category) ? "visible" : "none");
    }
    refresh();
  }, [enabled, refresh]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    const place = places.find((candidate) => candidate.id === id);
    if (place && mapRef.current) panMapTo(mapRef.current, [place.lon, place.lat]);
  }, [places]);

  /** Where a record comes from, in words: the source's name, licence and date, from the record or the pack's source list. */
  const provenance = useCallback((place: Place) => {
    const info = sources.get(place.source ?? "");
    return {
      name: info?.name || place.source || "",
      licence: place.licence || info?.licence || "",
      retrieved: place.retrieved || info?.retrieved || "",
      attribution: info?.attribution || "",
    };
  }, [sources]);

  const listFeatures = useMemo(() => visible.map((place) => {
    const code = displayStatus(place);
    const from = provenance(place);
    return {
      id: place.id, name: displayName(place.name), lat: place.lat, lon: place.lon,
      statusCode: code,
      status: `${mapWord(locale, `headline.${place.category}`)}: ${mapWord(locale, `state.${code}`)}`,
      kind: mapWord(locale, `kind.${place.category}`),
      sourceLine: [from.name, from.licence, from.retrieved].filter(Boolean).join(" · "),
      source: from.name || "UNKNOWN", licence: from.licence || "UNKNOWN",
      retrievedAt: from.retrieved || "UNKNOWN", retrievedOn: from.retrieved || "UNKNOWN",
      attribution: from.attribution, prototypeLabel: "",
    };
  }), [visible, locale, provenance]);

  return (
    <div className="access-map-page">
      <h1>{t("map.title")}</h1>
      <p>{t("map.intro")}</p>
      <a href={`#${listId}`} className="map-skip">{t("map.skip")}</a>
      <fieldset className="map-filter-set">
        <legend>{t("map.categories")}</legend>
        {categories.map((category) => <label key={category} className="map-chip">
          <input type="checkbox" checked={enabled.includes(category)} onChange={() => setEnabled((old) => old.includes(category) ? old.filter((c) => c !== category) : [...old, category])} />
          {t(`map.${category}`)}
        </label>)}
      </fieldset>
      <fieldset className="map-filter-set">
        <legend>{t("map.needs")}</legend>
        {needs.map((need) => <label key={need} className="map-chip">
          <input type="checkbox" checked={selectedNeeds.includes(need)} onChange={() => setSelectedNeeds((old) => old.includes(need) ? old.filter((n) => n !== need) : [...old, need])} />
          {t(`map.${need}`)}
        </label>)}
      </fieldset>
      <div className="map-legend" role="group" aria-label={t("map.legend")}>
        {LEGEND.map((state) => <span key={state} className={`map-legend-${state}`}><i aria-hidden="true" />{state === "partly" ? mapWord(locale, "state.partly") : t(`map.${state}`)}</span>)}
      </div>
      <div className="map-toolbar" role="group" aria-label={t("map.viewControls")} aria-describedby={libraryError ? "map-library-error" : undefined}>
        <button type="button" disabled={mapControlsOff} onClick={() => mapRef.current && zoomMapBy(mapRef.current, 1)}>{t("map.zoomIn")}</button>
        <button type="button" disabled={mapControlsOff} onClick={() => mapRef.current && zoomMapBy(mapRef.current, -1)}>{t("map.zoomOut")}</button>
        <button type="button" disabled={mapControlsOff} onClick={refresh}>{t("map.refresh")}</button>
      </div>
      <div className="map-columns">
        <div ref={canvas} className="map-viewport" aria-hidden="true" data-testid="map-viewport" />
        <section className="map-results" aria-label={t("map.list")}>
          <p role="status">{loading ? t("map.loading") : `${visible.length} ${t("map.records")}`}</p>
          <TileBandNotice failures={tileFailures} listUnavailable={tileListUnavailable} />
          {libraryError && <p id="map-library-error" role="alert">{t("map.libraryUnavailable")} {t("map.controlsUnavailable")}</p>}
          {/* Offline, the map's data cannot load: say so with the offline state. Online, a load
              failure is not a pack download, so the map's own message is kept. */}
          {error ? (
            <StateNotice
              lang={locale}
              view={getRouteError("map", online ? "module-load-failed" : "offline-no-pack", locale)}
              onAction={{ retry: () => { setError(false); refresh(); } }}
            />
          ) : null}
          {visible.length ? <FeatureList features={listFeatures as React.ComponentProps<typeof FeatureList>["features"]} locale={locale} selectedId={selectedId} onSelect={select} listId={listId} />
            : !loading && !error ? (
              <div id={listId} tabIndex={-1}>
                <StateNotice lang={locale} view={getRouteEmpty("map", locale)!} />
              </div>
            ) : <p id={listId} tabIndex={-1}>{t("map.empty")}</p>}
        </section>
        {selected && (() => {
          const from = provenance(selected);
          const code = displayStatus(selected);
          const notes = selected.facts.wheelchair_description?.value;
          const needFields = new Set(Object.values(fields).flat());
          const others = Object.entries(selected.facts).filter(([key, fact]) => !SHOWN_ELSEWHERE.has(key) && !needFields.has(key)
            && fact.value !== undefined && fact.value !== null && String(fact.value).trim() !== "" && String(fact.value).toUpperCase() !== "UNKNOWN");
          const colon = locale === "fr" ? "\u00a0:" : ":";
          return <aside className="map-detail" aria-label={t("map.selected")}>
            <div className="map-detail-head">
              <div>
                <p className="map-detail-kind">{mapWord(locale, `kind.${selected.category}`)}</p>
                <h2>{displayName(selected.name)}</h2>
              </div>
              <button type="button" className="btn btn-quiet" onClick={() => setSelectedId(null)}>{t("map.close")}</button>
            </div>
            <p className={`map-headline status-${code}`}>
              <i aria-hidden="true" />
              {mapWord(locale, `headline.${selected.category}`)}{colon} <strong>{mapWord(locale, `state.${code}`)}</strong>
            </p>
            {typeof notes === "string" && notes.trim() ? (
              <div className="map-detail-notes">
                {noteLines(locale, notes).map((line, index) => <p key={index}>{line.label ? <><strong>{line.label}{colon}</strong> </> : null}{line.text}</p>)}
              </div>
            ) : null}
            <h3>{t("map.needs")}</h3>
            <dl className="map-facts">
              {needs.map((need) => {
                const state = needStatus(selected, need);
                return <div key={need}>
                  <dt>{t(`map.${need}`)}</dt>
                  <dd><span className={`map-state status-${state}`}>{state === "unknown" ? t("map.notProvided") : mapWord(locale, `state.${state}`)}</span></dd>
                </div>;
              })}
              {others.map(([key, fact]) => <div key={key}>
                <dt>{fieldLabel(locale, key)}</dt>
                <dd>{valueLabel(locale, key, fact.value)}</dd>
              </div>)}
            </dl>
            <h3>{t("map.source")}</h3>
            <dl className="map-facts map-source">
              <div><dt>{t("map.source")}</dt><dd>{from.name || t("map.notProvided")}</dd></div>
              <div><dt>{t("map.licence")}</dt><dd>{from.licence || t("map.notProvided")}</dd></div>
              <div><dt>{t("map.retrieved")}</dt><dd>{from.retrieved || t("map.notProvided")}</dd></div>
              {selected.tier ? <div><dt>{t("map.tier")}</dt><dd>{selected.tier}</dd></div> : null}
              {from.attribution ? <div><dt>{t("map.credit")}</dt><dd>{from.attribution}</dd></div> : null}
            </dl>
            <Link className="btn btn-primary" to={`/places/${encodeURIComponent(selected.id)}`}>{t("map.open")}</Link>
          </aside>;
        })()}
      </div>
      <p className="map-attribution"><a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">{t("map.attribution")}</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">{t("map.odbl")}</a></p>
    </div>
  );
}
