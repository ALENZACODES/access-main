import { barrierDataUrl } from './barrier-report.js';
import {
  MAX_NOTE,
  OPTIONAL_NEEDS,
  RESULT_LABELS,
  answer,
  clearAnswer,
  currentStep,
  earlierLine,
  exportText,
  logFileName,
  move,
  newSession,
  progress,
  progressSentence,
  readEarlier,
  setNeeds,
  stepsOf,
  summaryText,
  validateAnswer,
  validateWho,
  type HandError,
  type HandSession,
} from './hand-session.js';
import { NEED_LABELS, type Need } from './manual-steps.js';
import { escapeHtml } from './report.js';
import { DECISIONS, type Decision } from './review.js';
import { NBSP, type Lang } from './types.js';
import { aaLabel } from './wcag22.js';

/**
 * "Look by hand": a panel that takes a person through the by-hand steps
 * one at a time, records what they found, and gives them the log to copy or
 * save. It is the worksheet of this tool made into something a person can
 * work through on a phone, with the same steps and the same log file.
 *
 * The panel sends nothing and stores nothing. Every control is at least 44
 * CSS pixels each way, every field has a visible label, errors are given in
 * text by their field, and after each step focus goes to the heading of the
 * step that is now on screen.
 */

/** The few DOM members the panel needs, so it can be driven without a browser. */
export interface HandRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void; value?: string; checked?: boolean; open?: boolean } | null;
}

export interface HandDraft {
  /** A result, or empty when none is chosen yet. */
  readonly result: string;
  readonly note: string;
}

export interface HandOutput {
  /** The log as the text of a file. */
  readonly log: string;
  /** What was found, in words. */
  readonly summary: string;
}

export interface HandState {
  readonly session: HandSession;
  /** What is in the form of each step and not saved yet, by criterion. */
  readonly drafts: Readonly<Record<string, HandDraft>>;
  /** The boxes of "what I have" as they are ticked, before they are applied. */
  readonly needsDraft: readonly Need[];
  readonly errors: readonly HandError[];
  readonly notice: string;
  readonly output: HandOutput | null;
  /** The text pasted as an earlier log. */
  readonly earlierText: string;
  readonly earlierError: string;
  /** True while the list of all steps is open. */
  readonly listOpen: boolean;
}

export interface HandOptions {
  readonly root: HandRoot;
  readonly lang: Lang;
  readonly now?: () => Date;
  /** Puts text on the clipboard. Defaults to the browser clipboard when there is one. */
  readonly copy?: (text: string) => Promise<void>;
  /** A state to start from, so a panel mounted again in another language keeps the session. */
  readonly state?: HandState;
  /** Level of the heading of the panel. Default 2, under the h1 of the page. */
  readonly headingLevel?: 2 | 3;
}

export function initialHandState(session: HandSession = newSession()): HandState {
  return { session, drafts: {}, needsDraft: session.needs, errors: [], notice: '', output: null, earlierText: '', earlierError: '', listOpen: false };
}

