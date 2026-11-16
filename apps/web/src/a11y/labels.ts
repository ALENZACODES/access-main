import { en } from '../i18n/en.ts';
import { fr } from '../i18n/fr.ts';

/** Skip-link label, always taken from t('skip') so the two cannot drift. */
export type Lang = 'en' | 'fr';

export function skipLinkLabel(lang: string): string {
  return lang.toLowerCase().startsWith('fr') ? fr.skip : en.skip;
}
