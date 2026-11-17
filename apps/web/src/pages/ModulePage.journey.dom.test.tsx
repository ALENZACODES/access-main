/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyPlan, JourneyRequest } from "@access/shared";
import { initI18n } from "../i18n/index.ts";
import { LANE_STRINGS } from "../modules/strings.ts";

/**
 * The /journey page over a replaced module registry. The plans and places
 * below are labelled test data, not real places or accessibility facts.
 */
const result = (messageKey: string, items: unknown[] = [], availability = "ready") =>
  ({ moduleId: "journey", availability, items, messageKey, asOf: items.length ? "2026-11-01T00:00:00Z" : null, liveStatus: "unavailable" });
const provenance = { source_name: "Fixture source (test data)", source_url: null, licence: "ODbL-1.0", licence_url: null, source_date: "2026-11-01", retrieved_at: "2026-11-01", tier: 1, prototype_label: "PROTOTYPE-UNVERIFIED", freshness: "unknown" };
const placeHit = (id: string, name: string) => ({ id, name, provenance });
const journeyPlan = vi.fn();
const placesSearch = vi.fn();
vi.mock("../modules/linked.ts", () => ({
  getModules: () => ({
    places: { search: placesSearch },
    journey: { plan: journeyPlan },
  }),
}));
vi.mock("../profile/ProfileProvider.tsx", () => ({ useProfileState: () => ({ profile: null }) }));

const { ModulePage } = await import("./ModulePage.tsx");
const i18n = initI18n();

const labels = {
  en: { from: "From", to: "To", plan: "Plan this journey", noRoute: "No route found for this trip" },
  fr: { from: "Départ", to: "Arrivée", plan: "Planifier ce trajet", noRoute: null },
} as const;

async function view(lang: "en" | "fr") {
  await i18n.changeLanguage(lang);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><ModulePage id="journey" /></MemoryRouter>
    </I18nextProvider>,
  );
}

