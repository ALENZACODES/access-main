// Behaviour audit: the notice of a panel is text, never markup. The panels of the narrow-screen tools build their
// page as an HTML string and show the message of a caught error in a notice, so a notice that holds a tag must come
// back escaped. Each panel is rendered with ten hostile texts in its notice (and, for the zones panel, in its error
// line; for the audit panel, in its error message; for the hand panel, in the earlier log field) and the markup is checked. It checks the panels listed here and the notice and error fields it names.

import { describe, expect, it } from "vitest";
import { HOSTILE, checkEscaped, escapedForm } from "./dgHostile";
import { readDeviceFacts } from "../../narrow/device-facts";
import { initialFitState, renderFitPanel } from "../../narrow/fit-panel";
import { initialHandState, renderHandPanel } from "../../narrow/hand-panel";
import { renderPanel } from "../../narrow/panel";
import { initialGesturesState, renderGesturesPanel } from "../../narrow/gestures-panel";
import { initialPressPanel, renderPressPanel } from "../../narrow/press-panel";
import { initialReachState, renderReachPanel } from "../../narrow/reach-panel";
import { initialScrollState, renderScrollPanel } from "../../narrow/scroll-panel";
import { initialSlipState, renderSlipPanel } from "../../narrow/slip-panel";
import { initialSummaryState, renderSummaryPanel } from "../../narrow/summary-panel";
import { initialTapState, renderTapPanel } from "../../narrow/tap-panel";
import { initialTravelState, renderTravelPanel } from "../../narrow/travel-panel";
import { initialTypingState, renderTypingPanel } from "../../narrow/typing-panel";
import { initialVoiceState, renderVoicePanel } from "../../narrow/voice-panel";
import { initialZonesState, renderZonesPanel } from "../../narrow/zones-panel";

type Render = (notice: string, lang: "en" | "fr") => string;

const FACTS = readDeviceFacts({});
const NOW = new Date("2026-11-21T12:00:00.000Z");

const PANELS: Array<[string, Render]> = [
  ["fit", (n, l) => renderFitPanel(l, { ...initialFitState(FACTS), notice: n }, NOW)],
  ["gestures", (n, l) => renderGesturesPanel(l, { ...initialGesturesState(), notice: n })],
  ["hand", (n, l) => renderHandPanel(l, { ...initialHandState(), notice: n }, NOW)],
  ["press", (n, l) => renderPressPanel(l, { ...initialPressPanel(), notice: n })],
  ["reach", (n, l) => renderReachPanel(l, { ...initialReachState(), notice: n })],
  ["scroll", (n, l) => renderScrollPanel(l, { ...initialScrollState(), notice: n })],
  ["slip", (n, l) => renderSlipPanel(l, { ...initialSlipState(), notice: n })],
  ["summary", (n, l) => renderSummaryPanel(l, { ...initialSummaryState(), notice: n })],
  ["tap", (n, l) => renderTapPanel(l, { ...initialTapState(), notice: n })],
  ["travel", (n, l) => renderTravelPanel(l, { ...initialTravelState(), notice: n })],
  ["typing", (n, l) => renderTypingPanel(l, { ...initialTypingState(), notice: n })],
  ["voice", (n, l) => renderVoicePanel(l, { ...initialVoiceState(), notice: n })],
  ["zones", (n, l) => renderZonesPanel(l, { ...initialZonesState(), notice: n })],
];

describe("the notice of a panel is escaped", () => {
  for (const [name, render] of PANELS) {
    for (const lang of ["en", "fr"] as const) {
      it(`${name} (${lang}) shows every hostile text as text`, () => {
        for (const h of HOSTILE) expect(checkEscaped(render(h.text, lang), h), `${name} ${lang} ${h.name}`).toEqual([]);
      });
    }
  }
});

describe("the error line of the zones panel is escaped", () => {
  it.each(["en", "fr"] as const)("shows every hostile text as text (%s)", (lang) => {
    for (const h of HOSTILE) expect(checkEscaped(renderZonesPanel(lang, { ...initialZonesState(), error: h.text }), h), h.name).toEqual([]);
  });
});

describe("a panel with an empty notice holds none of the hostile markers", () => {
  it.each(PANELS)("%s", (_name, render) => {
    const markup = render("", "en");
    for (const h of HOSTILE) for (const m of h.rawMarkers) expect(markup).not.toContain(m);
  });
});

describe("the error state of the audit panel is escaped", () => {
  it.each(["en", "fr"] as const)("shows every hostile text as the message of an error (%s)", (lang) => {
    for (const h of HOSTILE) {
      const markup = renderPanel(lang, { kind: "error", message: h.text } as never, "", true);
      expect(checkEscaped(markup, h), h.name).toEqual([]);
    }
  });
});

describe("the earlier log field of the hand panel is escaped", () => {
  it.each(["en", "fr"] as const)("shows every hostile text in the field and in its error line (%s)", (lang) => {
    for (const h of HOSTILE) {
      const markup = renderHandPanel(lang, { ...initialHandState(), earlierText: h.text, earlierError: h.text }, NOW);
      const found = checkEscaped(markup, h).filter((f) => f.problem !== "the text is not shown at all");
      expect(found, h.name).toEqual([]);
      expect(markup).toContain(escapedForm(h.text));
    }
  });
});
