import { useEffect, useId, useRef, useState } from "react";
import { stageStatus, updateItem, type PackingItem, type PackingList } from "./model";

import { numberedNames } from "./packingCopy";

type Stage = "packing" | "return";
type Language = "en" | "fr";
type LocatedItem = { bagLabel: string; itemLabel: string; item: PackingItem };
interface Pass {
  stage: Stage;
  remaining: string[];
  recorded: number;
  skipped: number;
  paused: boolean;
}

const words = {
  en: {
    title: "Check one item at a time",
    description: "Choose a pass through your bags. You can skip an item or pause partway through.",
    outstanding: "Only items still to check",
    pack: "Start packing check",
    back: "Start return check",
    noItems: "Add an item to a bag to start a check.",
    packTitle: "Packing check",
    returnTitle: "Return check",
    bag: "Bag",
    planned: "Planned",
    packed: "Packed",
    returned: "Returned",
    count: "Count for this item",
    record: "Record and continue",
    skip: "Skip this item",
    pause: "Pause check",
    resume: "Resume check",
    finish: "End check",
    close: "Back to checks",
    paused: "Check paused",
    done: "End of check",
    recorded: "Counts recorded",
    skipped: "Items skipped",
    left: "Items left in this pass",
    recordPacked: "Record a packed quantity before counting returns for this item.",
    invalid: (min: number, max: number) => `Enter a whole number from ${min} to ${max}.`,
    all: (max: number) => `Record all ${max} and continue`,
  },
  fr: {
    title: "Compter les articles un à un",
    description: "Choisissez une étape pour parcourir vos sacs. Vous pouvez passer un article ou faire une pause.",
    outstanding: "Seulement les articles qu’il reste à compter",
    pack: "Commencer le décompte au départ",
    back: "Commencer le décompte au retour",
    noItems: "Ajoutez un article dans un sac pour commencer.",
    packTitle: "Décompte au départ",
    returnTitle: "Décompte au retour",
    bag: "Sac",
    planned: "Quantité prévue",
    packed: "Quantité emballée",
    returned: "Quantité rapportée",
    count: "Quantité pour cet article",
    record: "Enregistrer et continuer",
    skip: "Passer cet article",
    pause: "Faire une pause",
    resume: "Reprendre le décompte",
    finish: "Terminer le décompte",
    close: "Revenir aux décomptes",
    paused: "Décompte en pause",
    done: "Fin du décompte",
    recorded: "Quantités enregistrées",
    skipped: "Articles passés",
    left: "Articles restants dans ce décompte",
    recordPacked: "Indiquez la quantité emballée avant de compter les retours pour cet article.",
    invalid: (min: number, max: number) => `Saisissez un nombre entier entre ${min} et ${max}.`,
    all: (max: number) => `Enregistrer la quantité totale de ${max} et continuer`,
  },
};

const targetStyle = { minHeight: 44, minWidth: 44 };
type Words = typeof words.en;

function CountStep({ row, stage, c, onRecord, onSkip }: {
  row: LocatedItem;
  stage: Stage;
  c: Words;
  onRecord(value: number): void;
  onSkip(): void;
}) {
  const { item, bagLabel } = row;
  const existing = stage === "packing" ? item.packed : item.returned;
  const min = stage === "packing" ? item.returned ?? 0 : 0;
  const max = stage === "packing" ? item.quantity : item.packed;
  const [draft, setDraft] = useState(existing === null ? "" : String(existing));
  const [invalid, setInvalid] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const errorId = useId();
  function recordDraft() {
    const value = Number(draft);
    if (max === null || !/^\d+$/.test(draft) || !Number.isSafeInteger(value) || value < min || value > max) {
      setInvalid(true);
      field.current?.focus();
      return;
    }
    onRecord(value);
  }
  return <>
    <dl>
      <dt>{c.bag}</dt><dd dir="auto">{bagLabel}</dd>
      <dt>{c.planned}</dt><dd>{item.quantity}</dd>
      <dt>{c.packed}</dt><dd>{item.packed ?? "UNKNOWN"}</dd>
      <dt>{c.returned}</dt><dd>{item.returned ?? "UNKNOWN"}</dd>
    </dl>
    {max === null ? <p>{c.recordPacked}</p> :
      <form className="stack" noValidate onSubmit={(event) => { event.preventDefault(); recordDraft(); }}>
        <label>
          {c.count}
          <input ref={field} type="number" inputMode="numeric" step={1} min={min} max={max} value={draft}
            style={targetStyle} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => { setDraft(event.target.value); setInvalid(false); }} />
        </label>
        {invalid && <p id={errorId} role="status">{c.invalid(min, max)}</p>}
        <div className="button-row">
          <button type="submit" style={targetStyle}>{c.record}</button>
          <button type="button" style={targetStyle} onClick={() => onRecord(max)}>{c.all(max)}</button>
        </div>
      </form>}
    <button type="button" style={targetStyle} onClick={onSkip}>{c.skip}</button>
  </>;
}

