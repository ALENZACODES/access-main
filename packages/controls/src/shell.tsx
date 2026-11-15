import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GazeSimulatorAdapter } from "./adapters/gaze.ts";
import { KeyboardAdapter } from "./adapters/keyboard.ts";
import { SwitchAdapter, switchInputFromKey } from "./adapters/switch.ts";
import { VoiceAdapter } from "./adapters/voice.ts";
import { actionLabel, quote, t, type Lang } from "./i18n/catalog.ts";
import { ACTION_IDS, CONTROL_MODES, type ActionId, type AdapterResult, type ControlMode } from "./types.ts";

export interface ControlShellProps {
  lang: Lang;
  /** Runs an action on the widget and returns the sentence to announce. */
  onAction: (action: ActionId) => string;
  initialMode?: ControlMode;
  /** The widget. Every mode drives it through onAction only. */
  children: ReactNode;
}

type Deliver = (result: AdapterResult) => void;

const AnnounceContext = createContext<(text: string) => void>(() => undefined);

/** For widgets inside the shell: announce the result of a direct click or tap in the shared status region. */
export function useAnnounce(): (text: string) => void {
  return useContext(AnnounceContext);
}

function tagOf(target: EventTarget | null): string {
  return target instanceof Element ? target.tagName : "";
}

function isFormControl(target: EventTarget | null): boolean {
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagOf(target));
}

function isTextEntry(target: EventTarget | null): boolean {
  if (tagOf(target) === "TEXTAREA") return true;
  return target instanceof HTMLInputElement && !["radio", "checkbox", "button", "submit"].includes(target.type);
}

