import { BARRIER_KINDS, EMPTY_DRAFT, KIND_LABELS, MAX_WHAT, barrierDataUrl, barrierFileName, personalWarning, renderBarrierText, validateBarrier, type BarrierDraft, type BarrierError, type BarrierKind } from './barrier-report.js';
import { browserEnv, describeFacts, fitNotes, readDeviceFacts, type DeviceEnv, type DeviceFacts } from './device-facts.js';
import { groupLine, plainHeadline, plainLimit, summarisePlainly, type PlainSummary } from './plain-summary.js';
import { escapeHtml, type AuditReport } from './report.js';
import { selfAudit } from './run.js';
import { NBSP, type Lang } from './types.js';

/**
 * "This page on your screen": a panel for the person using the App. It
 * shows what the browser reports about their screen and settings, runs the
 * checks on the page they are on and says what was found in plain words, and
 * helps them write up a barrier as text they can copy or save.
 *
 * The panel sends nothing. Copying and saving happen on the device. Every
 * control is at least 44 CSS pixels high, each field has a visible label,
 * and an error is given in text next to its field and announced.
 */

/** The few DOM members the panel needs, so it can be driven without a browser. */
export interface FitRoot {
  innerHTML: string;
  setAttribute?(name: string, value: string): void;
  addEventListener(type: 'click', handler: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): { focus?(): void; value?: string; checked?: boolean } | null;
}

export interface FitOptions {
  readonly root: FitRoot;
  readonly lang: Lang;
  /** Where the browser facts come from. Defaults to the browser itself. */
  readonly env?: () => DeviceEnv;
  /** Produces the audit of the current page. Defaults to auditing the document. */
  readonly run?: () => Promise<AuditReport> | AuditReport;
  readonly now?: () => Date;
  /** Puts text on the clipboard. Defaults to the browser clipboard when there is one. */
  readonly copy?: (text: string) => Promise<void>;
  /** Where the person is in the App. Defaults to the address of the page. */
  readonly location?: () => string;
  /** Level of the heading of the panel. Default 2, under the h1 of the page. */
  readonly headingLevel?: 2 | 3;
  /** Answers to start from, so a panel mounted again in another language keeps what the person wrote. */
  readonly draft?: BarrierDraft;
  /** More lines for the settings part of the text, asked for when the text is prepared. */
  readonly extraFacts?: () => readonly string[];
}

export interface FitState {
  readonly facts: DeviceFacts;
  readonly audit: { readonly kind: 'idle' } | { readonly kind: 'running' } | { readonly kind: 'done'; readonly summary: PlainSummary } | { readonly kind: 'error'; readonly message: string };
  readonly draft: BarrierDraft;
  readonly errors: readonly BarrierError[];
  /** The finished report text, once made. */
  readonly text: string | null;
  /** A short message for the live region. */
  readonly notice: string;
}