async function axeViolations(container: HTMLElement) {
  const run = await axe.run(container, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  return run.violations;
}

async function enabled(name: string) {
  await waitFor(() => expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(false));
}

async function plan(lang: "en" | "fr", from: string, to: string) {
  const l = labels[lang];
  fireEvent.change(await screen.findByLabelText(l.from), { target: { value: from } });
  fireEvent.change(screen.getByLabelText(l.to), { target: { value: to } });
  await enabled(l.plan);
  await act(async () => { fireEvent.submit(screen.getByRole("button", { name: l.plan }).closest("form") as HTMLFormElement); });
}

/** Testing Library collapses the page text's spaces (U+00A0 included) but not the expected string's. */
const text = (value: string) => value.replace(/\s+/g, " ");

const lastRequest = (): JourneyRequest => journeyPlan.mock.calls.at(-1)?.[0] as JourneyRequest;

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
beforeEach(() => {
  journeyPlan.mockImplementation(async (request: JourneyRequest) => result(request.originLabel || request.originId ? "journey.noCoordinates" : "journey.awaiting"));
  placesSearch.mockImplementation(async () => ({ ...result("modules.ready", [placeHit("fixture:a", "Fixture place A"), placeHit("fixture:a2", "Fixture place A annex")]), moduleId: "places" }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/journey with the planner mounted", () => {
  it.each(["en", "fr"] as const)("is ready before any place is asked for (%s)", async (lang) => {
    await view(lang);
    expect(await screen.findByText(LANE_STRINGS[lang].journey.awaiting)).toBeTruthy();
    await enabled(labels[lang].plan);
  });

  it.each(["en", "fr"] as const)("shows the no-position state, not a no-route notice (%s)", async (lang) => {
    const { container } = await view(lang);
    await plan(lang, "Fixture no position", "Fixture place B");
    expect(await screen.findByText(text(LANE_STRINGS[lang].journey.noCoordinates))).toBeTruthy();
    expect(lastRequest()).toMatchObject({ originLabel: "Fixture no position", destinationLabel: "Fixture place B", originId: null, destinationId: null });
    if (labels[lang].noRoute) expect(screen.queryByRole("heading", { name: labels[lang].noRoute })).toBeNull();
    expect(document.querySelector(".state-notice")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it.each(["en", "fr"] as const)("shows the area-not-covered state (%s)", async (lang) => {
    journeyPlan.mockImplementation(async (request: JourneyRequest) => result(request.originLabel ? "journey.noArea" : "journey.awaiting"));
    await view(lang);
    await plan(lang, "Fixture place A", "Fixture outside place");
    expect(await screen.findByText(text(LANE_STRINGS[lang].journey.noArea))).toBeTruthy();
    expect(document.querySelector(".state-notice")).toBeNull();
  });

  it.each(["en", "fr"] as const)("chooses a place from the search and sends its record id (%s)", async (lang) => {
    const { container } = await view(lang);
    const copy = LANE_STRINGS[lang].journey;
    fireEvent.change(await screen.findByLabelText(labels[lang].from), { target: { value: "Fixture place A" } });
    const find = copy.find.replace("{{field}}", labels[lang].from);
    await enabled(find);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: find })); });
    const list = await screen.findByRole("region", { name: copy.matchesFor.replace("{{field}}", labels[lang].from) });
    expect(placesSearch).toHaveBeenCalledWith({ text: "Fixture place A" }, expect.objectContaining({ locale: lang }));
    expect(within(list).getAllByRole("button", { name: new RegExp(`^${copy.use}`) })).toHaveLength(2);
    expect(await axeViolations(container)).toEqual([]);
    await act(async () => { fireEvent.click(within(list).getByRole("button", { name: copy.useName.replace("{{name}}", "Fixture place A annex") })); });
    const from = screen.getByLabelText(labels[lang].from) as HTMLInputElement;
    expect(from.value).toBe("Fixture place A annex");
    expect(document.activeElement).toBe(from);
    expect(screen.getByText(text(copy.chosen.replace("{{name}}", "Fixture place A annex")))).toBeTruthy();
    expect(screen.queryByRole("region", { name: copy.matchesFor.replace("{{field}}", labels[lang].from) })).toBeNull();
    fireEvent.change(screen.getByLabelText(labels[lang].to), { target: { value: "Fixture place B" } });
    await act(async () => { fireEvent.submit(from.closest("form") as HTMLFormElement); });
    expect(lastRequest()).toMatchObject({ originLabel: "Fixture place A annex", originId: "fixture:a2", destinationLabel: "Fixture place B", destinationId: null });
  });

  it("drops the chosen id when the text is edited again", async () => {
    await view("en");
    const copy = LANE_STRINGS.en.journey;
    fireEvent.change(await screen.findByLabelText("From"), { target: { value: "Fixture place A" } });
    await enabled("Find places for From");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find places for From" })); });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: copy.useName.replace("{{name}}", "Fixture place A") })); });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "Fixture place A2" } });
    expect(screen.queryByText(copy.chosen.replace("{{name}}", "Fixture place A"))).toBeNull();
    await plan("en", "Fixture place A2", "Fixture place B");
    expect(lastRequest()).toMatchObject({ originLabel: "Fixture place A2", originId: null });
  });

  it.each(["en", "fr"] as const)("says when the place search finds nothing or cannot be read (%s)", async (lang) => {
    const copy = LANE_STRINGS[lang].journey;
    placesSearch.mockImplementationOnce(async () => ({ ...result("modules.ready"), moduleId: "places" }));
    await view(lang);
    fireEvent.change(await screen.findByLabelText(labels[lang].to), { target: { value: "Nothing" } });
    const find = copy.find.replace("{{field}}", labels[lang].to);
    await enabled(find);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: find })); });
    expect((await screen.findByText(copy.noMatches)).getAttribute("role")).toBe("status");
    placesSearch.mockImplementationOnce(async () => ({ ...result("modules.unavailable", [], "stub"), moduleId: "places" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: find })); });
    expect(await screen.findByText(copy.searchFailed)).toBeTruthy();
  });

  it.each(["en", "fr"] as const)("shows what the planner returned with its provenance, positions and notes (%s)", async (lang) => {
    const item: JourneyPlan = {
      id: "roll:fixture:a:fixture:b",
      summary: lang === "en" ? "Rolling route: 111 m. Fixture summary." : "Parcours en fauteuil : 111 m. Résumé d’exemple.",
      provenance: provenance as JourneyPlan["provenance"],
      liveStatus: "unavailable",
      notices: ["Fixture planner note"],
      endpoints: [
        { role: "origin", id: "fixture:a", name: "Fixture place A", position: { source_id: "fixture-test", source_name: "Fixture source (test data)", licence: "ODbL-1.0", retrieved_at: "2026-11-01", tier: 1 } },
        { role: "destination", id: "fixture:b", name: "Fixture place B", position: { source_id: "fixture-test", source_name: "Fixture source (test data)", licence: "ODbL-1.0", retrieved_at: "2026-11-01", tier: 0 } },
      ],
    };
    journeyPlan.mockImplementation(async (request: JourneyRequest) => (request.originLabel ? result("journey.planned", [item]) : result("journey.awaiting")));
    const { container } = await view(lang);
    await plan(lang, "Fixture place A", "Fixture place B");
    const copy = LANE_STRINGS[lang].journey;
    expect(await screen.findByText(copy.planned)).toBeTruthy();
    expect(screen.getByText(text(item.summary))).toBeTruthy();
    const details = screen.getByTestId("journey-plan");
    expect(details.textContent).toContain(copy.endpoint
      .replace("{{role}}", labels[lang].from).replace("{{name}}", "Fixture place A").replace("{{source}}", "Fixture source (test data)")
      .replace("{{licence}}", "ODbL-1.0").replace("{{date}}", "2026-11-01").replace("{{tier}}", "1"));
    expect(within(details).getByRole("heading", { name: copy.notices })).toBeTruthy();
    expect(details.textContent).toContain("Fixture planner note");
    expect(document.querySelector(".state-notice")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("keeps the Day 22 no-route notice for a planner that found no connected route", async () => {
    journeyPlan.mockImplementation(async (request: JourneyRequest) => result(request.originLabel ? "journey.noRoute" : "journey.awaiting"));
    await view("en");
    await plan("en", "Fixture place A", "Fixture island place");
    expect(await screen.findByText(LANE_STRINGS.en.journey.noRoute)).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "No route found for this trip" })).toBeTruthy();
  });

  it("keeps the form off when the pack cannot be read", async () => {
    journeyPlan.mockImplementation(async () => result("modules.unavailable", [], "stub"));
    await view("en");
    expect(await screen.findByText("This part of the App is not available yet. No records are shown.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Plan this journey" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Find places for From" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
