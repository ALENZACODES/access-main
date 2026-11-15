import { describe, expect, it } from "vitest";
import { LANGS } from "../i18n/catalog.ts";
import { ACTION_IDS, CONTROL_MODES, type ActionId, type AdapterResult, type ControlAdapter } from "../types.ts";
import { applyAction, initialChooserState } from "../widget.ts";
import { GazeSimulatorAdapter } from "./gaze.ts";
import { KeyboardAdapter } from "./keyboard.ts";
import { SwitchAdapter, switchInputFromKey } from "./switch.ts";
import { VoiceAdapter, normaliseTranscript } from "./voice.ts";

type AnyAdapter = ControlAdapter<never> & { plan(a: ActionId): unknown[]; handle(i: never): AdapterResult };

const factories: Record<string, () => AnyAdapter> = {
  keyboard: () => new KeyboardAdapter() as unknown as AnyAdapter,
  switch: () => new SwitchAdapter() as unknown as AnyAdapter,
  "voice-en": () => new VoiceAdapter("en") as unknown as AnyAdapter,
  "voice-fr": () => new VoiceAdapter("fr") as unknown as AnyAdapter,
  gaze: () => new GazeSimulatorAdapter() as unknown as AnyAdapter,
};

function run(adapter: AnyAdapter, inputs: unknown[]): AdapterResult[] {
  return inputs.map((input) => adapter.handle(input as never));
}

describe("parity: every mode reaches every advertised action", () => {
  for (const [name, make] of Object.entries(factories)) {
    for (const action of ACTION_IDS) {
      it(`${name} reaches ${action} and nothing earlier runs`, () => {
        const results = run(make(), make().plan(action));
        const actions = results.filter((r) => r.kind === "action");
        expect(actions).toEqual([{ kind: "action", action }]);
        expect(results.at(-1)).toEqual({ kind: "action", action });
      });
    }
  }

  it("covers all four modes", () => {
    const modes = new Set(["keyboard", "switch", "voice", "gaze"]);
    expect(new Set([new KeyboardAdapter().mode, new SwitchAdapter().mode, new VoiceAdapter("en").mode, new GazeSimulatorAdapter().mode])).toEqual(modes);
    expect([...CONTROL_MODES].sort()).toEqual([...modes].sort());
  });

  it("each mode drives the widget to the same end state: Option B confirmed", () => {
    for (const [name, make] of Object.entries(factories)) {
      let state = initialChooserState;
      for (const action of ["next", "choose", "confirm"] as const) {
        const adapter = make();
        const result = run(adapter, adapter.plan(action)).at(-1);
        expect(result?.kind, name).toBe("action");
        if (result?.kind === "action") state = applyAction(state, result.action).state;
      }
      expect(state, name).toEqual({ focus: 1, chosen: 1, confirmed: true });
    }
  });
});

describe("keyboard", () => {
  const kb = new KeyboardAdapter();
  it("never maps Tab, so focus is not trapped", () => {
    expect(kb.handle({ key: "Tab" })).toEqual({ kind: "ignored" });
    expect(kb.handle({ key: "Tab", altKey: true })).toEqual({ kind: "ignored" });
  });
  it("leaves browser shortcuts alone", () => {
    expect(kb.handle({ key: "c", ctrlKey: true })).toEqual({ kind: "ignored" });
    expect(kb.handle({ key: "Enter", metaKey: true })).toEqual({ kind: "ignored" });
  });
  it("does not treat inherited object keys as commands", () => {
    expect(kb.handle({ key: "constructor" })).toEqual({ kind: "ignored" });
  });
});

describe("switch", () => {
  it("scans in order, wraps, and selects the highlighted action", () => {
    const sw = new SwitchAdapter();
    expect(sw.handle({ type: "step" })).toEqual({ kind: "scan", highlighted: "previous" });
    sw.handle({ type: "step" });
    expect(sw.handle({ type: "select" })).toEqual({ kind: "action", action: "choose" });
    expect(sw.highlighted()).toBe("choose");
    for (let i = 0; i < ACTION_IDS.length; i++) sw.handle({ type: "step" });
    expect(sw.highlighted()).toBe("choose");
    sw.reset();
    expect(sw.highlighted()).toBe("next");
  });
  it("maps hardware keys 1 and 2 only", () => {
    expect(switchInputFromKey("1")).toEqual({ type: "step" });
    expect(switchInputFromKey("2")).toEqual({ type: "select" });
    expect(switchInputFromKey("3")).toBeNull();
  });
});

