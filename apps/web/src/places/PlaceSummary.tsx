import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PackRecord, PackSourceEntry } from "@access/shared";
import { rememberPlace } from "./placeHints.ts";
import { sharedPackSource } from "./packAccess.ts";
import { distanceWords, say, type Locale } from "./copy.ts";
import { gettingInFacts, glanceFacts, insideFacts, known, pointOf, type SummarySection } from "./placeFacts.ts";

const TARGET = { minHeight: 44, display: "inline-flex", alignItems: "center" } as const;
/** How far "nearby" reaches, in metres. */
export const NEARBY_RADIUS_M = 800;
const NEARBY_LIMIT = 5;

function Section({ id, heading, section, locale }: { id: string; heading: string; section: SummarySection; locale: Locale }) {
  return (
    <section aria-labelledby={id} className="stack">
      <h2 id={id}>{heading}</h2>
      {section.facts.length === 0 ? <p>{say(locale, "noneKnown")}</p> : (
        <dl className="place-facts">
          {section.facts.map((fact) => (
            <div key={fact.key}>
              <dt>{fact.label}</dt>
              <dd lang={fact.lang}>
                {fact.href ? <a href={fact.href} rel="noopener noreferrer" target="_blank" style={TARGET}>{fact.value}</a> : fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {section.sources.length > 0 ? (
        <p className="result-note">
          {say(locale, "fromSources")}{locale === "fr" ? "\u00a0: " : ": "}
          {section.sources.map((source) => say(locale, "sourceLine", { name: source.name, licence: source.licence, date: source.date, tier: source.tier })).join("; ")}
        </p>
      ) : null}
    </section>
  );
}

type NearbyItem = { id: string; name: string; nameLang?: Locale; distanceM: number; wheelchair: string | null; href: string };

function nearbyItems(found: Array<{ record: PackRecord; distanceM: number }>, selfId: string, locale: Locale): NearbyItem[] {
  return found
    .filter((item) => item.record.id !== selfId)
    .slice(0, NEARBY_LIMIT)
    .map(({ record, distanceM }) => {
      const point = pointOf(record);
      // Kept in memory only, so opening this place reads the right files; nothing goes into the link.
      if (point) rememberPlace(record.id, point.lat, point.lon, record.tranche);
      const named = known(record, "name");
      const kind = known(record, "facility_type") ?? known(record, "category");
      const readableKind = kind && !["yes", "toilets"].includes(kind.toLowerCase()) ? kind.replace(/_/g, " ") : null;
      const unnamed = say(locale, record.tranche === "washroom" ? "unnamedWashroom" : record.tranche === "transit" ? "unnamedStop" : "unnamedPlace");
      const name = named ?? (readableKind ? readableKind.charAt(0).toUpperCase() + readableKind.slice(1) : unnamed);
      const wheelchair = known(record, "wheelchair") ?? known(record, "wheelchair_boarding");
      return {
        id: record.id,
        name,
        ...(locale === "fr" && (named || readableKind) ? { nameLang: "en" as const } : {}),
        distanceM,
        wheelchair,
        href: `/places/${encodeURIComponent(record.id)}`,
      };
    });
}

function plainWheelchair(locale: Locale, value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  const word = v === "yes" || v === "designated" ? "yes" : v === "no" || v === "boarding_not_possible" ? "no" : v === "limited" ? "limited" : v === "some_vehicles_accessible" ? "someVehicles" : null;
  return word ? `${say(locale, "wheelchair")}${locale === "fr" ? "\u00a0: " : ": "}${say(locale, word)}` : null;
}

function Nearby({ record, locale }: { record: PackRecord; locale: Locale }) {
  const point = pointOf(record);
  const [state, setState] = useState<{ id: string; washrooms: NearbyItem[]; transit: NearbyItem[] } | null>(null);
  useEffect(() => {
    const at = pointOf(record);
    if (!at) return;
    let active = true;
    const opts = (tranche: string) => ({ tranches: [tranche], radiusM: NEARBY_RADIUS_M, limit: NEARBY_LIMIT + 1 });
    type Found = Array<{ record: PackRecord; distanceM: number }>;
    void sharedPackSource().then(async (source): Promise<[Found, Found]> => {
      if (!source?.nearby) return [[], []];
      return Promise.all([source.nearby(at, opts("washroom")), source.nearby(at, opts("transit"))]);
    }).then(
      ([washrooms, transit]) => {
        if (active) setState({ id: record.id, washrooms: nearbyItems(washrooms, record.id, locale), transit: nearbyItems(transit, record.id, locale) });
      },
      () => { if (active) setState({ id: record.id, washrooms: [], transit: [] }); },
    );
    return () => { active = false; };
  }, [record, locale]);
  const radius = distanceWords(locale, NEARBY_RADIUS_M);
  const list = (heading: string, items: NearbyItem[]) => (
    <div className="stack">
      <h3>{heading}</h3>
      {items.length === 0 ? <p>{say(locale, "nearbyNone", { distance: radius })}</p> : (
        <ul className="stack">
          {items.map((item) => {
            const access = plainWheelchair(locale, item.wheelchair);
            return (
              <li key={item.id}>
                <Link to={item.href} style={TARGET}><span lang={item.nameLang}>{item.name}</span></Link>
                {" "}· {say(locale, "away", { distance: distanceWords(locale, item.distanceM) })}{access ? ` · ${access}` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
  return (
    <section aria-labelledby="place-nearby" className="stack">
      <h2 id="place-nearby">{say(locale, "nearbyHeading", { distance: radius })}</h2>
      {!point ? <p>{say(locale, "nearbyNoPoint")}</p> : state?.id !== record.id ? <p role="status">{say(locale, "nearbyLoading")}</p> : (
        <>
          {list(say(locale, "nearbyWashrooms"), state.washrooms)}
          {list(say(locale, "nearbyTransit"), state.transit)}
        </>
      )}
    </section>
  );
}

/** The summary above the full facts table: at a glance, getting in, inside, and what is nearby. */
export function PlaceSummary({ record, sources, locale }: { record: PackRecord; sources: readonly PackSourceEntry[]; locale: Locale }) {
  return (
    <div className="stack">
      <Section id="place-glance" heading={say(locale, "glanceHeading")} section={glanceFacts(record, sources, locale)} locale={locale} />
      <Section id="place-getting-in" heading={say(locale, "gettingInHeading")} section={gettingInFacts(record, sources, locale)} locale={locale} />
      <Section id="place-inside" heading={say(locale, "insideHeading")} section={insideFacts(record, sources, locale)} locale={locale} />
      <Nearby record={record} locale={locale} />
      <p>{say(locale, "fullTable")}</p>
    </div>
  );
}