const T = {
  title: { en: 'This page on your screen', fr: 'Cette page sur votre écran' },
  intro: {
    en: 'What your browser reports about your screen, what the checks of the App find on this page, and a way to tell us about a barrier. Nothing here is sent anywhere.',
    fr: 'Ce que votre navigateur indique sur votre écran, ce que les contrôles de l’App trouvent sur cette page, et un moyen de nous signaler un obstacle. Rien ici n’est envoyé nulle part.',
  },
  facts: { en: 'Your screen and settings', fr: 'Votre écran et vos réglages' },
  factsCaption: { en: 'As the browser reports them. UNKNOWN means the browser gave no answer.', fr: 'Tels que le navigateur les indique. UNKNOWN veut dire que le navigateur n’a pas répondu.' },
  setting: { en: 'Setting', fr: 'Réglage' },
  value: { en: 'Value', fr: 'Valeur' },
  refresh: { en: 'Read my settings again', fr: 'Relire mes réglages' },
  refreshed: { en: 'Settings read again.', fr: 'Réglages relus.' },
  checks: { en: 'What the checks find on this page', fr: 'Ce que les contrôles trouvent sur cette page' },
  run: { en: 'Run the checks on this page', fr: 'Lancer les contrôles sur cette page' },
  idle: { en: 'The checks have not run yet.', fr: 'Les contrôles n’ont pas encore été lancés.' },
  running: { en: 'Running the checks…', fr: 'Contrôles en cours…' },
  error: { en: 'The checks could not run', fr: 'Les contrôles n’ont pas pu s’exécuter' },
  barrier: { en: 'Tell us about a barrier', fr: 'Signaler un obstacle' },
  barrierIntro: {
    en: 'Describe what got in your way. You get a text to copy or save, and you choose where to send it. Do not put your name or contact details in it unless you want to.',
    fr: 'Décrivez ce qui vous a gêné. Vous obtenez un texte à copier ou à enregistrer, et vous choisissez où l’envoyer. N’y mettez pas votre nom ni vos coordonnées, sauf si vous le voulez.',
  },
  kind: { en: 'Kind of barrier', fr: 'Type d’obstacle' },
  what: { en: 'What happened', fr: 'Ce qui s’est passé' },
  whatHint: { en: `Say what you were trying to do and what stopped you. At most ${MAX_WHAT} characters.`, fr: `Dites ce que vous vouliez faire et ce qui vous a arrêté. ${MAX_WHAT} caractères au plus.` },
  includeSettings: { en: 'Add my screen and settings to the text', fr: 'Ajouter mon écran et mes réglages au texte' },
  includeFindings: { en: 'Run the checks and add what they find to the text', fr: 'Lancer les contrôles et ajouter ce qu’ils trouvent au texte' },
  make: { en: 'Prepare the text', fr: 'Préparer le texte' },
  problems: { en: 'The text could not be prepared.', fr: 'Le texte n’a pas pu être préparé.' },
  ready: { en: 'The text is ready below. Read it before you share it.', fr: 'Le texte est prêt ci-dessous. Relisez-le avant de le partager.' },
  result: { en: 'Your text', fr: 'Votre texte' },
  copy: { en: 'Copy the text', fr: 'Copier le texte' },
  save: { en: 'Save the text as a file', fr: 'Enregistrer le texte dans un fichier' },
  again: { en: 'Change my answers', fr: 'Modifier mes réponses' },
  clear: { en: 'Erase my answers and the text', fr: 'Effacer mes réponses et le texte' },
  cleared: { en: 'Your answers and the text were erased.', fr: 'Vos réponses et le texte ont été effacés.' },
  copied: { en: 'Copied.', fr: 'Copié.' },
  noClipboard: { en: 'Copying is not available in this browser. Select the text and copy it by hand.', fr: 'La copie n’est pas disponible dans ce navigateur. Sélectionnez le texte et copiez-le à la main.' },
  copyFailed: { en: 'Copying failed. Select the text and copy it by hand.', fr: 'La copie a échoué. Sélectionnez le texte et copiez-le à la main.' },
} as const;

type Key = keyof typeof T;
const tx = (key: Key, lang: Lang): string => escapeHtml(T[key][lang]);
const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');

/** Styles of the panel, scoped to its own class. Controls are at least 44 CSS pixels high and wrap on a narrow screen. */
export const FIT_CSS =
  '.fit{max-width:44rem}.fit h2,.fit h3,.fit h4{line-height:1.25}' +
  '.fit table{border-collapse:collapse;width:100%;table-layout:fixed}.fit caption{text-align:left;padding:4px 0}' +
  '.fit th,.fit td{border:1px solid currentColor;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
  '.fit button,.fit .fit-save{min-height:44px;min-width:44px;font:inherit;padding:8px 12px;box-sizing:border-box;max-width:100%;white-space:normal}' +
  '.fit .fit-save{display:inline-block;line-height:28px}' +
  '.fit label{display:block;font-weight:600;margin-top:12px}.fit .fit-check{display:flex;align-items:center;gap:8px;min-height:44px;font-weight:400}' +
  '.fit .fit-check input{width:44px;height:44px;margin:0;flex:none}' +
  '.fit fieldset{border:0;padding:0;margin:12px 0 0;min-width:0}.fit legend{font-weight:600;padding:0}' +
  '.fit textarea{display:block;width:100%;box-sizing:border-box;font:inherit;min-height:8rem;padding:8px}' +
  '.fit .fit-error{font-weight:600}.fit [aria-invalid="true"]{outline:3px solid currentColor;outline-offset:2px}' +
  '.fit .fit-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
  '.fit button:focus-visible,.fit textarea:focus-visible,.fit input:focus-visible,.fit a:focus-visible{outline:3px solid currentColor;outline-offset:3px}';

