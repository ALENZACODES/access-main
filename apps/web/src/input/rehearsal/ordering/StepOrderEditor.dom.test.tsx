/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Locale, Step } from '../model';
import { StepOrderEditor } from './StepOrderEditor';

function example(id: string, en: string, fr: string, sequence: number): Step {
  return {
    id, sequence, label: { en, fr }, detail: { en: 'Practice step', fr: 'Étape d’exercice' },
    kind: 'custom', access: 'unknown', source: null, offline: { state: 'unknown' }, needsReview: true,
  };
}

const first = example('start', 'Prepare', 'Préparer', 0);
const second = example('middle', 'Pause', 'Faire une pause', 1);
const third = example('end', 'Review', 'Relire', 2);
const steps = [first, second, third];

// jsdom exposes HTMLDialogElement but does not yet implement its modal methods.
// The browser tests exercise native showModal, the top layer and the Escape key.
const prototype = HTMLDialogElement.prototype;
const oldShow = Object.getOwnPropertyDescriptor(prototype, 'showModal');
const oldClose = Object.getOwnPropertyDescriptor(prototype, 'close');
beforeAll(() => {
  if (!oldShow) Object.defineProperty(prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
  });
  if (!oldClose) Object.defineProperty(prototype, 'close', {
    configurable: true, value(this: HTMLDialogElement) { this.open = false; },
  });
});

afterEach(cleanup);
afterAll(() => {
  if (!oldShow) Reflect.deleteProperty(prototype, 'showModal');
  if (!oldClose) Reflect.deleteProperty(prototype, 'close');
});

function show(initialSteps: readonly Step[] = steps, initialLocale: Locale = 'en') {
  const onApply = vi.fn<(order: readonly string[]) => void>();
  const component = (items: readonly Step[], locale: Locale) =>
    <StepOrderEditor steps={items} locale={locale} onApply={onApply} />;
  const view = render(component(initialSteps, initialLocale));
  const opener = screen.getByRole('button', {
    name: initialLocale === 'en' ? 'Edit step order' : 'Modifier l’ordre des étapes',
  });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog');
  const content = within(dialog);
  return {
    onApply, opener, dialog,
    button: (name: string) => content.getByRole<HTMLButtonElement>('button', { name }),
    field: (name: string) => content.getByRole<HTMLSelectElement>('combobox', { name }),
    rows: () => content.getAllByRole('listitem').map(row => row.querySelector('strong')?.textContent),
    announcement: () => content.getByRole('status').textContent,
    update: (items: readonly Step[], locale: Locale = initialLocale) => view.rerender(component(items, locale)),
  };
}

type Editor = ReturnType<typeof show>;
function click(editor: Editor, name: string) {
  const button = editor.button(name);
  button.focus();
  fireEvent.click(button);
}

function choose(editor: Editor, field: string, id: string) {
  fireEvent.change(editor.field(field), { target: { value: id } });
}

