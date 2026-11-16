import { useCallback, useEffect, useRef, useState } from "react";
import { LANGS, t, type Lang } from "./i18n/catalog.ts";
import { ControlShell, useAnnounce } from "./shell.tsx";
import type { ActionId, ControlMode } from "./types.ts";
import { ITEM_IDS, applyAction, describeNote, initialChooserState, itemName, pickIndex, type ChooserState } from "./widget.ts";
import "./embedded.css";

function ChooserWidget(props: { lang: Lang; state: ChooserState; onPick: (index: number) => string; onAction: (a: ActionId) => string }) {
  const { lang, state, onPick, onAction } = props;
  const announce = useAnnounce();
  const current = ITEM_IDS[state.focus] as string;
  const summary =
    state.chosen === null
      ? t(lang, "widget.none")
      : t(lang, state.confirmed ? "widget.confirmed" : "widget.chosen", { name: itemName(lang, state.chosen) });
  return (
    <section
      className="widget"
      aria-labelledby="widget-title"
      data-testid="widget"
      data-focus={state.focus}
      data-chosen={state.chosen === null ? "" : (ITEM_IDS[state.chosen] as string)}
      data-confirmed={state.confirmed}
    >
      <h2 id="widget-title">{t(lang, "widget.title")}</h2>
      <p id="widget-help">{t(lang, "widget.instructions")}</p>
      <div
        className="chooser"
        role="listbox"
        tabIndex={0}
        aria-labelledby="widget-title"
        aria-describedby="widget-help"
        aria-activedescendant={`option-${current}`}
        data-testid="chooser"
      >
        {ITEM_IDS.map((id, index) => (
          <div
            key={id}
            id={`option-${id}`}
            role="option"
            aria-selected={state.chosen === index}
            className="option"
            data-current={state.focus === index}
            onClick={() => announce(onPick(index))}
          >
            {itemName(lang, index)}
          </div>
        ))}
      </div>
      <p data-testid="widget-summary">{summary}</p>
      <div className="button-row">
        <button type="button" className="big" onClick={() => announce(onAction("confirm"))}>
          {t(lang, "action.confirm")}
        </button>
        <button type="button" className="big" onClick={() => announce(onAction("clear"))}>
          {t(lang, "action.clear")}
        </button>
      </div>
    </section>
  );
}

/**
 * `embedded` mounts the chooser inside a host page (the web shell's Settings
 * route): the host owns <main>, the h1, the page title and the document
 * language, so the chooser renders a section with an h2 and leaves them alone.
 */
export function App({ initialLang = "en", initialMode = "keyboard", embedded = false }: { initialLang?: Lang; initialMode?: ControlMode; embedded?: boolean }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [state, setState] = useState<ChooserState>(initialChooserState);
  const stateRef = useRef<ChooserState>(initialChooserState);

  useEffect(() => {
    if (embedded) return;
    document.documentElement.lang = lang;
    document.title = t(lang, "app.title");
  }, [lang, embedded]);

  const commit = useCallback(
    (result: { state: ChooserState; note: Parameters<typeof describeNote>[1] }) => {
      stateRef.current = result.state;
      setState(result.state);
      return describeNote(lang, result.note);
    },
    [lang],
  );

  const onAction = useCallback((action: ActionId) => commit(applyAction(stateRef.current, action)), [commit]);
  const onPick = useCallback((index: number) => commit(pickIndex(stateRef.current, index)), [commit]);

  const Root = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  return (
    <Root className={embedded ? "controls-embedded" : undefined} aria-label={embedded ? t(lang, "app.title") : undefined} lang={embedded ? lang : undefined}>
      <Heading>{t(lang, "app.title")}</Heading>
      <p>{t(lang, "app.intro")}</p>
      <div role="group" aria-label={t(lang, "lang.label")} className="button-row">
        {LANGS.map((code) => (
          <button key={code} type="button" className="big" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
            {t(code, `lang.${code}`)}
          </button>
        ))}
      </div>
      <ControlShell lang={lang} onAction={onAction} initialMode={initialMode}>
        <ChooserWidget lang={lang} state={state} onPick={onPick} onAction={onAction} />
      </ControlShell>
      <p className="note">{t(lang, "app.demoNote")}</p>
    </Root>
  );
}
