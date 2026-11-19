import { describe, expect, it } from "vitest";
import { EMPTY_KINDS, ERROR_KINDS, getEmptyState, getErrorState } from "./stateCopy.ts";
import type { Locale } from "./stateCopy.ts";

/** Keeps state wording short enough to read at a glance on a phone. */
const MAX_TITLE = 70;
const MAX_DESCRIPTION = 260;
const MAX_ACTION_LABEL = 40;
const MAX_ACTIONS = 3;
const LOCALES: Locale[] = ["en", "fr"];

const all = (locale: Locale) => [
  ...ERROR_KINDS.map((k) => ({ id: `error:${k}`, view: getErrorState(k, locale) })),
  ...EMPTY_KINDS.map((k) => ({ id: `empty:${k}`, view: getEmptyState(k, locale) })),
];

describe.each(LOCALES)("state copy length budget (%s)", (locale) => {
  it("keeps every title short", () => {
    expect(all(locale).filter(({ view }) => view.title.length > MAX_TITLE).map((x) => x.id)).toEqual([]);
  });
  it("keeps every description short", () => {
    expect(all(locale).filter(({ view }) => view.description.length > MAX_DESCRIPTION).map((x) => x.id)).toEqual([]);
  });
  it("keeps action labels short and the number of actions small", () => {
    const longLabel = all(locale).filter(({ view }) => view.actions.some((a) => a.label.length > MAX_ACTION_LABEL)).map((x) => x.id);
    const many = all(locale).filter(({ view }) => view.actions.length > MAX_ACTIONS).map((x) => x.id);
    expect({ longLabel, many }).toEqual({ longLabel: [], many: [] });
  });
  it("has no empty title or description", () => {
    expect(all(locale).filter(({ view }) => !view.title.trim() || !view.description.trim()).map((x) => x.id)).toEqual([]);
  });
});