describe('step order dialog and focus', () => {
  it('associates the opener, dialog title, instructions and the native selector', () => {
    const editor = show();
    expect(editor.opener.getAttribute('aria-controls')).toBe(editor.dialog.id);
    expect(editor.opener.getAttribute('aria-haspopup')).toBe('dialog');
    expect(editor.opener.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Edit step order' })).toBe(editor.dialog);
    const descriptionId = editor.dialog.getAttribute('aria-describedby')!;
    expect(document.getElementById(descriptionId)?.textContent).toContain('choose a reference');
    expect(document.activeElement).toBe(editor.field('Step to move'));
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(editor.announcement()).toContain('Prepare, position 1 of 3.');
  });

  it('wraps Tab at the last enabled control and Shift+Tab at the first', () => {
    const editor = show();
    editor.button('Cancel').focus();
    fireEvent.keyDown(editor.button('Cancel'), { key: 'Tab' });
    expect(document.activeElement).toBe(editor.field('Step to move'));
    fireEvent.keyDown(editor.field('Step to move'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(editor.button('Cancel'));
    expect(fireEvent.keyDown(editor.dialog, { key: 'Tab', ctrlKey: true })).toBe(true);
  });

  it('retains focus on a move button until the selected step reaches the boundary', () => {
    const editor = show();
    click(editor, 'Move later');
    expect(document.activeElement).toBe(editor.button('Move later'));
    click(editor, 'Move later');
    expect(editor.button('Move later').disabled).toBe(true);
    expect(document.activeElement).toBe(editor.field('Step to move'));
    expect(editor.announcement()).toBe('Moved. Prepare, position 3 of 3.');
  });

  it('discards the draft on native cancellation and restores the opener', () => {
    const editor = show();
    click(editor, 'Move to end');
    fireEvent(editor.dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(editor.opener.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(editor.opener);
    expect(editor.onApply).not.toHaveBeenCalled();
    fireEvent.click(editor.opener);
    expect(editor.rows()).toEqual(['Prepare', 'Pause', 'Review']);
    expect(editor.button('Undo').disabled).toBe(true);
  });

  it('cancel returns focus and leaves the caller’s array untouched', () => {
    const editor = show();
    click(editor, 'Select Review');
    click(editor, 'Move to start');
    click(editor, 'Cancel');
    expect(editor.onApply).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editor.opener);
    expect(steps.map(step => step.id)).toEqual(['start', 'middle', 'end']);
  });
});

describe('staging an order with buttons or native selectors', () => {
  it('can select, pick a reference, move and apply using buttons only', () => {
    const editor = show();
    click(editor, 'Select Review');
    click(editor, 'Use Prepare as reference');
    expect(editor.button('Use Prepare as reference').getAttribute('aria-pressed')).toBe('true');
    expect(editor.announcement()).toBe('Reference step: Prepare.');
    click(editor, 'Place before');
    expect(editor.rows()).toEqual(['Review', 'Prepare', 'Pause']);
    expect(editor.onApply).not.toHaveBeenCalled();
    click(editor, 'Apply order');
    expect(editor.onApply.mock.calls).toEqual([[['end', 'start', 'middle']]]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(editor.opener);
  });

  it('reflects selector choices on the row buttons and keeps the reference identity after moving', () => {
    const editor = show();
    choose(editor, 'Step to move', second.id);
    choose(editor, 'Reference step', third.id);
    expect(editor.button('Select Pause').getAttribute('aria-pressed')).toBe('true');
    expect(editor.button('Select Review').getAttribute('aria-pressed')).toBe('false');
    expect(editor.button('Use Pause as reference').disabled).toBe(true);
    click(editor, 'Place after');
    expect(editor.rows()).toEqual(['Prepare', 'Review', 'Pause']);
    expect(editor.field('Reference step').value).toBe('end');
    expect(editor.field('Step to move').value).toBe('middle');
    expect(editor.button('Place after').disabled).toBe(true);
    click(editor, 'Place before');
    expect(editor.rows()).toEqual(['Prepare', 'Pause', 'Review']);
    expect(editor.button('Apply order').disabled).toBe(true);
  });

  it('never treats a selected step as its own reference', () => {
    const editor = show();
    choose(editor, 'Reference step', third.id);
    choose(editor, 'Step to move', third.id);
    const reference = editor.field('Reference step');
    expect(reference.value).toBe(first.id);
    expect(Array.from(reference.options, option => option.value)).toEqual([first.id, second.id]);
    click(editor, 'Place before');
    expect(editor.rows()).toEqual(['Review', 'Prepare', 'Pause']);
  });

  it('disables redundant boundary moves and adjacent placements', () => {
    const editor = show();
    for (const name of ['Move earlier', 'Move to start', 'Place before', 'Undo', 'Redo', 'Apply order']) {
      expect(editor.button(name).disabled, name).toBe(true);
    }
    click(editor, 'Move to end');
    for (const name of ['Move later', 'Move to end']) expect(editor.button(name).disabled, name).toBe(true);
    expect(editor.button('Undo').disabled).toBe(false);
    expect(editor.button('Apply order').disabled).toBe(false);
  });

  it('restores the moved step’s selection on undo and redo', () => {
    const editor = show();
    click(editor, 'Move later');
    click(editor, 'Select Review');
    click(editor, 'Undo');
    expect(editor.field('Step to move').value).toBe(first.id);
    expect(editor.announcement()).toBe('Move undone. Prepare, position 1 of 3.');
    expect(editor.button('Apply order').disabled).toBe(true);
    click(editor, 'Redo');
    expect(editor.rows()).toEqual(['Pause', 'Prepare', 'Review']);
    expect(editor.announcement()).toBe('Move redone. Prepare, position 2 of 3.');
  });

  it('discards the redo path after a different move', () => {
    const editor = show();
    click(editor, 'Move to end');
    click(editor, 'Undo');
    click(editor, 'Select Review');
    click(editor, 'Move earlier');
    expect(editor.button('Redo').disabled).toBe(true);
    expect(editor.rows()).toEqual(['Prepare', 'Review', 'Pause']);
  });

  it.each([
    { locale: 'en' as const, select: 'Select', firstName: 'Review (step 1)', lastName: 'Review (step 1) (step 3)', earlier: 'Move to start', apply: 'Apply order', field: 'Step to move' },
    { locale: 'fr' as const, select: 'Sélectionner', firstName: 'Relire (étape 1)', lastName: 'Relire (étape 1) (étape 3)', earlier: 'Placer au début', apply: 'Appliquer l’ordre', field: 'Étape à déplacer' },
  ])('keeps an entered ordinal label distinct from a generated one in $locale', ({
    locale, select, firstName, lastName, earlier, apply, field,
  }) => {
    const items = [
      { ...first, label: { en: 'Review', fr: 'Relire' } },
      { ...second, label: { en: 'Review', fr: 'Relire' } },
      { ...third, label: { en: 'Review (step 1)', fr: 'Relire (étape 1)' } },
    ];
    const editor = show(items, locale);
    const labels = Array.from(editor.field(field).options, option => option.text);
    expect(new Set(labels).size).toBe(items.length);
    click(editor, `${select} ${lastName}`);
    click(editor, earlier);
    expect(editor.rows().slice(0, 2)).toEqual([lastName, firstName]);
    expect(editor.field(field).value).toBe(third.id);
    click(editor, apply);
    expect(editor.onApply.mock.calls).toEqual([[['end', 'start', 'middle']]]);
  });

  it('distinguishes repeated names by their initial positions across moves', () => {
    const duplicate = { ...third, label: first.label };
    const editor = show([first, second, duplicate]);
    click(editor, 'Select Prepare (step 3)');
    click(editor, 'Use Prepare (step 1) as reference');
    click(editor, 'Place before');
    expect(editor.rows()).toEqual(['Prepare (step 3)', 'Prepare (step 1)', 'Pause']);
    expect(editor.field('Step to move').value).toBe(third.id);
    click(editor, 'Apply order');
    expect(editor.onApply.mock.calls).toEqual([[['end', 'start', 'middle']]]);
  });
});

describe('language and changes made while the dialog is open', () => {
  it('keeps the selected step, reference and staged history when language changes', () => {
    const editor = show();
    choose(editor, 'Reference step', third.id);
    click(editor, 'Move later');
    editor.update(steps, 'fr');
    expect(screen.getByRole('dialog', { name: 'Modifier l’ordre des étapes' }).lang).toBe('fr');
    expect(editor.field('Étape à déplacer').value).toBe(first.id);
    expect(editor.field('Étape de référence').value).toBe(third.id);
    expect(editor.rows()).toEqual(['Faire une pause', 'Préparer', 'Relire']);
    expect(editor.announcement()).toBe('Étape déplacée. Préparer, position 2 sur 3.');
    click(editor, 'Annuler le déplacement');
    click(editor, 'Rétablir le déplacement');
    click(editor, 'Appliquer l’ordre');
    expect(editor.onApply.mock.calls).toEqual([[['middle', 'start', 'end']]]);
  });

  it('uses French in reference announcements, including the no-break space', () => {
    const editor = show(steps, 'fr');
    click(editor, 'Prendre Relire comme référence');
    expect(editor.announcement()).toBe('Étape de référence\u00a0: Relire.');
    click(editor, 'Placer après');
    expect(editor.rows()).toEqual(['Faire une pause', 'Relire', 'Préparer']);
    click(editor, 'Fermer sans appliquer');
    expect(editor.onApply).not.toHaveBeenCalled();
  });

  it('refreshes step names without discarding the draft when identities match', () => {
    const editor = show();
    click(editor, 'Move later');
    const renamed = { ...first, label: { en: 'Gather materials', fr: 'Rassembler le matériel' } };
    editor.update([renamed, second, third]);
    expect(editor.rows()).toEqual(['Pause', 'Gather materials', 'Review']);
    expect(editor.button('Select Gather materials').getAttribute('aria-pressed')).toBe('true');
    expect(editor.button('Apply order').disabled).toBe(false);
    expect(editor.button('Undo').disabled).toBe(false);
  });

  it('blocks committing a stale permutation even when all the same steps exist', () => {
    const editor = show();
    click(editor, 'Move later');
    editor.update([third, second, first]);
    expect(editor.button('Apply order').disabled).toBe(true);
    expect(editor.button('Move to start').disabled).toBe(true);
    expect(editor.button('Undo').disabled).toBe(true);
    expect(editor.announcement()).toContain('Reload the steps');
    expect(document.activeElement).toBe(editor.button('Reload steps'));
    click(editor, 'Reload steps');
    expect(editor.rows()).toEqual(['Review', 'Pause', 'Prepare']);
    expect(editor.button('Apply order').disabled).toBe(true);
    expect(editor.button('Undo').disabled).toBe(true);
    expect(editor.announcement()).toBe('Steps reloaded. Prepare, position 3 of 3.');
    expect(document.activeElement).toBe(editor.field('Step to move'));
  });

  it('reloads after removal, choosing a surviving step and preserving its name', () => {
    const editor = show();
    click(editor, 'Select Review');
    click(editor, 'Move to start');
    editor.update([second, first]);
    expect(editor.rows()).toEqual(['Review', 'Prepare', 'Pause']);
    click(editor, 'Reload steps');
    expect(editor.rows()).toEqual(['Pause', 'Prepare']);
    expect(editor.field('Step to move').value).toBe(second.id);
    click(editor, 'Move later');
    click(editor, 'Apply order');
    expect(editor.onApply.mock.calls).toEqual([[['start', 'middle']]]);
  });

  it('permits cancellation during a conflict without emitting a stale order', () => {
    const editor = show();
    click(editor, 'Move to end');
    editor.update([]);
    click(editor, 'Cancel');
    expect(editor.onApply).not.toHaveBeenCalled();
    fireEvent.click(editor.opener);
    expect(editor.announcement()).toBe('Add two steps to change their order.');
    expect(document.activeElement).toBe(editor.button('Cancel'));
  });
});

describe('short or unusable lists', () => {
  it('explains an empty list, keeps Cancel reachable, and accepts a later added step via reload', () => {
    const editor = show([]);
    expect(editor.announcement()).toBe('Add two steps to change their order.');
    expect(editor.button('Apply order').disabled).toBe(true);
    expect(document.activeElement).toBe(editor.button('Cancel'));
    editor.update([first]);
    click(editor, 'Reload steps');
    expect(editor.rows()).toEqual(['Prepare']);
    expect(editor.announcement()).toBe('Add another step to change the order.');
    expect(editor.button('Move later').disabled).toBe(true);
  });

  it('identifies invalid IDs without rendering ambiguous controls or applying changes', () => {
    const editor = show([first, { ...third, id: first.id }]);
    expect(editor.announcement()).toContain('missing or repeated identifiers');
    expect(within(editor.dialog).queryByRole('list')).toBeNull();
    expect(editor.button('Apply order').disabled).toBe(true);
    expect(document.activeElement).toBe(editor.button('Cancel'));
    click(editor, 'Cancel');
    expect(editor.onApply).not.toHaveBeenCalled();
  });
});
