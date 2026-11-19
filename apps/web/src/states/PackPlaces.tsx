import { useId, useMemo, useState } from "react";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { StateNotice } from "./StateNotice.tsx";
import { message } from "./messages.ts";
import { parsePointInput } from "./packGeo.ts";
import { placeNameHints } from "./hints.ts";
import { parsePackPlaces } from "./packPlaces.ts";
import { PackCategories } from "./PackCategories.tsx";
import { EMPTY_FACETS, type FacetId, type FacetSelection, selectFacet } from "./packFacets.ts";
import { EMPTY_PACK_QUERY, type PackPlaceCard, type TagFilter, TAG_FILTERS, packPlacesView } from "./packPlacesView.ts";
import { getRouteError } from "./routeStates.ts";
import { SuggestionList } from "./SuggestionList.tsx";
import type { Locale } from "./stateCopy.ts";

interface Props {
  /** The `places` array of the pack stored on this device, as read. It is parsed here, not trusted. */
  places: unknown;
  locale: Locale;
  /** ISO date; defaults to today on this device. */
  today?: string;
}

function Card({ card, locale }: { card: PackPlaceCard; locale: Locale }) {
  return (
    <li className="pack-place" data-tag={card.tag}>
      <h3>{card.name}</h3>
      <p>
        <strong>{card.tagLine}</strong>
      </p>
      {card.distanceText ? <p>{card.distanceText}</p> : null}
      <p>{card.category}</p>
      <p>{card.address}</p>
      {card.note ? <p>{card.note}</p> : null}
      {card.noSourceNotice ? <p>{card.noSourceNotice}</p> : null}
      {card.sourceLine ? <p>{card.sourceLine}</p> : null}
      <p>{card.tierText}</p>
      {card.ageText ? <p>{card.ageText}</p> : null}
      {card.staleNotice ? <p>{card.staleNotice}</p> : null}
      {card.sourceUrl && card.sourceLinkLabel ? (
        <p>
          <a className="text-link" href={card.sourceUrl} rel="noreferrer noopener" lang={locale}>
            {card.sourceLinkLabel}
          </a>
        </p>
      ) : null}
    </li>
  );
}

/**
 * Places from the offline pack stored on this device, with search and a filter
 * on the reported OpenStreetMap wheelchair tag. Reading only: nothing here
 * writes to storage or sends anything.
 */
export function PackPlaces({ places, locale, today }: Props) {
  const headingId = useId();
  const [text, setText] = useState("");
  const [tag, setTag] = useState<TagFilter>("any");
  const [facets, setFacets] = useState<FacetSelection>(EMPTY_FACETS);
  const [kind, setKind] = useState<string | null>(null);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const day = today ?? new Date().toISOString().slice(0, 10);

  const parsed = useMemo(() => parsePackPlaces(places), [places]);
  const near = useMemo(() => parsePointInput(lat, lon), [lat, lon]);
  const view = useMemo(
    () => packPlacesView(parsed.places, parsed.dropped, { ...EMPTY_PACK_QUERY, text, tag, near, facets, kind }, { locale, today: day }),
    [parsed, text, tag, near, facets, kind, locale, day],
  );

  // Other names to try when a typed search finds nothing. Only places the current filter allows are offered.
  const hints = useMemo(() => {
    if (view.kind !== "empty" || text.trim() === "") return [];
    return placeNameHints(text, tag === "any" ? parsed.places : parsed.places.filter((p) => p.tag === tag));
  }, [view.kind, text, tag, parsed.places]);

  // A pack with no usable places at all is a load problem, not a "no matches" result.
  if (parsed.places.length === 0) {
    return (
      <section className="stack" aria-labelledby={headingId} lang={locale}>
        <h2 id={headingId}>{message("pack.heading", locale)}</h2>
        <StateNotice view={getRouteError("search", "pack-unreadable", locale)} lang={locale} />
        {view.droppedNotice ? <p>{view.droppedNotice}</p> : null}
      </section>
    );
  }

  const clear = () => {
    setText("");
    setTag("any");
    setFacets(EMPTY_FACETS);
    setKind(null);
  };
  const isTag = (value: string): value is TagFilter => (TAG_FILTERS as readonly string[]).includes(value);

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale}>
      <h2 id={headingId}>{message("pack.heading", locale)}</h2>
      <p>{message("pack.intro", locale)}</p>
      <TextInput label={message("pack.search", locale)} value={text} onChange={setText} />
      <ChoiceGroup
        label={message("pack.tagLabel", locale)}
        value={tag}
        onChange={(value) => {
          if (isTag(value)) setTag(value);
        }}
        options={view.tagOptions}
      />
      {view.facetGroups.map((group) => (
        <ChoiceGroup
          key={group.facet}
          label={group.label}
          value={facets[group.facet as FacetId] ?? ""}
          onChange={(value) => setFacets((current) => selectFacet(current, group.facet, value))}
          options={group.options}
        />
      ))}
      <PackCategories places={view.beforeKind} locale={locale} today={day} selected={kind} onSelect={setKind} />
      <fieldset className="stack">
        <legend>{message("pack.nearLegend", locale)}</legend>
        <p>{message("pack.nearHelp", locale)}</p>
        <TextInput label={message("pack.lat", locale)} value={lat} onChange={setLat} error={view.nearError ?? undefined} />
        <TextInput label={message("pack.lon", locale)} value={lon} onChange={setLon} />
      </fieldset>
      <p role="status">{view.announcement}</p>
      {view.facetSummary ? <p>{view.facetSummary}</p> : null}
      {view.unknownHiddenNotice ? <p>{view.unknownHiddenNotice}</p> : null}
      {view.droppedNotice ? <p>{view.droppedNotice}</p> : null}
      {view.kind === "empty" ? (
        <>
          <StateNotice view={view.view} lang={locale} onAction={{ "clear-search": clear }} />
          <SuggestionList hints={hints} locale={locale} onPick={setText} />
        </>
      ) : (
        <ul className="record-list">
          {view.cards.map((card) => (
            <Card key={card.id} card={card} locale={locale} />
          ))}
        </ul>
      )}
      <p>{message("pack.osmCredit", locale)}</p>
    </section>
  );
}