describe("voice", () => {
  it("documents commands in each language and matches them without accents or case", () => {
    expect(new VoiceAdapter("en").commands().map((c) => c.action)).toEqual([...ACTION_IDS]);
    const fr = new VoiceAdapter("fr");
    expect(fr.handle({ transcript: "  Précédent. " })).toEqual({ kind: "action", action: "previous" });
    expect(fr.handle({ transcript: "PRECEDENT" })).toEqual({ kind: "action", action: "previous" });
    expect(fr.handle({ transcript: "sélectionner" })).toEqual({ kind: "action", action: "choose" });
  });
  it("answers help with the list, in both languages", () => {
    for (const lang of LANGS) expect(new VoiceAdapter(lang).handle({ transcript: new VoiceAdapter(lang).help()[0] ?? "" })).toEqual({ kind: "help" });
  });
  it("does not pretend to understand: unknown words run nothing", () => {
    const en = new VoiceAdapter("en");
    expect(en.handle({ transcript: "please go next quickly" })).toEqual({ kind: "unknown", heard: "please go next quickly" });
    expect(en.handle({ transcript: "" })).toEqual({ kind: "unknown", heard: "" });
    expect(en.handle({ transcript: "suivant" }).kind).toBe("unknown");
  });
  it("normalises transcripts", () => {
    expect(normaliseTranscript("  Élément,  SUIVANT! ")).toBe("element suivant");
  });
});

describe("gaze simulator", () => {
  it("selects only after the full dwell, once", () => {
    const g = new GazeSimulatorAdapter(500);
    expect(g.handle({ type: "gaze-at", target: "next", timeMs: 1000 }).kind).toBe("ignored");
    expect(g.handle({ type: "gaze-at", target: "next", timeMs: 1499 }).kind).toBe("ignored");
    expect(g.handle({ type: "gaze-at", target: "next", timeMs: 1500 })).toEqual({ kind: "action", action: "next" });
    expect(g.handle({ type: "gaze-at", target: "next", timeMs: 3000 }).kind).toBe("ignored");
    g.handle({ type: "gaze-away", timeMs: 3100 });
    g.handle({ type: "gaze-at", target: "next", timeMs: 4000 });
    expect(g.handle({ type: "gaze-at", target: "next", timeMs: 4500 }).kind).toBe("action");
  });
  it("restarts the dwell when the target changes or gaze leaves", () => {
    const g = new GazeSimulatorAdapter(500);
    g.handle({ type: "gaze-at", target: "next", timeMs: 0 });
    expect(g.handle({ type: "gaze-at", target: "clear", timeMs: 400 }).kind).toBe("ignored");
    expect(g.handle({ type: "gaze-at", target: "clear", timeMs: 899 }).kind).toBe("ignored");
    expect(g.handle({ type: "gaze-at", target: "clear", timeMs: 900 })).toEqual({ kind: "action", action: "clear" });
    g.handle({ type: "gaze-at", target: "choose", timeMs: 1000 });
    g.handle({ type: "gaze-away", timeMs: 1200 });
    expect(g.progress(1300)).toBeNull();
  });
  it("reports progress and rejects a bad dwell", () => {
    const g = new GazeSimulatorAdapter(1000);
    g.handle({ type: "gaze-at", target: "confirm", timeMs: 0 });
    expect(g.progress(250)).toEqual({ target: "confirm", fraction: 0.25 });
    expect(() => new GazeSimulatorAdapter(0)).toThrow(RangeError);
  });
  it("defaults to 800 ms and lets the dwell be adjusted within the UI range", () => {
    const g = new GazeSimulatorAdapter();
    expect(g.dwellMs).toBe(800);
    g.handle({ type: "gaze-at", target: "next", timeMs: 0 });
    expect(g.setDwellMs(1200)).toBe(1200);
    expect(g.dwellMs).toBe(1200);
    expect(g.progress(400)).toBeNull();
    expect(g.setDwellMs(50)).toBe(200);
    expect(g.setDwellMs(4000)).toBe(4000);
    expect(g.setDwellMs(9000)).toBe(8000);
    expect(g.setDwellMs(0)).toBe(0);
    g.handle({ type: "gaze-at", target: "confirm", timeMs: 0 });
    expect(g.handle({ type: "gaze-at", target: "confirm", timeMs: 20_000 }).kind).toBe("ignored");
    expect(g.progress(20_000)).toBeNull();
  });
});
