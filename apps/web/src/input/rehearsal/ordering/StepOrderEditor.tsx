import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Locale, Step } from '../model';
import { commitOrderDraft, createOrderDraft, isOrderDirty, reduceOrderDraft } from './orderDraft';
import { orderCopy, type OrderNotice } from './orderCopy';
import './orderEditor.css';

interface StepOrderEditorProps {
  readonly steps: readonly Step[];
  readonly locale: Locale;
  readonly onApply: (ids: readonly string[]) => void;
}

type OrderAction = Parameters<typeof reduceOrderDraft>[1];
type StepName = Pick<Step, 'id' | 'label'>;

function labelsById(original: readonly StepName[], current: readonly Step[], locale: Locale) {
  const currentNames = new Map(current.map(step => [step.id, step.label]));
  const names = original.map(step => {
    const label = currentNames.get(step.id) ?? step.label;
    return label[locale].trim() || 'UNKNOWN';
  });
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  // Keep positions tied to the opening order, including when a user has entered
  // a label that already looks like one of our generated disambiguators.
  const qualify = (name: string, index: number) => orderCopy[locale].duplicate(name, index + 1);
  const labels = names.map((name, index) => counts.get(name) === 1 ? name : qualify(name, index));
  const distinctLabels = new Set(labels).size === labels.length ? labels : names.map(qualify);
  return new Map(original.map((step, index) => [step.id, distinctLabels[index]!]));
}

function openDraft(steps: readonly Step[], selected?: string | null) {
  const original = steps.map(({ id, label }) => ({ id, label }));
  return { original, draft: createOrderDraft(original.map(step => step.id), selected) };
}

