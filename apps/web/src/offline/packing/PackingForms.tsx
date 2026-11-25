import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PACKING_LIMITS, type Bag, type PackingItem } from "./model";
import { packingCopy, type PackingLanguage } from "./packingCopy";

interface NameFormProps {
  initial: string;
  inputId: string;
  label: string;
  limit: number;
  submitText: string;
  language: PackingLanguage;
  onSave: (value: string) => boolean;
  onCancel?: () => void;
}

export function NameForm({ initial, inputId, label, limit, submitText, language, onSave, onCancel }: NameFormProps) {
  const c = packingCopy[language];
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editing = Boolean(onCancel);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) {
      setInvalid(true);
      input.current?.focus();
      return;
    }
    if (onSave(value) && !editing) setValue("");
  }

  return <form noValidate aria-label={submitText} onSubmit={submit} className="packing-form">
    <label htmlFor={inputId}>{label}</label>
    <input ref={input} id={inputId} type="text" maxLength={limit} required value={value}
      aria-invalid={invalid || undefined} aria-describedby={invalid ? inputId + "-error" : undefined}
      onChange={event => { setValue(event.target.value); setInvalid(false); }} />
    {invalid && <p id={inputId + "-error"} role="status">{c.requiredName}</p>}
    <div className="packing-actions">
      <button type="submit">{submitText}</button>
      {onCancel && <button type="button" onClick={onCancel}>{c.cancel}</button>}
    </div>
  </form>;
}

interface ItemFormProps {
  item?: PackingItem;
  language: PackingLanguage;
  onSave: (values: Omit<PackingItem, "id">) => void;
  onCancel: () => void;
}

type Field = "name" | "quantity" | "packed" | "returned";

export function ItemForm({ item, language, onSave, onCancel }: ItemFormProps) {
  const c = packingCopy[language];
  const id = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [quantityText, setQuantity] = useState(String(item?.quantity ?? 1));
  const [packedText, setPacked] = useState(item?.packed?.toString() ?? "");
  const [returnedText, setReturned] = useState(item?.returned?.toString() ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [invalid, setInvalid] = useState<Field | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const itemName = useRef<HTMLInputElement>(null);
  useEffect(() => { itemName.current?.focus(); }, []);

  const errors: Record<Field, string> = {
    name: c.requiredName,
    quantity: c.plannedInvalid(PACKING_LIMITS.quantity),
    packed: c.packedInvalid,
    returned: c.returnedInvalid,
  };

  function reject(field: Field) {
    setInvalid(field);
    const input = form.current?.elements.namedItem(field);
    if (input instanceof HTMLInputElement) input.focus();
  }

  function attributes(field: Field) {
    return {
      id: id + field,
      name: field,
      "aria-invalid": invalid === field || undefined,
      "aria-describedby": invalid === field ? id + "-error" : undefined,
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(quantityText);
    const packed = packedText.trim() === "" ? null : Number(packedText);
    const returned = returnedText.trim() === "" ? null : Number(returnedText);
    if (!name.trim()) return reject("name");
    if (!/^\d+$/.test(quantityText) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > PACKING_LIMITS.quantity) {
      return reject("quantity");
    }
    if (packed !== null && (!/^\d+$/.test(packedText) || !Number.isSafeInteger(packed) || packed < 0 || packed > quantity)) {
      return reject("packed");
    }
    if (returned !== null && (!/^\d+$/.test(returnedText) || !Number.isSafeInteger(returned) || packed === null || returned < 0 || returned > packed)) {
      return reject("returned");
    }
    onSave({ name, quantity, packed, returned, note });
  }

  return <form ref={form} noValidate aria-label={item ? c.editItem : c.addItem} className="packing-form" onSubmit={submit}
    onChange={() => { if (invalid) setInvalid(null); }}>
    <label htmlFor={id + "name"}>{c.name}</label>
    <input ref={itemName} {...attributes("name")} dir="auto" required maxLength={PACKING_LIMITS.name}
      value={name} onChange={event => setName(event.target.value)} />
    <label htmlFor={id + "quantity"}>{c.planned}</label>
    <input {...attributes("quantity")} inputMode="numeric" required value={quantityText}
      onChange={event => setQuantity(event.target.value)} />
    <p id={id + "-hint"}>{c.countHelp}</p>
    <label htmlFor={id + "packed"}>{c.packed}</label>
    <input {...attributes("packed")} inputMode="numeric" aria-describedby={invalid === "packed" ? id + "-error" : id + "-hint"}
      value={packedText} onChange={event => setPacked(event.target.value)} />
    <label htmlFor={id + "returned"}>{c.returned}</label>
    <input {...attributes("returned")} inputMode="numeric" aria-describedby={invalid === "returned" ? id + "-error" : id + "-hint"}
      value={returnedText} onChange={event => setReturned(event.target.value)} />
    <label htmlFor={id + "note"}>{c.note}</label>
    <textarea id={id + "note"} dir="auto" maxLength={PACKING_LIMITS.note}
      value={note} onChange={event => setNote(event.target.value)} />
    {invalid && <p role="status" id={id + "-error"}>{errors[invalid]}</p>}
    <div className="packing-actions">
      <button type="submit">{c.saveItem}</button>
      <button type="button" onClick={onCancel}>{c.cancel}</button>
    </div>
  </form>;
}

export function MoveForm({ bags, labels, language, onMove, onCancel }: {
  bags: readonly Bag[];
  labels: ReadonlyMap<string, string>;
  language: PackingLanguage;
  onMove: (bagId: string) => void;
  onCancel: () => void;
}) {
  const c = packingCopy[language];
  const id = useId();
  const [destination, setDestination] = useState(bags[0]?.id ?? "");
  const picker = useRef<HTMLSelectElement>(null);
  useEffect(() => { picker.current?.focus(); }, []);
  return <form aria-label={c.moveItem} className="packing-form"
    onSubmit={event => { event.preventDefault(); if (destination) onMove(destination); }}>
    <label htmlFor={id}>{c.destination}</label>
    <select id={id} value={destination} ref={picker} onChange={event => setDestination(event.target.value)}>
      {bags.map(bag => <option key={bag.id} value={bag.id}>{labels.get(bag.id) ?? bag.name}</option>)}
    </select>
    <div className="packing-actions">
      <button type="submit" disabled={!destination}>{c.move}</button>
      <button type="button" onClick={onCancel}>{c.cancel}</button>
    </div>
  </form>;
}

export function RemovalPrompt({ question, confirmText, language, onConfirm, onCancel }: {
  question: string;
  confirmText: string;
  language: PackingLanguage;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => { keep.current?.focus(); }, []);
  return <fieldset className="packing-form" aria-labelledby={id}>
    <legend id={id}>{question}</legend>
    <div className="packing-actions">
      <button ref={keep} type="button" onClick={onCancel}>{packingCopy[language].keep}</button>
      <button type="button" onClick={onConfirm}>{confirmText}</button>
    </div>
  </fieldset>;
}
