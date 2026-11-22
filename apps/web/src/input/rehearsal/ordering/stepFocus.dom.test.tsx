/** @vitest-environment jsdom */
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessRehearsalPage } from '../AccessRehearsalPage.tsx';
import type { Locale } from '../model.ts';

afterEach(cleanup);

async function openPage(lang: Locale = 'en') {
  const i18n = createInstance();
  await i18n.init({
    lng: lang, fallbackLng: 'en', resources: { en: { translation: {} }, fr: { translation: {} } },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><AccessRehearsalPage /></MemoryRouter>
    </I18nextProvider>,
  );
  return i18n;
}

const button = (name: string) => screen.getByRole('button', { name });
const field = (name: string) => screen.getByLabelText(name, { exact: true });
const change = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
function click(name: string) {
  const target = button(name);
  target.focus();
  fireEvent.click(target);
}
const edit = (position: number, name: string) => `Edit step ${position} — ${name}`;
const remove = (position: number, name: string) => `Remove step ${position} — ${name}`;
const english = 'Step name in English';
const french = 'Step name in French';
const details = 'Details in English';
const frenchDetails = 'Details in French';

function enterFields(name: string, labelFr = name) {
  change(english, name);
  change(french, labelFr);
  change(details, `Details for ${name}`);
  change(frenchDetails, `Consigne pour ${labelFr}`);
}
function add(name: string, labelFr = name) {
  enterFields(name, labelFr);
  click('Add step');
}
function scanPanel() {
  return within(screen.getByRole('region', { name: 'Keyboard and switch controls' }));
}

describe('focus on the rehearsal step editor', () => {
  it('points to each first missing field and associates the message only with invalid inputs', async () => {
    await openPage();
    const pass = [[english, 'Read'], [french, 'Lire'], [details, 'Read the title'], [frenchDetails, 'Lire le titre']] as const;
    for (const [name, value] of pass) {
      click('Add step');
      const invalid = field(name);
      expect(document.activeElement).toBe(invalid);
      expect(invalid.getAttribute('aria-invalid')).toBe('true');
      expect(invalid.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
      change(name, value);
      expect(invalid.getAttribute('aria-invalid')).toBe('false');
      expect(invalid.hasAttribute('aria-describedby')).toBe(false);
    }
    click('Add step');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.activeElement).toBe(button(edit(1, 'Read')));
  });

  it('returns to the first incomplete input on repeated submission without selecting another step', async () => {
    await openPage();
    add('Read');
    click(edit(1, 'Read'));
    change(french, '   ');
    click('Save step');
    expect(document.activeElement).toBe(field(french));
    click('Save step');
    expect(document.activeElement).toBe(field(french));
    expect(button(edit(1, 'Read'))).toBeDefined();
    expect((field(english) as HTMLInputElement).value).toBe('Read');
  });

  it('puts focus on the row after adding and on the language field when editing', async () => {
    await openPage();
    add('Read');
    expect(document.activeElement).toBe(button(edit(1, 'Read')));
    expect(screen.getByText('Added step “Read”.').getAttribute('role')).toBe('status');
    click(edit(1, 'Read'));
    expect(document.activeElement).toBe(field(english));
    expect((field(details) as HTMLTextAreaElement).value).toBe('Details for Read');
    change(english, 'Read carefully');
    click('Save step');
    expect(document.activeElement).toBe(button(edit(1, 'Read carefully')));
    expect(screen.getByText('Updated step “Read carefully”.')).toBeDefined();
    expect(screen.queryByRole('button', { name: edit(1, 'Read') })).toBeNull();
  });

  it('cancels an edit back to the invoking row when another step has the same name', async () => {
    await openPage();
    add('Review', 'Premier');
    add('Review', 'Deuxième');
    click(edit(2, 'Review'));
    change(details, 'Discard this change');
    fireEvent.click(within(screen.getByRole('region', { name: 'Journey steps' })).getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(button(edit(2, 'Review')));
    click(edit(2, 'Review'));
    expect((field(french) as HTMLInputElement).value).toBe('Deuxième');
    expect((field(details) as HTMLTextAreaElement).value).toBe('Details for Review');
  });

  it('returns to a clean entry field when cancelling a new step', async () => {
    await openPage();
    change(english, 'Unfinished');
    const region = within(screen.getByRole('region', { name: 'Journey steps' }));
    fireEvent.click(region.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(field(english));
    expect((field(english) as HTMLInputElement).value).toBe('');
    expect(screen.getByText('No steps yet.')).toBeDefined();
  });
});

describe('removing steps while the page is in use', () => {
  it('moves to the next edit control, then the previous one, then the empty editor', async () => {
    await openPage();
    add('Read');
    add('Pause');
    add('Finish');
    click(remove(2, 'Pause'));
    expect(document.activeElement).toBe(button(edit(2, 'Finish')));
    expect(screen.getByText('Removed step “Pause”.')).toBeDefined();
    click(remove(2, 'Finish'));
    expect(document.activeElement).toBe(button(edit(1, 'Read')));
    click(remove(1, 'Read'));
    expect(document.activeElement).toBe(field(english));
    expect(screen.getByText('No steps yet.')).toBeDefined();
  });

  it('keeps the other row’s unsaved edit when a preceding step is removed', async () => {
    await openPage();
    add('Read');
    add('Pause');
    click(edit(2, 'Pause'));
    change(details, 'Keep this draft');
    click(remove(1, 'Read'));
    expect(document.activeElement).toBe(button(edit(1, 'Pause')));
    expect((field(details) as HTMLTextAreaElement).value).toBe('Keep this draft');
    click('Save step');
    expect(document.activeElement).toBe(button(edit(1, 'Pause')));
    expect(screen.getByText('Keep this draft', { selector: 'li p' })).toBeDefined();
  });

  it('clears an editor for a deleted row and accepts a fresh step with the same label', async () => {
    await openPage();
    add('Read');
    click(edit(1, 'Read'));
    change(frenchDetails, 'Ancien brouillon');
    click(remove(1, 'Read'));
    expect(document.activeElement).toBe(field(english));
    expect((field(frenchDetails) as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByRole('button', { name: 'Save step' })).toBeNull();
    add('Read', 'Relire');
    expect(document.activeElement).toBe(button(edit(1, 'Read')));
    click(edit(1, 'Read'));
    expect((field(french) as HTMLInputElement).value).toBe('Relire');
    expect((field(frenchDetails) as HTMLTextAreaElement).value).toBe('Consigne pour Relire');
  });

  it('removes a deleted scan target from both the cursor and the selected-step announcement', async () => {
    await openPage();
    add('Read');
    add('Finish');
    const scan = scanPanel();
    fireEvent.click(scan.getByRole('button', { name: 'Next' }));
    fireEvent.click(scan.getByRole('button', { name: 'Select' }));
    expect(scan.getAllByText('Selected step: Read')).toHaveLength(2);
    click(remove(1, 'Read'));
    expect(scan.queryByText('Selected step: Read')).toBeNull();
    expect((scan.getByRole('button', { name: 'Select' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(scan.getByRole('button', { name: 'Next' }));
    expect(scan.getByRole('status').textContent).toBe('Selected step: Finish');
  });

  it('keeps the page notes and the remaining steps intact after a removal', async () => {
    await openPage();
    add('Read');
    add('Finish');
    change('Additional notes', 'Review later');
    click(remove(1, 'Read'));
    expect((field('Additional notes') as HTMLTextAreaElement).value).toBe('Review later');
    expect(screen.getByText('Details for Finish', { selector: 'li p' })).toBeDefined();
  });
});

describe('language and accessible names throughout an edit', () => {
  it('updates contextual names in place and retains focus and the stored label in each language', async () => {
    const i18n = await openPage();
    add('Review', 'Relire');
    const original = button(edit(1, 'Review'));
    expect(document.activeElement).toBe(original);
    await act(() => i18n.changeLanguage('fr').then(() => undefined));
    const translated = button('Modifier l’étape 1 — Relire');
    expect(document.activeElement).toBe(translated);
    expect(translated).toBe(original);
    expect(screen.getByText('Étape ajoutée\u00a0: «\u00a0Relire\u00a0».', { normalizer: value => value })).toBeDefined();
    click('Modifier l’étape 1 — Relire');
    expect(document.activeElement).toBe(field('Nom de l’étape en anglais'));
    click('Enregistrer l’étape');
    expect(document.activeElement).toBe(translated);
  });

  it('keeps stable enum values while localizing their option labels and the scan status', async () => {
    const i18n = await openPage();
    add('Read', 'Lire');
    click(edit(1, 'Read'));
    change('Information status', 'limited');
    change('Evidence tier', 'COMMUNITY');
    change('Offline copy status', 'stored');
    await act(() => i18n.changeLanguage('fr').then(() => undefined));
    const selectedOption = (label: string) => (field(label) as HTMLSelectElement).selectedOptions[0];
    expect(selectedOption('État de l’information')?.textContent).toBe('LIMITÉ');
    expect(selectedOption('Niveau de preuve')?.textContent).toBe('COMMUNAUTAIRE');
    expect(selectedOption('État de la copie hors ligne')?.textContent).toBe('Enregistrée');
    click('Enregistrer l’étape');
    const scanner = within(screen.getByRole('region', { name: 'Commandes au clavier et par balayage' }));
    fireEvent.click(scanner.getByRole('button', { name: 'Suivant' }));
    expect(scanner.getByRole('status').textContent).toBe('Étape sélectionnée\u00a0: Lire');
  });
});
