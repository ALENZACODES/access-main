import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { StateNotice } from "./StateNotice.tsx";
import { message } from "./messages.ts";
import { parsePointInput } from "./packGeo.ts";
import { placeNameHints } from "./hints.ts";
import { parsePackPlaces } from "./packPlaces.ts";
import { EMPTY_FACETS, type FacetId, type FacetSelection, selectFacet } from "./packFacets.ts";
import { EMPTY_PACK_QUERY, type PackPlaceCard, type TagFilter, TAG_FILTERS, packPlacesView } from "./packPlacesView.ts";
import { getRouteError } from "./routeStates.ts";
import { Shortlist } from "./Shortlist.tsx";
import { MAX_SHORTLIST, type AddResult } from "./shortlist.ts";
import { SuggestionList } from "./SuggestionList.tsx";
import { useShortlist } from "./useShortlist.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The `places` array of the pack stored on this device, as read. It is parsed here, not trusted. */
  places: unknown;
  locale: Locale;
  /** ISO date; defaults to today on this device. */
  today?: string;
}

function Card({ card, locale, listed, onToggle }: { card: PackPlaceCard; locale: Locale; listed: boolean; onToggle: () => void }) {
  const titleId = useId();
  const buttonId = useId();
  return (
    <li className="pack-place" data-tag={card.tag}>
      <h3 id={titleId}>{card.name}</h3>
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
      <p>
        <Button id={buttonId} variant="quiet" aria-pressed={listed} aria-labelledby={`${buttonId} ${titleId}`} onPress={onToggle}>
          {listed ? t(locale, "Remove from list", "Retirer de la liste") : t(locale, "Add to list", "Ajouter à la liste")}
        </Button>
      </p>
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
 * Places from the offline pack stored on this device, with search, filters and a
 * short list to compare places side by side. The pack is only read. The only thing
 * written is the list of chosen place ids, kept on this device; nothing is sent.
 */
export function PackPlaces({ places, locale, today }: Props) {
  const headingId = useId();
  const [text, setText] = useState("");
  const [tag, setTag] = useState<TagFilter>("any");
  const [facets, setFacets] = useState<FacetSelection>(EMPTY_FACETS);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const day = today ?? new Date().toISOString().slice(0, 10);
  const shortlist = useShortlist(day);
  const [listNote, setListNote] = useState("");

  const parsed = useMemo(() => parsePackPlaces(places), [places]);
  const near = useMemo(() => parsePointInput(lat, lon), [lat, lon]);
  const view = useMemo(
    () => packPlacesView(parsed.places, parsed.dropped, { ...EMPTY_PACK_QUERY, text, tag, near, facets }, { locale, today: day }),
    [parsed, text, tag, near, facets, locale, day],
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

  const toggleListed = (card: PackPlaceCard) => {
    if (shortlist.list.some((e) => e.id === card.id)) {
      shortlist.remove(card.id);
      setListNote(t(locale, `${card.name} removed from the list.`, `${card.name} retiré de la liste.`));
      return;
    }
    const result: AddResult = shortlist.add(card.id);
    setListNote(
      result === "added"
        ? t(locale, `${card.name} added to the list.`, `${card.name} ajouté à la liste.`)
        : result === "full"
          ? t(locale, `The list is full (${MAX_SHORTLIST} places). Remove one to add another.`, `La liste est pleine (${MAX_SHORTLIST} lieux). Retirez-en un pour en ajouter un autre.`)
          : t(locale, `${card.name} could not be added.`, `${card.name} n’a pas pu être ajouté.`),
    );
  };
  const clear = () => {
    setText("");
    setTag("any");
    setFacets(EMPTY_FACETS);
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
            <Card key={card.id} card={card} locale={locale} listed={shortlist.list.some((e) => e.id === card.id)} onToggle={() => toggleListed(card)} />
          ))}
        </ul>
      )}
      <p aria-live="polite">{listNote}</p>
      <Shortlist
        list={shortlist.list}
        places={parsed.places}
        locale={locale}
        today={day}
        kept={shortlist.kept}
        from={near.status === "ok" ? near.point : null}
        onRemove={shortlist.remove}
        onClear={shortlist.clear}
      />
      <p>{message("pack.osmCredit", locale)}</p>
    </section>
  );
}