export function ControlShell({ lang, onAction, initialMode = "keyboard", children }: ControlShellProps) {
  const [mode, setMode] = useState<ControlMode>(initialMode);
  const [announcement, setAnnouncement] = useState<{ lang: Lang; text: string } | null>(null);
  const [, setTick] = useState(0);
  const [keyboard] = useState(() => new KeyboardAdapter());
  const [switchAdapter] = useState(() => new SwitchAdapter());
  const [gaze] = useState(() => new GazeSimulatorAdapter());
  const voice = useMemo(() => new VoiceAdapter(lang), [lang]);
  const rootRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((text: string) => setAnnouncement({ lang, text }), [lang]);

  const deliver = useCallback<Deliver>(
    (result) => {
      if (result.kind === "action") announce(onAction(result.action));
      else if (result.kind === "scan") announce(t(lang, "switch.highlight", { label: actionLabel(lang, result.highlighted) }));
      setTick((n) => n + 1);
    },
    [announce, lang, onAction],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (mode === "keyboard") {
        if (!widgetRef.current?.contains(event.target as Node) || isFormControl(event.target)) return;
        const result = keyboard.handle(event);
        if (result.kind === "action") {
          event.preventDefault();
          deliver(result);
        }
      } else if (mode === "switch") {
        if (isTextEntry(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
        const input = switchInputFromKey(event.key);
        if (!input) return;
        event.preventDefault();
        deliver(switchAdapter.handle(input));
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [mode, keyboard, switchAdapter, deliver]);

  const selectMode = (next: ControlMode) => {
    switchAdapter.reset();
    gaze.reset();
    setMode(next);
  };

  const shown = announcement && announcement.lang === lang ? announcement.text : t(lang, "announce.none");

  return (
    <div ref={rootRef} className="shell">
      <fieldset className="modes">
        <legend>{t(lang, "mode.legend")}</legend>
        {CONTROL_MODES.map((candidate) => (
          <label key={candidate} className="mode-option">
            <input
              type="radio"
              name="control-mode"
              value={candidate}
              data-testid={`mode-${candidate}`}
              checked={mode === candidate}
              onChange={() => selectMode(candidate)}
            />
            <span>{t(lang, `mode.${candidate}`)}</span>
          </label>
        ))}
      </fieldset>

      <section className="panel" aria-labelledby="panel-heading">
        <h2 id="panel-heading">{t(lang, "panel.heading", { mode: t(lang, `mode.${mode}`) })}</h2>
        {mode === "keyboard" && <KeyboardPanel lang={lang} />}
        {mode === "switch" && <SwitchPanel lang={lang} adapter={switchAdapter} deliver={deliver} />}
        {mode === "voice" && <VoicePanel lang={lang} adapter={voice} onAction={onAction} announce={announce} />}
        {mode === "gaze" && <GazePanel lang={lang} adapter={gaze} deliver={deliver} />}
      </section>

      <p role="status" className="announcement" data-testid="announcement">
        {shown}
      </p>

      <div ref={widgetRef} className="widget-region">
        <AnnounceContext.Provider value={announce}>{children}</AnnounceContext.Provider>
      </div>
    </div>
  );
}

function KeyboardPanel({ lang }: { lang: Lang }) {
  return (
    <>
      <p>{t(lang, "keyboard.intro")}</p>
      <ul>
        {ACTION_IDS.map((action) => (
          <li key={action}>{t(lang, "row", { label: actionLabel(lang, action), value: t(lang, `keyboard.keys.${action}`) })}</li>
        ))}
      </ul>
    </>
  );
}

function SwitchPanel({ lang, adapter, deliver }: { lang: Lang; adapter: SwitchAdapter; deliver: Deliver }) {
  const highlighted = adapter.highlighted();
  return (
    <>
      <p>{t(lang, "switch.intro")}</p>
      <div className="button-row">
        <button type="button" className="big" data-testid="switch-step" onClick={() => deliver(adapter.handle({ type: "step" }))}>
          {t(lang, "switch.step")}
        </button>
        <button type="button" className="big" data-testid="switch-select" onClick={() => deliver(adapter.handle({ type: "select" }))}>
          {t(lang, "switch.select")}
        </button>
      </div>
      <p>{t(lang, "switch.keys")}</p>
      <h3>{t(lang, "switch.listHeading")}</h3>
      <ol>
        {ACTION_IDS.map((action) => (
          <li key={action} data-highlighted={action === highlighted} className={action === highlighted ? "scan-current" : undefined}>
            {actionLabel(lang, action)}
            {action === highlighted ? ` ${t(lang, "switch.current")}` : ""}
          </li>
        ))}
      </ol>
    </>
  );
}

function VoicePanel(props: { lang: Lang; adapter: VoiceAdapter; onAction: (a: ActionId) => string; announce: (text: string) => void }) {
  const { lang, adapter, onAction, announce } = props;
  const [text, setText] = useState("");
  const list = adapter.commands();
  const asQuoted = (words: string[]) => words.map((word) => quote(lang, word)).join(", ");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = adapter.handle({ transcript: text });
    const heard = text.trim();
    if (result.kind === "action") {
      announce(`${t(lang, "voice.heard", { heard: quote(lang, heard) })} ${onAction(result.action)}`);
    } else if (result.kind === "help") {
      const names = [...list.map((command) => command.words[0] ?? ""), adapter.help()[0] ?? ""];
      announce(t(lang, "voice.help", { list: names.map((word) => quote(lang, word)).join(", ") }));
    } else if (heard === "") {
      announce(t(lang, "voice.empty"));
    } else {
      announce(t(lang, "voice.unknown", { heard: quote(lang, heard), help: quote(lang, adapter.help()[0] ?? "") }));
    }
    setText("");
  };

  return (
    <>
      <p>{t(lang, "voice.intro")}</p>
      <form onSubmit={submit} className="voice-form">
        <label htmlFor="voice-input">{t(lang, "voice.label")}</label>
        <input id="voice-input" data-testid="voice-input" type="text" value={text} autoComplete="off" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="big" data-testid="voice-send">
          {t(lang, "voice.send")}
        </button>
      </form>
      <h3>{t(lang, "voice.listHeading")}</h3>
      <ul>
        {list.map((command) => (
          <li key={command.action}>{t(lang, "row", { label: actionLabel(lang, command.action), value: asQuoted(command.words) })}</li>
        ))}
        <li>{t(lang, "row", { label: t(lang, "voice.helpRow"), value: asQuoted(adapter.help()) })}</li>
      </ul>
    </>
  );
}

function GazePanel({ lang, adapter, deliver }: { lang: Lang; adapter: GazeSimulatorAdapter; deliver: Deliver }) {
  const [view, setView] = useState<{ target: ActionId; percent: number } | null>(null);
  const hovered = useRef<ActionId | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const feed = useCallback(
    (target: ActionId) => {
      const now = performance.now();
      const result = adapter.handle({ type: "gaze-at", target, timeMs: now });
      if (result.kind === "action") deliver(result);
      const progress = adapter.progress(now);
      setView(progress ? { target: progress.target, percent: Math.round(progress.fraction * 100) } : null);
    },
    [adapter, deliver],
  );

  const enter = (target: ActionId) => {
    hovered.current = target;
    stop();
    feed(target);
    timer.current = window.setInterval(() => {
      if (hovered.current) feed(hovered.current);
    }, 100);
  };

  const leave = () => {
    hovered.current = null;
    stop();
    adapter.handle({ type: "gaze-away", timeMs: performance.now() });
    setView(null);
  };

  useEffect(
    () => () => {
      stop();
      adapter.reset();
    },
    [stop, adapter],
  );

  const seconds = new Intl.NumberFormat(lang).format(adapter.dwellMs / 1000);
  return (
    <>
      <p>{t(lang, "gaze.intro")}</p>
      <p>{t(lang, "gaze.dwellInfo", { seconds })}</p>
      <div className="button-row">
        {ACTION_IDS.map((action) => (
          <button
            key={action}
            type="button"
            className="big gaze-target"
            data-testid={`gaze-${action}`}
            onPointerEnter={() => enter(action)}
            onPointerLeave={leave}
            onClick={() => deliver({ kind: "action", action })}
          >
            {actionLabel(lang, action)}
          </button>
        ))}
      </div>
      <p data-testid="gaze-progress">
        {view ? t(lang, "gaze.progress", { label: actionLabel(lang, view.target), percent: view.percent }) : t(lang, "gaze.idle")}
      </p>
    </>
  );
}
