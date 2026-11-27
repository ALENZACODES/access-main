import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { hitDetail } from "../places/PlaceSearchParts.tsx";
import { sharedPackSource } from "../places/packAccess.ts";

export type MapHit = { id: string; name: string; lat: number; lon: number };
type Locale = "en" | "fr";

const WORDS = {
  en: {
    label: "Search places on the map",
    placeholder: "Search places, e.g. Union Station",
    action: "Search",
    clear: "Clear the search",
    searching: "Searching…",
    none: "No place by that name in this area.",
    failed: "Search is unavailable right now.",
    results: (n: number) => `${n} ${n === 1 ? "place" : "places"} found`,
    go: (name: string) => `Show ${name} on the map`,
  },
  fr: {
    label: "Chercher des lieux sur la carte",
    placeholder: "Chercher un lieu, p. ex. Union Station",
    action: "Chercher",
    clear: "Effacer la recherche",
    searching: "Recherche…",
    none: "Aucun lieu de ce nom dans ce secteur.",
    failed: "La recherche est indisponible pour le moment.",
    results: (n: number) => `${n} ${n === 1 ? "lieu trouvé" : "lieux trouvés"}`,
    go: (name: string) => `Afficher ${name} sur la carte`,
  },
} as const;

type Hit = { id: string; name: string; lat?: number; lon?: number; category?: string | null; city?: string | null; tranche?: string | null; provenance?: { source_name?: string } };

/**
 * The search box on the map. It searches the same place list as the Places page,
 * in the area the map is showing, and moves the map to the place chosen.
 * Typed words stay on this page: they are not put in the address or stored.
 */
export function MapSearch({ locale, regionNear, onPick }: { locale: Locale; regionNear: () => Promise<string>; onPick: (hit: MapHit) => void }) {
  const words = WORDS[locale];
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [hits, setHits] = useState<Hit[]>([]);
  const asked = useRef(0);

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    const query = text.trim();
    if (!query) return;
    const ticket = ++asked.current;
    setState("busy");
    try {
      const source = await sharedPackSource();
      if (!source) throw new Error("no source");
      const region = await regionNear();
      const found = await source.search(query, { limit: 8, region } as never) as unknown as Hit[];
      if (ticket !== asked.current) return;
      setHits(found.filter((hit) => typeof hit.lat === "number" && typeof hit.lon === "number"));
      setState("done");
    } catch {
      if (ticket === asked.current) { setHits([]); setState("failed"); }
    }
  };

  const clear = () => { asked.current += 1; setText(""); setHits([]); setState("idle"); input.current?.focus(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && (hits.length || text)) { event.preventDefault(); clear(); } };

  return (
    <form role="search" aria-label={words.label} className="map-search" onSubmit={run}>
      <div className="map-search-bar">
        <svg className="map-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input
          ref={input}
          id={`${id}-q`}
          type="search"
          aria-label={words.label}
          autoComplete="off"
          placeholder={words.placeholder}
          value={text}
          onKeyDown={onKey}
          onChange={(event) => setText(event.target.value)}
        />
        {text ? <button type="button" className="map-search-clear" onClick={clear}><span className="visually-hidden">{words.clear}</span></button> : null}
        <button type="submit" className="map-search-go">{words.action}</button>
      </div>
      <p className="visually-hidden" role="status">
        {state === "busy" ? words.searching : state === "done" ? (hits.length ? words.results(hits.length) : words.none) : state === "failed" ? words.failed : ""}
      </p>
      {state === "done" && hits.length === 0 ? <p className="map-search-empty">{words.none}</p> : null}
      {state === "failed" ? <p className="map-search-empty">{words.failed}</p> : null}
      {hits.length > 0 ? (
        <ul className="map-search-results">
          {hits.map((hit) => {
            const detail = hitDetail(hit, locale);
            return (
              <li key={hit.id}>
                <button
                  type="button"
                  onKeyDown={onKey}
                  aria-label={words.go(hit.name)}
                  aria-describedby={detail ? `${id}-${hit.id}` : undefined}
                  onClick={() => { onPick({ id: hit.id, name: hit.name, lat: hit.lat!, lon: hit.lon! }); setHits([]); setState("idle"); }}
                >
                  <span className="map-search-name">{hit.name}</span>
                  {detail ? <span className="map-search-detail" id={`${id}-${hit.id}`}>{detail}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </form>
  );
}
