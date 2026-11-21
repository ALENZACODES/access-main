import { parseHtml, type HtmlNode } from './htmllint.js';
import { attrOf, inFileOrder, isHiddenNode, nodeLabel } from './markup.js';
import { clip, t, type CheckResult, type Entry, type EntryStatus } from './types.js';

/**
 * Where links point, read from the href in the markup (WCAG 2.4.4 and 4.1.2).
 * A phone or email link that is not well formed is measured and fails,
 * because the dialler or mail program gets the wrong thing or nothing. A link
 * that runs a script, goes nowhere, has no href at all, or sits next to
 * another link to the same place needs a person to look, so those are
 * UNKNOWN. What a link is called belongs to the links check.
 */

export type HrefRule = 'tel-format' | 'mailto-format' | 'script-href' | 'placeholder-href' | 'no-href' | 'adjacent-duplicate';

export const HREF_RULES: readonly HrefRule[] = ['tel-format', 'mailto-format', 'script-href', 'placeholder-href', 'no-href', 'adjacent-duplicate'];

/** Fewest digits in a phone link. Three covers short service numbers such as 211 and 911. */
export const MIN_TEL_DIGITS = 3;

function decoded(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Why a tel: link is not well formed, or null when it is. Follows RFC 3966: digits with - . ( ) as separators, one + at the start, parameters after a semicolon. */
export function telProblem(href: string): 'empty' | 'characters' | 'plus' | 'short' | null {
  const body = decoded(href.trim().slice(4));
  const number = (body.split(/[;?]/)[0] ?? '');
  if (number.trim() === '') return 'empty';
  if (/[^0-9+\-.()]/.test(number)) return 'characters';
  if (number.lastIndexOf('+') > 0) return 'plus';
  if ((number.match(/\d/g) ?? []).length < MIN_TEL_DIGITS) return 'short';
  return null;
}

const ADDRESS = /^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:.]{2,}$/u;

/** Addresses of a mailto: link that are not well formed. `mailto:?subject=x` has no address and is allowed: the person picks the recipient. */
export function mailtoProblems(href: string): string[] {
  const rest = href.trim().slice(7);
  const q = rest.indexOf('?');
  const list = q === -1 ? rest : rest.slice(0, q);
  if (list.trim() === '') return q === -1 ? [''] : [];
  return list.split(',').map((a) => decoded(a).trim()).filter((a) => !ADDRESS.test(a));
}

const scheme = (href: string): string => /^([a-z][a-z0-9+.-]*):/i.exec(href.trim())?.[1]?.toLowerCase() ?? '';

/** True for an href that names no destination: empty, or only `#`. */
export const isPlaceholderHref = (href: string): boolean => href.trim() === '' || href.trim() === '#';