function factsSection(state: FitState, lang: Lang, h: number): string {
  const rows = describeFacts(state.facts, lang)
    .map((l) => `<tr><th scope="row">${escapeHtml(l.label)}</th><td>${escapeHtml(l.value)}</td></tr>`)
    .join('');
  const notes = fitNotes(state.facts, lang)
    .map((n) => `<p>${escapeHtml(n)}</p>`)
    .join('');
  return (
    `<section aria-labelledby="fit-facts-h"><h${h} id="fit-facts-h">${tx('facts', lang)}</h${h}>` +
    `<table><caption>${tx('factsCaption', lang)}</caption>` +
    `<thead><tr><th scope="col">${tx('setting', lang)}</th><th scope="col">${tx('value', lang)}</th></tr></thead><tbody>${rows}</tbody></table>` +
    notes +
    `<p class="fit-actions"><button type="button" data-action="fit-refresh">${tx('refresh', lang)}</button></p></section>`
  );
}

function checksSection(state: FitState, lang: Lang, h: number): string {
  let body: string;
  switch (state.audit.kind) {
    case 'idle':
      body = `<p>${tx('idle', lang)}</p>`;
      break;
    case 'running':
      body = `<p>${tx('running', lang)}</p>`;
      break;
    case 'error':
      body = `<p>${tx('error', lang)}${colon(lang)} ${escapeHtml(state.audit.message)}</p>`;
      break;
    case 'done': {
      const s = state.audit.summary;
      const groups = s.groups
        .map(
          (g) =>
            `<li>${escapeHtml(groupLine(g, lang))}<ul>` +
            g.examples.map((e) => `<li><strong>${e.status === 'fail' ? (lang === 'fr' ? 'À CORRIGER' : 'FAIL') : 'UNKNOWN'}</strong> ${escapeHtml(e.message[lang])}</li>`).join('') +
            '</ul></li>',
        )
        .join('');
      body = `<p>${escapeHtml(plainHeadline(s, lang))}</p>${groups === '' ? '' : `<ul>${groups}</ul>`}<p>${escapeHtml(plainLimit(lang))}</p>`;
      break;
    }
  }
  return (
    `<section aria-labelledby="fit-checks-h"><h${h} id="fit-checks-h">${tx('checks', lang)}</h${h}>` +
    `<p class="fit-actions"><button type="button" data-action="fit-run"${state.audit.kind === 'running' ? ' aria-disabled="true"' : ''}>${tx('run', lang)}</button></p>` +
    body +
    '</section>'
  );
}

