/** EN + FR user strings for the a11y shell helpers. */
export type Lang = 'en' | 'fr';

export const SKIP_LINK: Readonly<Record<Lang, string>> = {
  en: 'Skip to main content',
  fr: 'Aller au contenu principal',
};

export function skipLinkLabel(lang: string): string {
  return lang.toLowerCase().startsWith('fr') ? SKIP_LINK.fr : SKIP_LINK.en;
}