const T = {
  title: { en: 'Look by hand', fr: 'Regarder à la main' },
  intro: {
    en: 'Some things only a person can judge. This takes you through them one step at a time, and writes down what you find in a log the reports can read.',
    fr: 'Certaines choses ne peuvent être jugées que par une personne. Ce panneau vous les fait parcourir une étape à la fois, et consigne ce que vous constatez dans un journal que les rapports savent lire.',
  },
  limit: {
    en: 'Each step is a first look that finds common problems. Going through all of them records that someone looked. It does not make a page conform.',
    fr: 'Chaque étape est un premier examen qui trouve les problèmes courants. Les parcourir toutes consigne que quelqu’un a regardé. Cela ne rend pas une page conforme.',
  },
  kept: {
    en: 'Nothing here is stored or sent. If you leave or reload this page, your answers are lost, so prepare the log and save it first.',
    fr: 'Rien ici n’est enregistré ni envoyé. Si vous quittez ou rechargez cette page, vos réponses sont perdues. Préparez donc le journal et enregistrez-le avant.',
  },
  setup: { en: 'Before you start', fr: 'Avant de commencer' },
  who: { en: 'Who is looking', fr: 'Qui regarde' },
  whoHint: { en: 'A handle or initials is enough. It is written in the log next to each answer.', fr: 'Un pseudonyme ou des initiales suffisent. Ce nom est écrit dans le journal à côté de chaque réponse.' },
  have: { en: 'What I have besides a browser', fr: 'Ce que j’ai en plus d’un navigateur' },
  apply: { en: 'Show the steps for what I have', fr: 'Afficher les étapes pour ce que j’ai' },
  applied: { en: 'The steps were updated.', fr: 'Les étapes ont été mises à jour.' },
  earlier: { en: 'An earlier log, if you have one', fr: 'Un journal précédent, si vous en avez un' },
  earlierHint: {
    en: 'Paste its content here to see the last look next to each step and to keep its notes in the new log.',
    fr: 'Collez son contenu ici pour voir le dernier examen à côté de chaque étape et garder ses notes dans le nouveau journal.',
  },
  read: { en: 'Read this log', fr: 'Lire ce journal' },
  step: { en: 'Step', fr: 'Étape' },
  of: { en: 'of', fr: 'sur' },
  noStep: { en: 'No step fits what you have at hand. Tick what you have above.', fr: 'Aucune étape ne correspond à ce que vous avez sous la main. Cochez ci-dessus ce que vous avez.' },
  action: { en: 'Do', fr: 'À faire' },
  look: { en: 'Look for', fr: 'À observer' },
  need: { en: 'You need', fr: 'Il vous faut' },
  saved: { en: 'Saved answer', fr: 'Réponse enregistrée' },
  found: { en: 'What I found', fr: 'Ce que j’ai constaté' },
  note: { en: 'Note', fr: 'Note' },
  noteHint: {
    en: `Say what you saw and on which page. Needed when you saw a problem. At most ${MAX_NOTE} characters. Do not write personal details about anyone.`,
    fr: `Dites ce que vous avez vu et sur quelle page. Nécessaire si vous avez vu un problème. ${MAX_NOTE} caractères au plus. N’écrivez de détails personnels sur personne.`,
  },
  saveNext: { en: 'Save and go to the next step', fr: 'Enregistrer et passer à l’étape suivante' },
  save: { en: 'Save this answer', fr: 'Enregistrer cette réponse' },
  previous: { en: 'Previous step', fr: 'Étape précédente' },
  next: { en: 'Next step', fr: 'Étape suivante' },
  nextOpen: { en: 'Next step not looked at', fr: 'Prochaine étape non regardée' },
  clear: { en: 'Erase the answer of this step', fr: 'Effacer la réponse de cette étape' },
  cleared: { en: 'The answer of this step was erased.', fr: 'La réponse de cette étape a été effacée.' },
  savedNotice: { en: 'Saved.', fr: 'Enregistré.' },
  notSaved: { en: 'The answer was not saved.', fr: 'La réponse n’a pas été enregistrée.' },
  allDone: { en: 'Every step has an answer. Prepare the log below.', fr: 'Chaque étape a une réponse. Préparez le journal ci-dessous.' },
  all: { en: 'All steps', fr: 'Toutes les étapes' },
  open: { en: 'not looked at yet', fr: 'pas encore regardée' },
  log: { en: 'The log', fr: 'Le journal' },
  logIntro: {
    en: 'The log is a small file. Give it to the audit with --manual-log and the reports show what was looked at by hand, by whom and when.',
    fr: 'Le journal est un petit fichier. Donnez-le à l’audit avec --manual-log, et les rapports montrent ce qui a été regardé à la main, par qui et quand.',
  },
  prepare: { en: 'Prepare the log', fr: 'Préparer le journal' },
  prepared: { en: 'The log is ready below. Read it before you share it.', fr: 'Le journal est prêt ci-dessous. Relisez-le avant de le partager.' },
  nothing: { en: 'There is nothing to put in the log yet. Save an answer first.', fr: 'Il n’y a encore rien à mettre dans le journal. Enregistrez d’abord une réponse.' },
  logLabel: { en: 'Log file', fr: 'Fichier du journal' },
  summaryLabel: { en: 'The same in words', fr: 'La même chose en mots' },
  copyLog: { en: 'Copy the log', fr: 'Copier le journal' },
  copySummary: { en: 'Copy the words', fr: 'Copier le texte' },
  saveFile: { en: 'Save the log as a file', fr: 'Enregistrer le journal dans un fichier' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
  reset: { en: 'Erase all my answers and start again', fr: 'Effacer toutes mes réponses et recommencer' },
  wasReset: { en: 'All answers were erased.', fr: 'Toutes les réponses ont été effacées.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);
const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');

/** A short word for the state of a step in the list of all steps. */
const SHORT: Readonly<Record<Decision, { readonly en: string; readonly fr: string }>> = {
  problem: { en: 'problem seen', fr: 'problème vu' },
  'no-problem-found': { en: 'no problem found', fr: 'aucun problème trouvé' },
  'not-sure': { en: 'not sure', fr: 'sans certitude' },
};

/** Styles of the panel, scoped to its own class. Controls are at least 44 CSS pixels each way and wrap on a narrow screen. */
export const HAND_CSS =
  '.hand{max-width:44rem}.hand h2,.hand h3,.hand h4{line-height:1.25}' +
  '.hand label{display:block;font-weight:600;margin-top:12px}' +
  '.hand .hand-field{display:block;width:100%;max-width:24rem;min-height:44px;box-sizing:border-box;font:inherit;padding:8px}' +
  '.hand textarea{display:block;width:100%;box-sizing:border-box;font:inherit;min-height:6rem;padding:8px}' +
  '.hand .hand-check{display:flex;align-items:center;gap:8px;min-height:44px;font-weight:400;margin-top:4px}' +
  '.hand .hand-check input{width:44px;height:44px;margin:0;flex:none}' +
  '.hand fieldset{border:0;padding:0;margin:12px 0 0;min-width:0}.hand legend{font-weight:600;padding:0}' +
  '.hand button,.hand .hand-save{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal;text-align:left}' +
  '.hand .hand-save{display:inline-block;line-height:28px}' +
  '.hand .hand-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.hand .hand-error{font-weight:600}.hand [aria-invalid="true"]{outline:3px solid currentColor;outline-offset:2px}' +
  '.hand summary{min-height:44px;display:flex;align-items:center;font-weight:600;cursor:pointer}' +
  '.hand ol{padding-left:0;list-style:none}.hand ol li{margin:8px 0}.hand ol button{width:100%}' +
  '.hand [aria-current="step"]{border-width:3px;font-weight:600}' +
  '.hand p,.hand li,.hand legend,.hand label{overflow-wrap:anywhere}' +
  '.hand button:focus-visible,.hand input:focus-visible,.hand textarea:focus-visible,.hand a:focus-visible,.hand summary:focus-visible,.hand [tabindex="-1"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

const idOf = (sc: string): string => sc.replace(/\./g, '-');

function setupSection(state: HandState, lang: Lang, h: number): string {
  const whoError = state.errors.find((e) => e.field === 'who')?.message ?? '';
  const boxes = OPTIONAL_NEEDS.map((n) => {
    const label = NEED_LABELS[n][lang];
    return `<label class="hand-check" for="hand-need-${n}"><input type="checkbox" id="hand-need-${n}" name="hand-need-${n}"${state.needsDraft.includes(n) ? ' checked' : ''}> ${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</label>`;
  }).join('');
  const count = state.session.earlier.notes.length;
  const read =
    count === 0
      ? ''
      : `<p>${escapeHtml(lang === 'fr' ? `${count} ${count < 2 ? 'note lue' : 'notes lues'} dans le journal précédent.` : `${count} ${count === 1 ? 'note' : 'notes'} read from the earlier log.`)}</p>`;
  return (
    `<section aria-labelledby="hand-setup-h"><h${h} id="hand-setup-h">${tx('setup', lang)}</h${h}>` +
    `<label for="hand-who">${tx('who', lang)}</label>` +
    `<p id="hand-who-hint">${tx('whoHint', lang)}</p>` +
    `<input class="hand-field" type="text" id="hand-who" name="hand-who" value="${escapeHtml(state.session.who)}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="hand-who-hint${whoError ? ' hand-who-error' : ''}"${whoError ? ' aria-invalid="true"' : ''}>` +
    (whoError ? `<p class="hand-error" id="hand-who-error">${escapeHtml(whoError)}</p>` : '') +
    `<fieldset><legend>${tx('have', lang)}</legend>${boxes}</fieldset>` +
    `<p class="hand-actions"><button type="button" data-action="hand-needs">${tx('apply', lang)}</button></p>` +
    `<label for="hand-earlier">${tx('earlier', lang)}</label>` +
    `<p id="hand-earlier-hint">${tx('earlierHint', lang)}</p>` +
    `<textarea id="hand-earlier" name="hand-earlier" rows="4" autocomplete="off" spellcheck="false" aria-describedby="hand-earlier-hint${state.earlierError ? ' hand-earlier-error' : ''}"${state.earlierError ? ' aria-invalid="true"' : ''}>${escapeHtml(state.earlierText)}</textarea>` +
    (state.earlierError ? `<p class="hand-error" id="hand-earlier-error">${escapeHtml(state.earlierError)}</p>` : '') +
    read +
    `<p class="hand-actions"><button type="button" data-action="hand-read">${tx('read', lang)}</button></p>` +
    '</section>'
  );
}

function stepSection(state: HandState, lang: Lang, h: number, now: Date): string {
  const steps = stepsOf(state.session, lang);
  const step = currentStep(state.session, lang);
  const p = progress(state.session);
  if (!step) {
    return `<section aria-labelledby="hand-step-h"><h${h} id="hand-step-h" tabindex="-1">${tx('step', lang)}</h${h}><p>${tx('noStep', lang)}</p></section>`;
  }
  const sc = step.row.criterion.sc;
  const at = steps.findIndex((s) => s.row.criterion.sc === sc);
  const saved = state.session.answers[sc];
  const draft = state.drafts[sc] ?? (saved ? { result: saved.result, note: saved.note } : { result: '', note: '' });
  const resultError = state.errors.find((e) => e.field === 'result')?.message ?? '';
  const noteError = state.errors.find((e) => e.field === 'note')?.message ?? '';
  const radios = DECISIONS.map(
    (d) => `<label class="hand-check" for="hand-result-${d}"><input type="radio" id="hand-result-${d}" name="hand-result" value="${d}"${draft.result === d ? ' checked' : ''}> ${escapeHtml(RESULT_LABELS[d][lang])}</label>`,
  ).join('');
  const before = earlierLine(state.session, sc, now, lang);
  const line = (key: Key, text: string): string => `<p><strong>${tx(key, lang)}${colon(lang)}</strong> ${escapeHtml(text)}</p>`;
  return (
    `<section aria-labelledby="hand-step-h"><h${h} id="hand-step-h" tabindex="-1">${escapeHtml(`${T.step[lang]} ${at + 1} ${T.of[lang]} ${steps.length}${colon(lang)} ${aaLabel(sc, lang)}`)}</h${h}>` +
    `<p>${escapeHtml(progressSentence(p, lang))}</p>` +
    line('action', step.action) +
    line('look', step.look) +
    line('need', `${NEED_LABELS[step.needs][lang]}.`) +
    (before === '' ? '' : `<p>${escapeHtml(before)}</p>`) +
    (saved ? line('saved', `${RESULT_LABELS[saved.result][lang]}.${saved.note === '' ? '' : ` ${saved.note}`}`) : '') +
    `<fieldset id="hand-result" role="radiogroup" aria-labelledby="hand-result-legend" aria-required="true"${resultError ? ' aria-invalid="true" aria-describedby="hand-result-error"' : ''}>` +
    `<legend id="hand-result-legend">${tx('found', lang)}</legend>` +
    (resultError ? `<p class="hand-error" id="hand-result-error">${escapeHtml(resultError)}</p>` : '') +
    `${radios}</fieldset>` +
    `<label for="hand-note">${tx('note', lang)}</label>` +
    `<p id="hand-note-hint">${tx('noteHint', lang)}</p>` +
    `<textarea id="hand-note" name="hand-note" rows="4" autocomplete="off" aria-describedby="hand-note-hint${noteError ? ' hand-note-error' : ''}"${noteError ? ' aria-invalid="true"' : ''}>${escapeHtml(draft.note)}</textarea>` +
    (noteError ? `<p class="hand-error" id="hand-note-error">${escapeHtml(noteError)}</p>` : '') +
    `<p class="hand-actions"><button type="button" data-action="hand-save-next">${tx('saveNext', lang)}</button> ` +
    `<button type="button" data-action="hand-save">${tx('save', lang)}</button></p>` +
    `<p class="hand-actions"><button type="button" data-action="hand-previous">${tx('previous', lang)}</button> ` +
    `<button type="button" data-action="hand-next">${tx('next', lang)}</button> ` +
    `<button type="button" data-action="hand-next-open">${tx('nextOpen', lang)}</button>` +
    (saved ? ` <button type="button" data-action="hand-clear">${tx('clear', lang)}</button>` : '') +
    '</p></section>'
  );
}

function listSection(state: HandState, lang: Lang): string {
  const steps = stepsOf(state.session, lang);
  if (steps.length === 0) return '';
  const p = progress(state.session);
  const items = steps
    .map((s) => {
      const sc = s.row.criterion.sc;
      const a = state.session.answers[sc];
      const status = a ? SHORT[a.result][lang] : T.open[lang];
      return `<li><button type="button" data-action="hand-go-${idOf(sc)}"${sc === state.session.current ? ' aria-current="step"' : ''}>${escapeHtml(`${aaLabel(sc, lang)}${colon(lang)} ${status}`)}</button></li>`;
    })
    .join('');
  const summary = `${T.all[lang]} (${lang === 'fr' ? `${p.answered} sur ${p.total} ${p.answered < 2 ? 'regardée' : 'regardées'}` : `${p.answered} of ${p.total} looked at`})`;
  return `<details id="hand-all"${state.listOpen ? ' open' : ''}><summary>${escapeHtml(summary)}</summary><ol>${items}</ol></details>`;
}

function logSection(state: HandState, lang: Lang, h: number, now: Date): string {
  const p = progress(state.session);
  const hidden =
    p.hidden === 0
      ? ''
      : `<p>${escapeHtml(
          lang === 'fr'
            ? `${p.hidden} ${p.hidden < 2 ? 'réponse concerne une étape qui n’est plus affichée. Elle reste' : 'réponses concernent des étapes qui ne sont plus affichées. Elles restent'} dans le journal.`
            : `${p.hidden} ${p.hidden === 1 ? 'answer is for a step that no longer shows. It stays' : 'answers are for steps that no longer show. They stay'} in the log.`,
        )}</p>`;
  let out =
    `<section aria-labelledby="hand-log-h"><h${h} id="hand-log-h">${tx('log', lang)}</h${h}>` +
    `<p>${tx('logIntro', lang)}</p>` +
    hidden +
    `<p class="hand-actions"><button type="button" data-action="hand-export">${tx('prepare', lang)}</button></p>`;
  if (state.output) {
    out +=
      `<label for="hand-log">${tx('logLabel', lang)}</label>` +
      `<textarea id="hand-log" name="hand-log" rows="10" readonly spellcheck="false">${escapeHtml(state.output.log)}</textarea>` +
      `<p class="hand-actions"><button type="button" data-action="hand-copy-log">${tx('copyLog', lang)}</button> ` +
      `<a class="hand-save" data-action="hand-save-file" href="${escapeHtml(barrierDataUrl(state.output.log))}" download="${escapeHtml(logFileName(now))}">${tx('saveFile', lang)}</a></p>` +
      `<label for="hand-summary">${tx('summaryLabel', lang)}</label>` +
      `<textarea id="hand-summary" name="hand-summary" rows="8" readonly>${escapeHtml(state.output.summary)}</textarea>` +
      `<p class="hand-actions"><button type="button" data-action="hand-copy-summary">${tx('copySummary', lang)}</button></p>`;
  }
  return `${out}<p class="hand-actions"><button type="button" data-action="hand-reset">${tx('reset', lang)}</button></p></section>`;
}

/** The markup of the panel for a state. */
export function renderHandPanel(lang: Lang, state: HandState, now: Date, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="hand"><style>${HAND_CSS}</style>` +
    `<h${h} id="hand-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p><p>${tx('limit', lang)}</p><p>${tx('kept', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` +
    setupSection(state, lang, h + 1) +
    stepSection(state, lang, h + 1, now) +
    listSection(state, lang) +
    logSection(state, lang, h + 1, now) +
    '</div>'
  );
}

export type HandAction = 'hand-needs' | 'hand-read' | 'hand-save' | 'hand-save-next' | 'hand-previous' | 'hand-next' | 'hand-next-open' | 'hand-clear' | 'hand-export' | 'hand-reset' | `hand-go-${string}`;

export function isHandAction(action: string | null): action is HandAction {
  return action !== null && /^hand-(needs|read|save|save-next|previous|next|next-open|clear|export|reset|go-\d+-\d+-\d+)$/.test(action);
}

export interface HandStep {
  readonly state: HandState;
  /** Selector of the element to put focus on after the re-render. */
  readonly focus: string;
}

const STEP_HEADING = '#hand-step-h';

/**
 * What an action does to the state. The state passed in already holds what
 * is in the form. Copying is not here: it needs the clipboard.
 */
export function handStep(state: HandState, action: HandAction, lang: Lang, now: Date): HandStep {
  const s = state.session;
  const clean = { ...state, errors: [] as HandError[], earlierError: '' };
  if (action === 'hand-needs') {
    return { state: { ...clean, session: setNeeds(s, state.needsDraft), notice: T.applied[lang], output: null }, focus: STEP_HEADING };
  }
  if (action === 'hand-read') {
    const read = readEarlier(s, state.earlierText, now, lang);
    if (!read.ok) return { state: { ...clean, earlierError: read.error, notice: read.error }, focus: '#hand-earlier' };
    const n = read.count;
    const notice = lang === 'fr' ? `${n} ${n < 2 ? 'note lue' : 'notes lues'} dans le journal précédent.` : `${n} ${n === 1 ? 'note' : 'notes'} read from the earlier log.`;
    return { state: { ...clean, session: read.session, earlierText: '', notice, output: null }, focus: '[data-action="hand-read"]' };
  }
  if (action === 'hand-save' || action === 'hand-save-next') {
    if (s.current === null) return { state: clean, focus: STEP_HEADING };
    const draft = state.drafts[s.current] ?? { result: s.answers[s.current]?.result ?? '', note: s.answers[s.current]?.note ?? '' };
    const errors = validateAnswer(draft.result, draft.note, lang);
    if (errors.length > 0) {
      return {
        state: { ...clean, errors, notice: `${T.notSaved[lang]} ${errors.map((e) => e.message).join(' ')}` },
        focus: errors[0]?.field === 'result' ? `#hand-result-${DECISIONS[0] ?? 'problem'}` : '#hand-note',
      };
    }
    const drafts = { ...state.drafts };
    delete drafts[s.current];
    const saved = answer(s, s.current, draft.result as Decision, draft.note);
    if (action === 'hand-save') return { state: { ...clean, session: saved, drafts, notice: T.savedNotice[lang], output: null }, focus: '[data-action="hand-save"]' };
    const moved = move(saved, 'next-open');
    const done = moved.current === saved.current;
    return { state: { ...clean, session: moved, drafts, notice: done ? T.allDone[lang] : T.savedNotice[lang], output: null }, focus: done ? '[data-action="hand-export"]' : STEP_HEADING };
  }
  if (action === 'hand-previous' || action === 'hand-next' || action === 'hand-next-open') {
    const where = action === 'hand-previous' ? 'previous' : action === 'hand-next' ? 'next' : 'next-open';
    return { state: { ...clean, session: move(s, where), notice: '' }, focus: STEP_HEADING };
  }
  if (action === 'hand-clear') {
    if (s.current === null) return { state: clean, focus: STEP_HEADING };
    const drafts = { ...state.drafts };
    delete drafts[s.current];
    return { state: { ...clean, session: clearAnswer(s, s.current), drafts, notice: T.cleared[lang], output: null }, focus: STEP_HEADING };
  }
  if (action === 'hand-export') {
    if (Object.keys(s.answers).length === 0 && s.earlier.notes.length === 0) return { state: { ...clean, output: null, notice: T.nothing[lang] }, focus: STEP_HEADING };
    const whoError = Object.keys(s.answers).length === 0 ? '' : validateWho(s.who, lang);
    if (whoError !== '') return { state: { ...clean, errors: [{ field: 'who', message: whoError }], output: null, notice: whoError }, focus: '#hand-who' };
    return { state: { ...clean, output: { log: exportText(s, now), summary: summaryText(s, now, lang) }, notice: T.prepared[lang] }, focus: '#hand-log' };
  }
  if (action === 'hand-reset') {
    return { state: { ...initialHandState({ ...newSession(), who: s.who }), notice: T.wasReset[lang] }, focus: STEP_HEADING };
  }
  const sc = action.slice('hand-go-'.length).replace(/-/g, '.');
  return { state: { ...clean, session: move(s, { to: sc }), notice: '' }, focus: STEP_HEADING };
}

/**
 * Mounts the panel. Every re-render replaces the markup, so what is in the
 * form is read into the state first, and focus is put where the next thing
 * to read or to do is.
 */
export function mountHandPanel(opts: HandOptions): { getState(): HandState } {
  const lang = opts.lang;
  const now = opts.now ?? ((): Date => new Date());
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;

  // A state handed over from another language keeps the session and drops the messages, which were written in that language.
  let state: HandState = opts.state ? { ...opts.state, errors: [], notice: '', earlierError: '', output: null } : initialHandState();

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderHandPanel(lang, state, now(), opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  /** Reads what is in the form, so a re-render does not lose it. */
  const read = (): HandState => {
    const q = opts.root.querySelector?.bind(opts.root);
    if (!q) return state;
    const who = q('#hand-who')?.value ?? state.session.who;
    const needsDraft = OPTIONAL_NEEDS.filter((n) => q(`#hand-need-${n}`)?.checked ?? state.needsDraft.includes(n));
    const sc = state.session.current;
    let drafts = state.drafts;
    if (sc !== null) {
      const picked = q('input[name="hand-result"]:checked');
      const saved = state.session.answers[sc];
      const before = state.drafts[sc] ?? { result: saved?.result ?? '', note: saved?.note ?? '' };
      const draft = { result: picked === null ? '' : (picked.value ?? before.result), note: q('#hand-note')?.value ?? before.note };
      drafts = { ...state.drafts, [sc]: draft };
    }
    return { ...state, session: { ...state.session, who }, needsDraft, drafts, earlierText: q('#hand-earlier')?.value ?? state.earlierText, listOpen: q('#hand-all')?.open ?? state.listOpen };
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === null || !action.startsWith('hand-') || action === 'hand-save-file') return;
    if (action === 'hand-copy-log' || action === 'hand-copy-summary') {
      state = read();
      const output = state.output;
      if (!output) return;
      const field = action === 'hand-copy-log' ? '#hand-log' : '#hand-summary';
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render(field);
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(action === 'hand-copy-log' ? output.log : output.summary);
          state = { ...state, notice: T.copied[lang] };
          render(`[data-action="${action}"]`);
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
          render(field);
        }
      })();
      return;
    }
    if (!isHandAction(action)) return;
    const step = handStep(read(), action, lang, now());
    state = step.state;
    render(step.focus);
  });
  render();
  return { getState: () => read() };
}

/** What the app shell needs to place the panel on a page. */
export const handPanel = {
  title: T.title,
  mount: mountHandPanel,
} as const;