function barrierSection(state: FitState, lang: Lang, h: number, now: Date): string {
  const errorFor = (field: 'kind' | 'what'): string => state.errors.find((e) => e.field === field)?.message ?? '';
  const kindError = errorFor('kind');
  const whatError = errorFor('what');
  const d = state.draft;
  // Radio buttons, not a select: the labels are long, and a select cannot wrap its text at 320 pixels or with wide text spacing.
  const options = BARRIER_KINDS.map(
    (k) => `<label class="fit-check" for="fit-kind-${k}"><input type="radio" id="fit-kind-${k}" name="fit-kind" value="${k}"${d.kind === k ? ' checked' : ''}> ${escapeHtml(KIND_LABELS[k][lang])}</label>`,
  ).join('');
  const warning = personalWarning(d.what, lang);
  let out =
    `<section aria-labelledby="fit-barrier-h"><h${h} id="fit-barrier-h">${tx('barrier', lang)}</h${h}>` +
    `<p>${tx('barrierIntro', lang)}</p>` +
    `<fieldset id="fit-kind" role="radiogroup" aria-labelledby="fit-kind-legend" aria-required="true"${kindError ? ' aria-invalid="true" aria-describedby="fit-kind-error"' : ''}>` +
    `<legend id="fit-kind-legend">${tx('kind', lang)}</legend>` +
    (kindError ? `<p class="fit-error" id="fit-kind-error">${escapeHtml(kindError)}</p>` : '') +
    `${options}</fieldset>` +
    `<label for="fit-what">${tx('what', lang)}</label>` +
    `<p id="fit-what-hint">${tx('whatHint', lang)}</p>` +
    `<textarea id="fit-what" name="fit-what" rows="5" aria-required="true" autocomplete="off" aria-describedby="fit-what-hint${whatError ? ' fit-what-error' : ''}"${whatError ? ' aria-invalid="true"' : ''}>${escapeHtml(d.what)}</textarea>` +
    (whatError ? `<p class="fit-error" id="fit-what-error">${escapeHtml(whatError)}</p>` : '') +
    `<label class="fit-check" for="fit-settings"><input type="checkbox" id="fit-settings" name="fit-settings"${d.includeSettings ? ' checked' : ''}> ${tx('includeSettings', lang)}</label>` +
    `<label class="fit-check" for="fit-findings"><input type="checkbox" id="fit-findings" name="fit-findings"${d.includeFindings ? ' checked' : ''}> ${tx('includeFindings', lang)}</label>` +
    `<p class="fit-actions"><button type="button" data-action="fit-make">${tx('make', lang)}</button> ` +
    `<button type="button" data-action="fit-clear">${tx('clear', lang)}</button></p>`;
  if (state.text !== null) {
    out +=
      (warning ? `<p class="fit-error">${escapeHtml(warning)}</p>` : '') +
      `<label for="fit-text">${tx('result', lang)}</label>` +
      `<textarea id="fit-text" name="fit-text" rows="12" readonly>${escapeHtml(state.text)}</textarea>` +
      `<p class="fit-actions"><button type="button" data-action="fit-copy">${tx('copy', lang)}</button> ` +
      `<a class="fit-save" data-action="fit-save" href="${escapeHtml(barrierDataUrl(state.text))}" download="${escapeHtml(barrierFileName(now, lang))}">${tx('save', lang)}</a></p>`;
  }
  return `${out}</section>`;
}

/** The markup of the panel for a state. */
export function renderFitPanel(lang: Lang, state: FitState, now: Date, headingLevel: 2 | 3 = 2): string {
  const h = headingLevel;
  return (
    `<div class="fit"><style>${FIT_CSS}</style>` +
    `<h${h} id="fit-h">${tx('title', lang)}</h${h}>` +
    `<p>${tx('intro', lang)}</p>` +
    `<div role="status" aria-live="polite">${escapeHtml(state.notice)}</div>` +
    factsSection(state, lang, h + 1) +
    checksSection(state, lang, h + 1) +
    barrierSection(state, lang, h + 1, now) +
    '</div>'
  );
}

/** The first choice of the kind of barrier, where focus goes when a kind has to be chosen. */
const FIRST_KIND = `#fit-kind-${BARRIER_KINDS[0] ?? 'other'}`;

export function initialFitState(facts: DeviceFacts): FitState {
  return { facts, audit: { kind: 'idle' }, draft: EMPTY_DRAFT, errors: [], text: null, notice: '' };
}

/**
 * Mounts the panel. Every re-render replaces the markup, so the answers in
 * the form are read into the state first, and focus is put back on the
 * control that was used, or on the first field with an error.
 */
