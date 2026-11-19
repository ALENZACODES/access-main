import { useId, useRef, useState, type Ref } from "react";
import type { JourneyPlan, ModuleResult, PlaceHit } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { TextInput } from "../design/fields.tsx";
import { useLaneStrings } from "../modules/strings.ts";

export interface ChosenPlace {
  id: string;
  name: string;
}

export interface TripRequest {
  origin: string;
  originId: string | null;
  destination: string;
  destinationId: string | null;
}

export type PlaceSearch = (text: string) => Promise<ModuleResult<PlaceHit>>;

/**
 * One end of the trip: a text field, and under it the matches from the same
 * place search the /places page uses. Choosing a match keeps its record id;
 * editing the text again drops the choice.
 */
function PlaceField({
  label,
  value,
  chosen,
  disabled,
  search,
  onText,
  onChoose,
}: {
  label: string;
  value: string;
  chosen: ChosenPlace | null;
  disabled: boolean;
  search: PlaceSearch;
  onText: (value: string) => void;
  onChoose: (place: ChosenPlace) => void;
}) {
  const { t } = useLaneStrings();
  const [matches, setMatches] = useState<PlaceHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listLabel = useId();
  const find = async () => {
    const text = value.trim();
    if (!text) return;
    try {
      const result = await search(text);
      if (result.availability !== "ready") throw new Error("search unavailable");
      setFailed(false);
      setMatches(result.items);
    } catch {
      setFailed(true);
      setMatches(null);
    }
  };
  return (
    <div ref={wrap} className="stack journey-place">
      <TextInput
        label={label}
        value={value}
        onChange={(next) => {
          setMatches(null);
          setFailed(false);
          onText(next);
        }}
        isDisabled={disabled}
        description={chosen ? t("journey.chosen", { name: chosen.name }) : undefined}
      />
      <div className="button-row">
        <Button variant="secondary" isDisabled={disabled || !value.trim()} onPress={() => void find()}>
          {t("journey.find", { field: label })}
        </Button>
      </div>
      <p role="status">{failed ? t("journey.searchFailed") : matches && matches.length === 0 ? t("journey.noMatches") : ""}</p>
      {matches && matches.length > 0 ? (
        <section className="stack" aria-labelledby={listLabel}>
          <h2 id={listLabel}>{t("journey.matchesFor", { field: label })}</h2>
          <ul className="stack">
            {matches.map((hit) => (
              <li key={hit.id} className="button-row">
                <span>{hit.name}</span>
                <Button
                  variant="secondary"
                  aria-label={t("journey.useName", { name: hit.name })}
                  onPress={() => {
                    onChoose({ id: hit.id, name: hit.name });
                    setMatches(null);
                    wrap.current?.querySelector("input")?.focus();
                  }}
                >
                  {t("journey.use")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** The journey form: two places, each typed or chosen from the place search, and a plan button. */
export function JourneyForm({
  canPlan,
  formRef,
  describedBy,
  search,
  onPlan,
}: {
  canPlan: boolean;
  formRef?: Ref<HTMLFormElement>;
  describedBy?: string;
  search: PlaceSearch;
  onPlan: (trip: TripRequest) => void;
}) {
  const { t } = useLaneStrings();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originChoice, setOriginChoice] = useState<ChosenPlace | null>(null);
  const [destinationChoice, setDestinationChoice] = useState<ChosenPlace | null>(null);
  return (
    <form
      ref={formRef}
      className="stack"
      aria-describedby={describedBy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canPlan) return;
        onPlan({ origin, originId: originChoice?.id ?? null, destination, destinationId: destinationChoice?.id ?? null });
      }}
    >
      <PlaceField
        label={t("modules.origin")}
        value={origin}
        chosen={originChoice}
        disabled={!canPlan}
        search={search}
        onText={(next) => { setOrigin(next); setOriginChoice(null); }}
        onChoose={(place) => { setOrigin(place.name); setOriginChoice(place); }}
      />
      <PlaceField
        label={t("modules.destination")}
        value={destination}
        chosen={destinationChoice}
        disabled={!canPlan}
        search={search}
        onText={(next) => { setDestination(next); setDestinationChoice(null); }}
        onChoose={(place) => { setDestination(place.name); setDestinationChoice(place); }}
      />
      <div className="button-row">
        <Button type="submit" isDisabled={!canPlan}>{t("modules.plan")}</Button>
      </div>
    </form>
  );
}

/** What the planner returned with each plan: where each position came from, and the planner's own notes. */
export function JourneyPlanDetails({ items }: { items: readonly JourneyPlan[] }) {
  const { t } = useLaneStrings();
  const headingId = useId();
  if (items.length === 0) return null;
  return (
    <div className="stack">
      {items.map((item) => (
        <div key={item.id} className="stack" data-testid="journey-plan">
          {item.endpoints && item.endpoints.length > 0 ? (
            <ul>
              {item.endpoints.map((end) => (
                <li key={end.role}>
                  {t("journey.endpoint", {
                    role: t(end.role === "origin" ? "modules.origin" : "modules.destination"),
                    name: end.name,
                    source: end.position.source_name,
                    licence: end.position.licence,
                    date: end.position.retrieved_at.slice(0, 10),
                    tier: end.position.tier,
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          {item.notices && item.notices.length > 0 ? (
            <section className="stack" aria-labelledby={`${headingId}-${item.id}`}>
              <h2 id={`${headingId}-${item.id}`}>{t("journey.notices")}</h2>
              <ul>
                {item.notices.map((notice) => <li key={notice}>{notice}</li>)}
              </ul>
            </section>
          ) : null}
        </div>
      ))}
    </div>
  );
}
