import { useId, useLayoutEffect, useState } from "react";
import {
  PACKING_LIMITS, PackingError, addBag, addItem, createPackingList, filterItems,
  moveItem, nextId, removeBag, removeItem, renameBag, renameList, reorderBag,
  reorderItem, stageStatus, summarizeList, updateItem,
  type PackingFilter, type PackingList, type PackingStage,
} from "./model";
import { ItemForm, MoveForm, NameForm, RemovalPrompt } from "./PackingForms";
import { PackingTransfer } from "./PackingTransfer";
import { PackingWalkthrough } from "./PackingWalkthrough";
import { filterLabels, numberedNames, packingCopy, statusLabel, type PackingLanguage } from "./packingCopy";
import "./packingList.css";

type Editor = { kind: "listName" | "bagName" | "newItem" | "deleteBag" }
  | { kind: "item" | "move" | "deleteItem"; itemId: string };

function Quantity({ label, value }: { label: string; value: number | null }) {
  return <div><dt>{label}</dt><dd>{value ?? "UNKNOWN"}</dd></div>;
}

export default function PackingListPanel({ language }: { language: PackingLanguage }) {
  const c = packingCopy[language];
  const id = useId();
  const [list, setList] = useState(() => createPackingList(c.initialTitle));
  const [bagId, setBagId] = useState("");
  const [stage, setStage] = useState<PackingStage>("packing");
  const [filter, setFilter] = useState<PackingFilter>("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const [restoreVersion, setRestoreVersion] = useState(0);
  const [focusRequest, requestFocus] = useState<{ target: string } | null>(null);
  const bag = list.bags.find(entry => entry.id === bagId) ?? list.bags[0];
  const bagLabels = numberedNames(list.bags);
  const itemLabels = numberedNames(bag?.items ?? []);
  const bagIndex = bag ? list.bags.indexOf(bag) : -1;
  const summary = summarizeList(list, stage);
  const visibleItems = bag ? filterItems(bag, stage, filter) : [];
  const editing = editor !== null;

  useLayoutEffect(() => {
    if (!focusRequest) return;
    for (const key of [focusRequest.target, "bagHeading", "bagInput", "mainHeading"]) {
      const element = document.getElementById(id + key);
      if (element && !element.matches(":disabled")) {
        element.focus();
        return;
      }
    }
  }, [focusRequest, id]);

  function open(next: Editor) {
    setMessage("");
    setEditor(next);
  }

  function close(target: string) {
    setEditor(null);
    requestFocus({ target });
  }

  function change(apply: () => PackingList, success: string, target: string) {
    try {
      setList(apply());
    } catch (error) {
      if (!(error instanceof PackingError)) throw error;
      setMessage(error.code === "bag-limit" ? c.bagLimit :
        error.code === "item-limit" ? c.itemLimit : c.invalidEntry);
      return false;
    }
    setMessage(success);
    close(target);
    return true;
  }

  function restore(next: PackingList) {
    setList(next);
    setBagId(next.bags[0]?.id ?? "");
    setStage("packing");
    setFilter("all");
    setRestoreVersion(current => current + 1);
    setMessage("");
    close("mainHeading");
  }

  return <section className="packing-list" aria-labelledby={id + "mainHeading"}>
    <h2 id={id + "mainHeading"} tabIndex={-1}>{c.heading}</h2>
    <h3 dir="auto">{list.title}</h3>
    {editor?.kind === "listName" ?
      <NameForm inputId={id + "listTitle"} initial={list.title} label={c.listTitle}
        limit={PACKING_LIMITS.title} submitText={c.save} language={language}
        onSave={name => change(() => renameList(list, name), c.changedName, "renameList")}
        onCancel={() => close("renameList")} /> :
      <button id={id + "renameList"} type="button" disabled={editing}
        onClick={() => open({ kind: "listName" })}>{c.renameList}</button>}

    <div className="packing-block">
      <div hidden={editing}>
        {list.bags.length >= PACKING_LIMITS.bags ? <p>{c.bagLimit}</p> :
        <NameForm key={restoreVersion} inputId={id + "bagInput"} initial="" label={c.bagName}
          limit={PACKING_LIMITS.name} submitText={c.addBag} language={language}
          onSave={name => {
            const newId = nextId(list, "bag");
            const added = change(() => addBag(list, newId, name), c.addedBag, "addItem");
            if (added) setBagId(newId);
            return added;
          }} />}
      </div>
      {!bag && <p>{c.noBags}</p>}
      {bag && <>
        <label className="packing-field">{c.bagSelect}
          <select disabled={editing} value={bag.id} onChange={event => {
            setBagId(event.target.value);
            setMessage("");
          }}>
            {list.bags.map(entry => <option value={entry.id} key={entry.id}>{bagLabels.get(entry.id)}</option>)}
          </select>
        </label>
        <div className="packing-actions">
          <label className="packing-field">{c.review}
            <select disabled={editing} value={stage} onChange={event =>
              setStage(event.target.value as PackingStage)}>
              <option value="packing">{c.departure}</option>
              <option value="return">{c.arrival}</option>
            </select>
          </label>
          <label className="packing-field">{c.filter}
            <select disabled={editing} value={filter} onChange={event =>
              setFilter(event.target.value as PackingFilter)}>
              {Object.entries(filterLabels[language]).map(([value, label]) =>
                <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </>}
    </div>

    {bag && <div role="group" aria-labelledby={id + "bagHeading"} className="packing-block">
      <h3 dir="auto" id={id + "bagHeading"} tabIndex={-1}>{bagLabels.get(bag.id)}</h3>
      {editor?.kind === "bagName" && <NameForm inputId={id + "renameBagInput"} initial={bag.name}
        label={c.bagName} limit={PACKING_LIMITS.name} submitText={c.save} language={language}
        onSave={name => change(() => renameBag(list, bag.id, name), c.changedName, "renameBag")}
        onCancel={() => close("renameBag")} />}
      {editor?.kind === "deleteBag" && <RemovalPrompt language={language}
        question={c.removeBagPrompt(bagLabels.get(bag.id) ?? bag.name, bag.items.length)} confirmText={c.removeBag}
        onCancel={() => close("removeBag")} onConfirm={() => {
          if (change(() => removeBag(list, bag.id), c.removedBag, "bagHeading")) {
            setBagId((list.bags[bagIndex + 1] ?? list.bags[bagIndex - 1])?.id ?? "");
          }
        }} />}
      {!editing && <div className="packing-actions">
        <button type="button" id={id + "renameBag"} onClick={() => open({ kind: "bagName" })}>{c.renameBag}</button>
        <button type="button" disabled={bagIndex === 0} onClick={() =>
          change(() => reorderBag(list, bag.id, -1), c.movedBag, "bagHeading")}>{c.moveBagUp}</button>
        <button type="button" disabled={bagIndex === list.bags.length - 1} onClick={() =>
          change(() => reorderBag(list, bag.id, 1), c.movedBag, "bagHeading")}>{c.moveBagDown}</button>
        <button type="button" id={id + "removeBag"} onClick={() => open({ kind: "deleteBag" })}>{c.removeBag}</button>
      </div>}
      {editor?.kind === "newItem" && <ItemForm language={language} onCancel={() => close("addItem")}
        onSave={values => {
          const itemId = nextId(list, "item");
          if (change(() => addItem(list, bag.id, { ...values, id: itemId }), c.addedItem, "edit-" + itemId)) {
            setFilter("all");
          }
        }} />}
      {!editing && (summary.items < PACKING_LIMITS.items ?
        <button id={id + "addItem"} type="button" onClick={() => open({ kind: "newItem" })}>{c.addItem}</button> :
        <p>{c.itemLimit}</p>)}
      {!visibleItems.length && <p>{bag.items.length ? c.noMatches : c.emptyBag}</p>}
      {visibleItems.length > 0 && <ul className="packing-items">
        {visibleItems.map(item => {
          const position = bag.items.indexOf(item);
          const itemLabel = itemLabels.get(item.id) ?? item.name;
          const selected = editor && "itemId" in editor && editor.itemId === item.id;
          const itemHeading = id + "name-" + item.id;
          const editKey = "edit-" + item.id;
          const moveKey = "move-" + item.id;
          const deleteKey = "delete-" + item.id;
          return <li key={item.id}>
            <div role="group" aria-labelledby={itemHeading} className="packing-entry">
              <h4 id={itemHeading} dir="auto">{itemLabel}</h4>
              <p>{statusLabel(stageStatus(item, stage), language)}</p>
              <dl className="packing-counts">
                <Quantity label={c.planned} value={item.quantity} />
                <Quantity label={c.packed} value={item.packed} />
                <Quantity label={c.returned} value={item.returned} />
              </dl>
              {item.note && <p dir="auto" className="packing-note">{item.note}</p>}
              {selected && editor.kind === "item" && <ItemForm language={language} item={item}
                onCancel={() => close(editKey)} onSave={values =>
                  change(() => updateItem(list, item.id, values), c.savedItem, editKey)} />}
              {selected && editor.kind === "move" && <MoveForm language={language}
                bags={list.bags.filter(entry => entry.id !== bag.id)} labels={bagLabels} onCancel={() => close(moveKey)}
                onMove={destination => {
                  const target = list.bags.find(entry => entry.id === destination);
                  if (target && change(() => moveItem(list, item.id, target.id), c.movedTo(bagLabels.get(target.id) ?? target.name), editKey)) {
                    setBagId(target.id);
                  }
                }} />}
              {selected && editor.kind === "deleteItem" && <RemovalPrompt language={language}
                question={c.removeItemPrompt(itemLabel)} confirmText={c.removeItem}
                onCancel={() => close(deleteKey)} onConfirm={() =>
                  change(() => removeItem(list, item.id), c.removedItem, "addItem")} />}
              {!editing && <div className="packing-actions">
                <button type="button" id={id + editKey} onClick={() => open({ kind: "item", itemId: item.id })}>{c.editItem}</button>
                <button type="button" id={id + moveKey} disabled={list.bags.length === 1}
                  onClick={() => open({ kind: "move", itemId: item.id })}>{c.moveItem}</button>
                <button type="button" disabled={filter !== "all" || position === 0} onClick={() =>
                  change(() => reorderItem(list, item.id, -1), c.movedItem, editKey)}>{c.earlier}</button>
                <button type="button" disabled={filter !== "all" || position === bag.items.length - 1} onClick={() =>
                  change(() => reorderItem(list, item.id, 1), c.movedItem, editKey)}>{c.later}</button>
                <button type="button" id={id + deleteKey}
                  onClick={() => open({ kind: "deleteItem", itemId: item.id })}>{c.removeItem}</button>
              </div>}
            </div>
          </li>;
        })}
      </ul>}
    </div>}
    {bag && <section aria-labelledby={id + "summary"}>
      <h3 id={id + "summary"}>{c.summary}</h3>
      <dl className="packing-counts">
        <Quantity label={c.summaryItems} value={summary.items} />
        <Quantity label={stage === "packing" ? c.expectedPacking : c.expectedReturn} value={summary.expectedCount} />
        <Quantity label={stage === "packing" ? c.knownPacking : c.knownReturn} value={summary.knownCount} />
        <Quantity label={c.unrecorded} value={summary.unknown} />
        <Quantity label={stage === "packing" ? c.remainingPacking : c.remainingReturn} value={summary.remainingCount} />
      </dl>
    </section>}
    <p role="status" aria-live="polite" className="packing-feedback">{message}</p>
    <fieldset className="packing-auxiliary" disabled={editing}>
      <PackingWalkthrough key={restoreVersion} list={list} onChange={setList} language={language} />
      <PackingTransfer list={list} onRestore={restore} language={language} />
    </fieldset>
  </section>;
}