export function mountFitPanel(opts: FitOptions): { getState(): FitState; getDraft(): BarrierDraft } {
  const lang = opts.lang;
  const now = opts.now ?? ((): Date => new Date());
  const env = opts.env ?? browserEnv;
  const run = opts.run ?? ((): AuditReport => selfAudit(now()));
  const where = opts.location ?? ((): string => (globalThis as unknown as { location?: { pathname?: string } }).location?.pathname ?? '/');
  const copy =
    opts.copy ??
    ((text: string): Promise<void> => {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
      return nav?.clipboard ? nav.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    });
  const hasClipboard = opts.copy !== undefined || (globalThis as unknown as { navigator?: { clipboard?: unknown } }).navigator?.clipboard !== undefined;

  let state: FitState = { ...initialFitState(readDeviceFacts(env())), draft: opts.draft ?? EMPTY_DRAFT };

  const render = (focus?: string): void => {
    opts.root.setAttribute?.('lang', lang);
    opts.root.innerHTML = renderFitPanel(lang, state, now(), opts.headingLevel ?? 2);
    if (focus) opts.root.querySelector?.(focus)?.focus?.();
  };

  /** Reads the answers out of the form, so a re-render does not lose them. */
  const readDraft = (): BarrierDraft => {
    const q = (sel: string) => opts.root.querySelector?.(sel) ?? null;
    const picked = q('input[name="fit-kind"]:checked');
    const kind = !opts.root.querySelector ? state.draft.kind : picked === null ? '' : (picked.value ?? state.draft.kind);
    return {
      kind: BARRIER_KINDS.includes(kind as BarrierKind) ? (kind as BarrierKind) : '',
      what: q('#fit-what')?.value ?? state.draft.what,
      includeSettings: q('#fit-settings')?.checked ?? state.draft.includeSettings,
      includeFindings: q('#fit-findings')?.checked ?? state.draft.includeFindings,
    };
  };

  const audit = async (): Promise<AuditReport | null> => {
    try {
      const report = await run();
      state = { ...state, audit: { kind: 'done', summary: summarisePlainly(report) } };
      return report;
    } catch (err) {
      state = { ...state, audit: { kind: 'error', message: err instanceof Error ? err.message : String(err) } };
      return null;
    }
  };

  opts.root.addEventListener('click', (e) => {
    const target = e.target as { getAttribute?(n: string): string | null };
    const action = target.getAttribute?.('data-action') ?? null;
    if (action === null || !action.startsWith('fit-') || action === 'fit-save') return;
    state = { ...state, draft: readDraft() };
    if (action === 'fit-refresh') {
      state = { ...state, facts: readDeviceFacts(env()), notice: T.refreshed[lang] };
      render('[data-action="fit-refresh"]');
    } else if (action === 'fit-run' && state.audit.kind !== 'running') {
      state = { ...state, audit: { kind: 'running' }, notice: T.running[lang] };
      render('[data-action="fit-run"]');
      void (async (): Promise<void> => {
        await audit();
        state = { ...state, notice: state.audit.kind === 'done' ? plainHeadline(state.audit.summary, lang) : T.error[lang] };
        render('[data-action="fit-run"]');
      })();
    } else if (action === 'fit-make') {
      const errors = validateBarrier(state.draft, lang);
      if (errors.length > 0) {
        state = { ...state, errors, text: null, notice: `${T.problems[lang]} ${errors.map((x) => x.message).join(' ')}` };
        render(errors[0]?.field === 'kind' ? FIRST_KIND : '#fit-what');
        return;
      }
      void (async (): Promise<void> => {
        const report = state.draft.includeFindings ? await audit() : null;
        const text = renderBarrierText(state.draft, { location: where(), facts: state.facts, report, now: now(), extra: opts.extraFacts ? opts.extraFacts() : [] }, lang);
        state = { ...state, errors: [], text, notice: T.ready[lang] };
        render('#fit-text');
      })();
    } else if (action === 'fit-copy' && state.text !== null) {
      const text = state.text;
      if (!hasClipboard) {
        state = { ...state, notice: T.noClipboard[lang] };
        render('#fit-text');
        return;
      }
      void (async (): Promise<void> => {
        try {
          await copy(text);
          state = { ...state, notice: T.copied[lang] };
          render('[data-action="fit-copy"]');
        } catch {
          state = { ...state, notice: T.copyFailed[lang] };
          render('#fit-text');
        }
      })();
    } else if (action === 'fit-clear') {
      state = { ...state, draft: EMPTY_DRAFT, errors: [], text: null, notice: T.cleared[lang] };
      render(FIRST_KIND);
    }
  });
  render();
  return { getState: () => state, getDraft: () => readDraft() };
}

/** What the app shell needs to place the panel on a page. */
export const fitPanel = {
  title: T.title,
  mount: mountFitPanel,
} as const;
