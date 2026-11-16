import { t, type CheckResult, type Entry } from './types.js';
import type { OneTimeFact, PasswordFact } from './semantics.js';

/**
 * Signing in without a memory or transcription test (WCAG 3.3.8). Blocking
 * paste or autofill on a password field is a measured failure. A test the
 * tool cannot judge (a captcha, a code to copy by hand) is UNKNOWN.
 */

export type AuthRule = 'paste-blocked' | 'autocomplete-off' | 'no-username' | 'otp-no-autofill' | 'captcha';

export const AUTH_RULES: readonly AuthRule[] = ['paste-blocked', 'autocomplete-off', 'no-username', 'otp-no-autofill', 'captcha'];

export interface AuthFacts {
  readonly passwords: readonly PasswordFact[];
  readonly oneTime: readonly OneTimeFact[];
  readonly captchas: readonly string[];
}

export function auditAuth(facts: AuthFacts): CheckResult {
  const entries: Entry[] = [];
  const add = (id: string, status: 'fail' | 'unknown', rule: AuthRule, en: string, fr: string): void => {
    entries.push({ check: 'auth', id, status, rule, message: t(en, fr) });
  };
  for (const p of facts.passwords) {
    if (p.pasteBlocked) {
      add(p.id, 'fail', 'paste-blocked', 'Pasting into the password field is blocked, so a password manager cannot fill it.', 'Le collage dans le champ du mot de passe est bloqué, un gestionnaire de mots de passe ne peut donc pas le remplir.');
    }
    if (p.autocomplete === 'off') {
      add(p.id, 'fail', 'autocomplete-off', 'The password field turns autocomplete off, so the browser cannot offer a saved password.', 'Le champ du mot de passe désactive l’autocomplétion, le navigateur ne peut donc pas proposer un mot de passe enregistré.');
    } else if (!p.hasUsername) {
      add(p.id, 'unknown', 'no-username', 'The password field has no user name or email field with it. Check that a saved login can be filled.', 'Le champ du mot de passe n’a pas de champ d’identifiant ou de courriel avec lui. Contrôlez qu’un identifiant enregistré peut être rempli.');
    }
  }
  for (const o of facts.oneTime) {
    if (!o.autocomplete.split(/\s+/).includes('one-time-code')) {
      add(o.id, 'unknown', 'otp-no-autofill', 'This looks like a one-time code field without autocomplete one-time-code. Check that the code does not have to be typed by hand.', 'Ce champ ressemble à un code à usage unique sans autocomplete one-time-code. Contrôlez que le code n’a pas à être saisi à la main.');
    }
  }
  for (const c of facts.captchas) {
    add(c, 'unknown', 'captcha', 'This page seems to use a captcha. Check that there is a way to sign in that needs no puzzle, text to copy or object to recognise.', 'Cette page semble utiliser un captcha. Contrôlez qu’il existe un moyen de se connecter sans énigme, texte à recopier ni objet à reconnaître.');
  }
  return { checked: facts.passwords.length + facts.oneTime.length + facts.captchas.length, entries };
}