export function auditHrefs(html: string): CheckResult {
  const { nodes } = parseHtml(html);
  const entries: Entry[] = [];
  let checked = 0;
  const add = (n: HtmlNode, rule: HrefRule, status: EntryStatus, en: string, fr: string): void => {
    entries.push({ check: 'hrefs', id: nodeLabel(n), status, rule, message: t(en, fr) });
  };

  for (const n of nodes) {
    if (n.tag !== 'a' && n.tag !== 'area') continue;
    if (isHiddenNode(nodes, n)) continue;
    checked++;
    const href = n.attrs['href'];
    const label = clip(n.text || attrOf(n, 'aria-label') || attrOf(n, 'alt'), 30);

    if (href === undefined) {
      const plainAnchor = n.tag === 'a' && n.text.trim() !== '' && n.attrs['role'] === undefined && n.attrs['aria-current'] === undefined &&
        n.attrs['aria-disabled'] === undefined && n.attrs['onclick'] === undefined;
      if (plainAnchor) {
        add(
          n,
          'no-href',
          'unknown',
          `The anchor “${label}” has no href. The keyboard cannot reach it and it is not announced as a link. If a script makes it act when clicked, use a button, or give it an href. If it is plain text, use a span.`,
          `L’ancre «\u202F${label}\u202F» n’a pas de href. Le clavier ne peut pas l’atteindre et elle n’est pas annoncée comme un lien. Si un script la fait agir au clic, utilisez un bouton, ou donnez-lui un href. Si c’est du simple texte, utilisez un span.`,
        );
      }
      continue;
    }

    const kind = scheme(href);
    if (kind === 'javascript') {
      add(
        n,
        'script-href',
        'unknown',
        `The link “${label}” runs a script from its href. It is announced as a link and does not go anywhere, and opening it in a new tab gives an empty page. Use a button for an action.`,
        `Le lien «\u202F${label}\u202F» lance un script depuis son href. Il est annoncé comme un lien et ne mène nulle part, et l’ouvrir dans un nouvel onglet donne une page vide. Utilisez un bouton pour une action.`,
      );
    } else if (isPlaceholderHref(href)) {
      add(
        n,
        'placeholder-href',
        'unknown',
        `The link “${label}” has ${href.trim() === '' ? 'an empty href' : 'an href of #'}, so it goes nowhere. If a script handles the click, a button says what it is. If the destination is still to come, leave the link out until it exists.`,
        `Le lien «\u202F${label}\u202F» a ${href.trim() === '' ? 'un href vide' : 'un href réduit à #'}\u00A0: il ne mène nulle part. Si un script gère le clic, un bouton dit ce que c’est. Si la destination reste à venir, retirez le lien jusqu’à ce qu’elle existe.`,
      );
    } else if (kind === 'tel') {
      const problem = telProblem(href);
      if (problem !== null) {
        const why = {
          empty: { en: 'holds no number', fr: 'ne contient aucun numéro' },
          characters: { en: 'holds spaces, letters or other characters a phone number cannot have', fr: 'contient des espaces, des lettres ou d’autres caractères qu’un numéro de téléphone ne peut pas avoir' },
          plus: { en: 'has a plus sign that is not at the start', fr: 'a un signe plus qui n’est pas au début' },
          short: { en: `has fewer than ${MIN_TEL_DIGITS} digits`, fr: `compte moins de ${MIN_TEL_DIGITS} chiffres` },
        }[problem];
        add(
          n,
          'tel-format',
          'fail',
          `The phone link “${clip(href.trim(), 36)}” ${why.en}. A dialler can cut the number short or refuse it. Write only digits after tel:, with + and the country code first, for example tel:+14165550100.`,
          `Le lien téléphonique «\u202F${clip(href.trim(), 36)}\u202F» ${why.fr}. Un composeur peut tronquer le numéro ou le refuser. Écrivez seulement des chiffres après le préfixe tel, avec + et l’indicatif du pays d’abord, par exemple tel:+14165550100.`,
        );
      }
    } else if (kind === 'mailto') {
      const bad = mailtoProblems(href);
      if (bad.length > 0) {
        const shown = bad[0] === '' ? '' : clip(bad[0] ?? '', 36);
        add(
          n,
          'mailto-format',
          'fail',
          shown === ''
            ? `The email link “${label}” has no address after mailto:. The mail program opens with nobody to write to.`
            : `The email link “${label}” holds “${shown}”, which is not an email address. The mail program opens with a recipient it cannot send to.`,
          shown === ''
            ? `Le lien de courriel «\u202F${label}\u202F» n’a aucune adresse après le préfixe mailto. Le logiciel de courriel s’ouvre sans destinataire.`
            : `Le lien de courriel «\u202F${label}\u202F» contient «\u202F${shown}\u202F», qui n’est pas une adresse de courriel. Le logiciel de courriel s’ouvre avec un destinataire auquel il ne peut rien envoyer.`,
        );
      }
    }
  }

  // An image link and a text link to the same place, side by side: two stops and two announcements for one destination.
  for (const parent of nodes) {
    for (let i = 0; i + 1 < parent.children.length; i++) {
      const a = nodes[parent.children[i] ?? -1];
      const b = nodes[parent.children[i + 1] ?? -1];
      if (!a || !b || a.tag !== 'a' || b.tag !== 'a') continue;
      const ha = a.attrs['href'];
      const hb = b.attrs['href'];
      if (ha === undefined || hb === undefined || isPlaceholderHref(ha) || ha.trim() !== hb.trim()) continue;
      if (isHiddenNode(nodes, a) || isHiddenNode(nodes, b)) continue;
      const picture = (n: HtmlNode): boolean => n.own.trim() === '' && n.children.some((c) => nodes[c]?.tag === 'img' || nodes[c]?.tag === 'svg' || nodes[c]?.tag === 'picture');
      if (picture(a) === picture(b)) continue;
      add(
        b,
        'adjacent-duplicate',
        'unknown',
        `Two links side by side go to “${clip(ha.trim(), 36)}”, one of them an image. Keyboard users stop twice and screen reader users hear the destination twice. Put the image and the text in one link.`,
        `Deux liens côte à côte mènent à «\u202F${clip(ha.trim(), 36)}\u202F», dont une image. Au clavier, on s’arrête deux fois, et au lecteur d’écran, on entend deux fois la destination. Placez l’image et le texte dans un seul lien.`,
      );
    }
  }
  return { checked, entries: inFileOrder(entries) };
}
