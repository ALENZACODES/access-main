import type { Locale } from '../model';

export type OrderNotice = 'selected' | 'moved' | 'undone' | 'redone' | 'reloaded' | 'reference';

interface OrderCopy {
  readonly title: string;
  readonly instructions: string;
  readonly selected: string;
  readonly earlier: string;
  readonly later: string;
  readonly first: string;
  readonly last: string;
  readonly reference: string;
  readonly before: string;
  readonly after: string;
  readonly undo: string;
  readonly redo: string;
  readonly cancel: string;
  readonly apply: string;
  readonly draft: string;
  readonly selectButton: string;
  readonly empty: string;
  readonly single: string;
  readonly conflict: string;
  readonly invalid: string;
  readonly reload: string;
  readonly notice: Record<OrderNotice, string>;
  readonly duplicate: (name: string, originalPosition: number) => string;
  readonly position: (name: string, position: number, length: number) => string;
  readonly selectNamed: (name: string) => string;
  readonly referenceNamed: (name: string) => string;
  readonly referenceChosen: (name: string) => string;
}

export const orderCopy: Record<Locale, OrderCopy> = {
  en: {
    title: 'Edit step order',
    instructions: 'Choose a step and move it. To place it beside another step, choose a reference. Apply the order when you are ready.',
    selected: 'Step to move',
    earlier: 'Move earlier',
    later: 'Move later',
    first: 'Move to start',
    last: 'Move to end',
    reference: 'Reference step',
    before: 'Place before',
    after: 'Place after',
    undo: 'Undo',
    redo: 'Redo',
    cancel: 'Cancel',
    apply: 'Apply order',
    draft: 'Draft order',
    selectButton: 'Select',
    empty: 'Add two steps to change their order.',
    single: 'Add another step to change the order.',
    conflict: 'The steps changed outside this editor. Reload the steps to start again with the current order.',
    invalid: 'Some steps have missing or repeated identifiers. Close the editor and correct the steps.',
    reload: 'Reload steps',
    notice: {
      selected: 'Selected.',
      moved: 'Moved.',
      undone: 'Move undone.',
      redone: 'Move redone.',
      reloaded: 'Steps reloaded.',
      reference: 'Reference changed.',
    },
    duplicate: (name, position) => `${name} (step ${position})`,
    position: (name, position, length) => `${name}, position ${position} of ${length}.`,
    selectNamed: (name) => `Select ${name}`,
    referenceNamed: (name) => `Use ${name} as reference`,
    referenceChosen: (name) => `Reference step: ${name}.`,
  },
  fr: {
    title: 'Modifier l’ordre des étapes',
    instructions: 'Choisissez une étape à déplacer. Pour la placer à côté d’une autre étape, choisissez une référence. Appliquez l’ordre une fois les déplacements terminés.',
    selected: 'Étape à déplacer',
    earlier: 'Déplacer plus tôt',
    later: 'Déplacer plus tard',
    first: 'Placer au début',
    last: 'Placer à la fin',
    reference: 'Étape de référence',
    before: 'Placer avant',
    after: 'Placer après',
    undo: 'Annuler le déplacement',
    redo: 'Rétablir le déplacement',
    cancel: 'Fermer sans appliquer',
    apply: 'Appliquer l’ordre',
    draft: 'Ordre proposé',
    selectButton: 'Sélectionner',
    empty: 'Ajoutez deux étapes pour changer leur ordre.',
    single: 'Ajoutez une autre étape pour changer l’ordre.',
    conflict: 'Les étapes ont changé pendant la modification. Rechargez les étapes pour repartir de l’ordre actuel.',
    invalid: 'Certains identifiants d’étape sont absents ou répétés. Fermez la fenêtre et corrigez les étapes.',
    reload: 'Recharger les étapes',
    notice: {
      selected: 'Étape sélectionnée.',
      moved: 'Étape déplacée.',
      undone: 'Déplacement annulé.',
      redone: 'Déplacement rétabli.',
      reloaded: 'Étapes rechargées.',
      reference: 'Référence modifiée.',
    },
    duplicate: (name, position) => `${name} (étape ${position})`,
    position: (name, position, length) => `${name}, position ${position} sur ${length}.`,
    selectNamed: (name) => `Sélectionner ${name}`,
    referenceNamed: (name) => `Prendre ${name} comme référence`,
    referenceChosen: (name) => `Étape de référence\u00a0: ${name}.`,
  },
};