export function PackingWalkthrough({ list, language, onChange }: {
  list: PackingList;
  language: Language;
  onChange(list: PackingList): void;
}) {
  const c = words[language];
  const [onlyOutstanding, setOnlyOutstanding] = useState(true);
  const [pass, setPass] = useState<Pass | null>(null);
  const headingId = useId();
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const packButton = useRef<HTMLButtonElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const lastStage = useRef<Stage>("packing");
  const moveFocus = useRef(false);
  const bagLabels = numberedNames(list.bags);
  const rows = list.bags.flatMap((bag) => {
    const itemLabels = numberedNames(bag.items);
    return bag.items.map((item) => ({
      bagLabel: bagLabels.get(bag.id) ?? bag.name,
      itemLabel: itemLabels.get(item.id) ?? item.name,
      item,
    }));
  });
  const byId = new Map(rows.map((row) => [row.item.id, row]));
  const remaining = pass?.remaining.filter((id) => byId.has(id)) ?? [];
  // An item removed mid-pass must stay out even if a later addition reuses its ID.
  if (pass && remaining.length !== pass.remaining.length) {
    setPass({ ...pass, remaining });
  }
  const current = remaining[0] === undefined ? undefined : byId.get(remaining[0]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    const trigger = lastStage.current === "packing" ? packButton : returnButton;
    (stepHeading.current ?? trigger.current)?.focus();
  }, [pass]);

  function transition(next: Pass | null) {
    moveFocus.current = true;
    setPass(next);
  }

  function start(stage: Stage) {
    lastStage.current = stage;
    const ids = rows
      .filter(({ item }) => !onlyOutstanding || stageStatus(item, stage) !== "complete")
      .map(({ item }) => item.id);
    transition({ stage, remaining: ids, recorded: 0, skipped: 0, paused: false });
  }

  function advance(count: number | null) {
    if (!pass || !current) return;
    if (count !== null) {
      const patch = pass.stage === "packing" ? { packed: count } : { returned: count };
      onChange(updateItem(list, current.item.id, patch));
    }
    transition({
      ...pass,
      remaining: remaining.slice(1),
      recorded: pass.recorded + Number(count !== null),
      skipped: pass.skipped + Number(count === null),
    });
  }

  return <section className="stack" aria-labelledby={headingId}>
    <h3 id={headingId}>{c.title}</h3>
    {!pass ? <>
      <p>{rows.length ? c.description : c.noItems}</p>
      <label style={{ minHeight: 44, display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input type="checkbox" checked={onlyOutstanding} onChange={(event) => setOnlyOutstanding(event.target.checked)} />
        {c.outstanding}
      </label>
      <div className="button-row">
        <button ref={packButton} type="button" style={targetStyle} disabled={!rows.length} onClick={() => start("packing")}>{c.pack}</button>
        <button ref={returnButton} type="button" style={targetStyle} disabled={!rows.length} onClick={() => start("return")}>{c.back}</button>
      </div>
    </> : <>
      <p>{pass.stage === "packing" ? c.packTitle : c.returnTitle}</p>
      <h4 dir="auto" ref={stepHeading} tabIndex={-1}>{!current ? c.done : pass.paused ? c.paused : current.itemLabel}</h4>
      {current && <div hidden={pass.paused}><CountStep
        key={JSON.stringify([current.item.id, pass.stage, current.item.quantity, current.item.packed, current.item.returned])}
        row={current} stage={pass.stage} c={c} onRecord={advance} onSkip={() => advance(null)} /></div>}
      <dl>
        <dt>{c.left}</dt><dd>{remaining.length}</dd>
        <dt>{c.recorded}</dt><dd>{pass.recorded}</dd>
        <dt>{c.skipped}</dt><dd>{pass.skipped}</dd>
      </dl>
      <div className="button-row">
        {current && <button type="button" style={targetStyle} onClick={() => transition({ ...pass, paused: !pass.paused })}>
          {pass.paused ? c.resume : c.pause}
        </button>}
        <button type="button" style={targetStyle} onClick={() => transition(null)}>{current ? c.finish : c.close}</button>
      </div>
    </>}
  </section>;
}