export function StepOrderEditor({ steps, locale, onApply }: StepOrderEditorProps) {
  const id = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const copy = orderCopy[locale];

  function openEditor() {
    dialog.current?.showModal();
    setOpen(true);
  }

  function dismiss() {
    dialog.current?.close();
    setOpen(false);
    opener.current?.focus();
  }

  function wrapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>(':is(button, select):enabled');
    const first = controls[0];
    const last = controls[controls.length - 1];
    const edge = event.shiftKey ? first : last;
    if (edge && document.activeElement === edge) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }

  return <>
    <button type="button" ref={opener} className="order-editor-trigger"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      data-a11y-safe-dialog-trigger="true" onClick={openEditor}>
      {copy.title}
    </button>
    <dialog ref={dialog} id={id} className="order-editor" lang={locale}
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-instructions`}
      onKeyDown={wrapTab} onCancel={event => { event.preventDefault(); dismiss(); }}
      onClose={() => { if (!dialog.current?.open && open) dismiss(); }}>
      <h2 id={`${id}-title`}>{copy.title}</h2>
      <p id={`${id}-instructions`}>{copy.instructions}</p>
      {open && <OrderPanel steps={steps} locale={locale} onApply={onApply} onDismiss={dismiss} />}
    </dialog>
  </>;
}

function OrderPanel({ steps, locale, onApply, onDismiss }: StepOrderEditorProps & { onDismiss: () => void }) {
  const copy = orderCopy[locale];
  const id = useId();
  const selectStep = useRef<HTMLSelectElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const clickedControl = useRef<HTMLElement | null>(null);
  const [session, setSession] = useState(() => openDraft(steps));
  const [preferredAnchor, setPreferredAnchor] = useState<string | null>(null);
  const [notice, setNotice] = useState<OrderNotice>('selected');
  const { draft, original } = session;
  const { order, selectedId } = draft;
  const labels = labelsById(original, steps, locale);
  const ids = steps.map(step => step.id);
  const result = commitOrderDraft(draft, ids);
  const invalid = !result.ok && result.reason === 'invalid';
  const conflict = !result.ok && result.reason === 'stale';
  const editable = result.ok && order.length > 1;
  const selectedIndex = selectedId === null ? -1 : order.indexOf(selectedId);
  const references = order.filter(stepId => stepId !== selectedId);
  const anchor = preferredAnchor !== null && references.includes(preferredAnchor)
    ? preferredAnchor : references[0];
  const anchorIndex = anchor === undefined ? -1 : order.indexOf(anchor);

  useLayoutEffect(() => {
    (selectStep.current ?? cancelButton.current)?.focus();
  }, []);

  // Native disabled buttons drop focus in some browsers. Keep the switch user
  // inside the editor with an actionable control after a boundary move or reload.
  useLayoutEffect(() => {
    const previous = clickedControl.current;
    if (previous && (!previous.isConnected || previous.matches(':disabled'))) {
      (reloadButton.current ?? selectStep.current ?? cancelButton.current)?.focus();
    }
    clickedControl.current = null;
  }, [session, preferredAnchor]);

  useLayoutEffect(() => {
    if (conflict) reloadButton.current?.focus();
    else if (invalid) cancelButton.current?.focus();
  }, [conflict, invalid]);

  function change(action: OrderAction, message: OrderNotice) {
    if (!result.ok) return;
    const next = reduceOrderDraft(draft, action);
    if (next === draft) return;
    clickedControl.current = document.activeElement as HTMLElement | null;
    setSession({ ...session, draft: next });
    setNotice(message);
  }

  function selectReference(stepId: string) {
    if (!editable || !references.includes(stepId)) return;
    setPreferredAnchor(stepId);
    setNotice('reference');
  }

  function reload() {
    clickedControl.current = document.activeElement as HTMLElement | null;
    setSession(openDraft(steps, selectedId));
    setPreferredAnchor(null);
    setNotice('reloaded');
  }

  function apply() {
    const current = commitOrderDraft(draft, steps.map(step => step.id));
    if (!current.ok || !isOrderDirty(draft)) return;
    onApply(current.order);
    onDismiss();
  }

  function positionMessage() {
    if (invalid) return copy.invalid;
    if (conflict) return copy.conflict;
    if (!order.length) return copy.empty;
    if (order.length === 1) return copy.single;
    if (notice === 'reference' && anchor !== undefined) {
      return copy.referenceChosen(labels.get(anchor)!);
    }
    return `${copy.notice[notice]} ${copy.position(labels.get(selectedId!)!, selectedIndex + 1, order.length)}`;
  }

  return <>
    <p role="status" aria-live="polite" aria-atomic="true">{positionMessage()}</p>
    {conflict && <button type="button" ref={reloadButton} onClick={reload}>{copy.reload}</button>}

    {!invalid && order.length > 0 && <>
      <label htmlFor={`${id}-selected`}>{copy.selected}</label>
      <select id={`${id}-selected`} ref={selectStep} value={selectedId ?? ''} disabled={!result.ok}
        onChange={event => change({ type: 'select', id: event.target.value }, 'selected')}>
        {order.map(stepId => <option key={stepId} value={stepId}>{labels.get(stepId)}</option>)}
      </select>
      <div className="order-editor-actions">
        <button type="button" disabled={!editable || selectedIndex <= 0}
          onClick={() => change({ type: 'move', direction: 'earlier' }, 'moved')}>{copy.earlier}</button>
        <button type="button" disabled={!editable || selectedIndex >= order.length - 1}
          onClick={() => change({ type: 'move', direction: 'later' }, 'moved')}>{copy.later}</button>
        <button type="button" disabled={!editable || selectedIndex <= 0}
          onClick={() => change({ type: 'move', direction: 'first' }, 'moved')}>{copy.first}</button>
        <button type="button" disabled={!editable || selectedIndex >= order.length - 1}
          onClick={() => change({ type: 'move', direction: 'last' }, 'moved')}>{copy.last}</button>
      </div>

      {anchor !== undefined && <>
        <label htmlFor={`${id}-reference`}>{copy.reference}</label>
        <select id={`${id}-reference`} value={anchor} disabled={!editable}
          onChange={event => selectReference(event.target.value)}>
          {references.map(stepId => <option key={stepId} value={stepId}>{labels.get(stepId)}</option>)}
        </select>
        <div className="order-editor-actions">
          <button type="button" disabled={!editable || selectedIndex === anchorIndex - 1}
            onClick={() => change({ type: 'place', side: 'before', anchorId: anchor }, 'moved')}>{copy.before}</button>
          <button type="button" disabled={!editable || selectedIndex === anchorIndex + 1}
            onClick={() => change({ type: 'place', side: 'after', anchorId: anchor }, 'moved')}>{copy.after}</button>
        </div>
      </>}

      <h3 id={`${id}-list`}>{copy.draft}</h3>
      <ol aria-labelledby={`${id}-list`}>
        {order.map(stepId => {
          const name = labels.get(stepId)!;
          return <li key={stepId}>
            <strong>{name}</strong>
            <div className="order-editor-actions">
              <button type="button" aria-pressed={selectedId === stepId} aria-label={copy.selectNamed(name)}
                disabled={!result.ok} onClick={() => change({ type: 'select', id: stepId }, 'selected')}>
                {copy.selectButton}
              </button>
              <button type="button" aria-pressed={stepId === anchor} disabled={!editable || selectedId === stepId}
                onClick={() => selectReference(stepId)}>{copy.referenceNamed(name)}</button>
            </div>
          </li>;
        })}
      </ol>
    </>}
    <div className="order-editor-actions">
      <button type="button" disabled={!editable || !draft.undoStack.length}
        onClick={() => change({ type: 'undo' }, 'undone')}>{copy.undo}</button>
      <button type="button" disabled={!editable || !draft.redoStack.length}
        onClick={() => change({ type: 'redo' }, 'redone')}>{copy.redo}</button>
    </div>
    <div className="order-editor-actions">
      <button type="button" disabled={!editable || !isOrderDirty(draft)} onClick={apply}>{copy.apply}</button>
      <button type="button" ref={cancelButton} onClick={onDismiss}>{copy.cancel}</button>
    </div>
  </>;
}
