import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { StateNotice } from "./StateNotice.tsx";
import { message } from "./messages.ts";
import { parsePointInput } from "./packGeo.ts";
import { placeNameHints } from "./hints.ts";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces.ts";
import { PackBands } from "./PackBands.tsx";
import { TextMap } from "./TextMap.tsx";
import { StreetIndex } from "./StreetIndex.tsx";
import { ListTransfer } from "./ListTransfer.tsx";
import { PackCategories } from "./PackCategories.tsx";
import type { BandKey } from "./packBands.ts";
import { EMPTY_FACETS, type FacetId, type FacetSelection, selectFacet } from "./packFacets.ts";
import { EMPTY_PACK_QUERY, type PackPlaceCard, type TagFilter, TAG_FILTERS, packPlacesView } from "./packPlacesView.ts";
import { getRouteError } from "./routeStates.ts";
import { OutingPlanner } from "./OutingPlanner.tsx";
import { MeetUp } from "./MeetUp.tsx";
import { NoteReading } from "./NoteReading.tsx";
import { TagNoteCheck } from "./TagNoteCheck.tsx";
import { NoteTopics } from "./NoteTopics.tsx";
import { inputsFromPlaces } from "./outingPlan.ts";
import { PackSearchEcho, PackSearchHelp, PackSearchWhy } from "./PackSearchHelp.tsx";
import { PackSearchWords, PackWordList } from "./PackWords.tsx";
import { PlaceSheet } from "./PlaceSheet.tsx";
import { Shortlist } from "./Shortlist.tsx";
import { MAX_SHORTLIST, type AddResult, resolveShortlist } from "./shortlist.ts";
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

function Card({ card, locale, listed, onToggle, place, today }: { card: PackPlaceCard; locale: Locale; listed: boolean; onToggle: () => void; place?: PackPlaceRecord; today: string }) {
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
      {place ? <PlaceSheet place={place} locale={locale} today={today} /> : null}
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
  const [kind, setKind] = useState<string | null>(null);
  const [band, setBand] = useState<BandKey | null>(null);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const day = today ?? new Date().toISOString().slice(0, 10);
  const shortlist = useShortlist(day);
  const [listNote, setListNote] = useState("");

  const parsed = useMemo(() => parsePackPlaces(places), [places]);
  const byId = useMemo(() => new Map(parsed.places.map((p) => [p.id, p] as const)), [parsed.places]);
  const near = useMemo(() => parsePointInput(lat, lon), [lat, lon]);
  const stops = useMemo(() => inputsFromPlaces(resolveShortlist(shortlist.list, parsed.places).found.map((f) => f.place)), [shortlist.list, parsed.places]);
  const from = near.status === "ok" ? near.point : null;
  // A distance band means nothing without a point, so it is ignored (not forgotten) until a point is typed again.
  const activeBand = from === null ? null : band;
  const view = useMemo(
    () => packPlacesView(parsed.places, parsed.dropped, { ...EMPTY_PACK_QUERY, text, tag, near, facets, kind, band: activeBand }, { locale, today: day }),
    [parsed, text, tag, near, facets, kind, activeBand, locale, day],
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
    setKind(null);
    setBand(null);
  };
  const isTag = (value: string): value is TagFilter => (TAG_FILTERS as readonly string[]).includes(value);

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale}>
      <h2 id={headingId}>{message("pack.heading", locale)}</h2>
      <p>{message("pack.intro", locale)}</p>
      <TextInput label={message("pack.search", locale)} value={text} onChange={setText} />
      <PackSearchEcho text={text} locale={locale} />
      <PackSearchHelp places={parsed.places} locale={locale} onTry={setText} />
      <PackSearchWhy places={parsed.places} text={text} locale={locale} onUse={setText} />
      <PackSearchWords places={parsed.places} text={text} locale={locale} onUse={setText} />
      <PackWordList places={parsed.places} locale={locale} onTry={setText} />
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
      <TextMap places={view.shownPlaces} from={from} locale={locale} />
      <PackBands places={view.beforeBand} shown={view.shownPlaces} from={from} locale={locale} today={day} selected={activeBand} onSelect={setBand} />
      <StreetIndex places={view.shownPlaces} locale={locale} onAdd={shortlist.add} />
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
            <Card key={card.id} card={card} locale={locale} listed={shortlist.list.some((e) => e.id === card.id)} onToggle={() => toggleListed(card)} place={byId.get(card.id)} today={day} />
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
      <ListTransfer list={shortlist.list} places={parsed.places} locale={locale} add={shortlist.add} />
      <OutingPlanner places={stops} locale={locale} today={day} start={from} />
      <NoteReading places={view.shownPlaces} locale={locale} />
      <MeetUp places={view.shownPlaces} locale={locale} from={near.status === "ok" ? near.point : null} />
      <NoteTopics places={view.shownPlaces} locale={locale} />
      <TagNoteCheck places={view.shownPlaces} locale={locale} />
      <p>{message("pack.osmCredit", locale)}</p>
    </section>
  );
}
