// A plain sentence for what a link hands over, made from what handoffLink.ts read. It says how many addresses an
// email has, how long its text is, how many digits a number has and how precisely a place is written, and never
// repeats the text of an email, a number or a place. It is for showing a person what a link carries before they
// tap it, and for the audits that read the sentences the App could show.

import type { Locale } from "./copyLint";
import { isSingular } from "./html";
import type { LinkDescription } from "./handoffLink";

/** About how many metres one step in the last decimal place of a latitude is, for a place written to `decimals` places. */
export function precisionMetres(decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0) throw new RangeError("decimals must be a whole number of at least 0");
  return 111_320 / 10 ** decimals;
}

/** A distance in plain words: "1 metre", "11 metres", "110 metres", "1.1 kilometres", "111 kilometres". Rounds to two figures. */
export function describeMetres(locale: Locale, metres: number): string {
  const fr = locale === "fr";
  const nbsp = " ";
  const two = (n: number): string => {
    const r = n >= 100 ? Math.round(n / 10) * 10 : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
    const t = String(r);
    return fr ? t.replace(".", ",") : t;
  };
  if (metres >= 1000) {
    const km = metres / 1000;
    const n = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
    const t = fr ? String(n).replace(".", ",") : String(n);
    return `${t}${nbsp}${fr ? "km" : n === 1 ? "kilometre" : "kilometres"}`;
  }
  const t = two(metres);
  return `${t}${nbsp}${fr ? "m" : t === "1" ? "metre" : "metres"}`;
}

const plural = (locale: Locale, n: number, one: string, many: string): string => `${n} ${isSingular(locale, n) ? one : many}`;

function mailPreview(locale: Locale, l: Extract<LinkDescription, { kind: "mailto" }>): string {
  const copied = l.cc.length + l.bcc.length;
  if (locale === "fr") {
    const to = l.to.length === 0 ? "sans adresse de destinataire" : `pour ${plural("fr", l.to.length, "adresse", "adresses")}`;
    const subject = l.subject === null ? "sans objet" : "avec un objet";
    const text = l.bodyChars === 0 ? "sans texte" : `avec ${plural("fr", l.bodyChars, "caractère", "caractères")} de texte sur ${plural("fr", l.bodyLines, "ligne", "lignes")}`;
    const cc = copied === 0 ? "" : `, et ${plural("fr", copied, "adresse", "adresses")} en copie`;
    const extra = l.otherFields.length === 0 ? "" : `, et ${plural("fr", l.otherFields.length, "champ de plus", "champs de plus")}`;
    return `Un brouillon de courriel ${to}, ${subject}, ${text}${cc}${extra}.`;
  }
  const to = l.to.length === 0 ? "with no address to send it to" : `for ${plural("en", l.to.length, "address", "addresses")}`;
  const subject = l.subject === null ? "no subject" : "a subject";
  const text = l.bodyChars === 0 ? "no text" : `${plural("en", l.bodyChars, "character", "characters")} of text on ${plural("en", l.bodyLines, "line", "lines")}`;
  const cc = copied === 0 ? "" : `, and ${plural("en", copied, "address", "addresses")} in copy`;
  const extra = l.otherFields.length === 0 ? "" : `, and ${plural("en", l.otherFields.length, "extra field", "extra fields")}`;
  return `An email draft ${to}, ${subject}, ${text}${cc}${extra}.`;
}

/** One sentence for a link, in the person's language. The text, number and place themselves are not in it. */
export function previewLink(locale: Locale, link: LinkDescription): string {
  const fr = locale === "fr";
  switch (link.kind) {
    case "mailto":
      return mailPreview(locale, link);
    case "tel": {
      const n = link.digits.length;
      const code = link.plus ? (fr ? ", avec l’indicatif du pays" : ", with a country code") : "";
      const ext = link.extension === null ? "" : fr ? ", avec un poste" : ", with an extension";
      return fr ? `Un appel à un numéro de ${plural("fr", n, "chiffre", "chiffres")}${code}${ext}.` : `A call to a number with ${plural("en", n, "digit", "digits")}${code}${ext}.`;
    }
    case "geo": {
      const m = describeMetres(locale, precisionMetres(link.decimals));
      return fr ? `Un lieu sur une carte, écrit avec ${plural("fr", link.decimals, "décimale", "décimales")}, à environ ${m} près.` : `A place on a map, written to ${plural("en", link.decimals, "decimal place", "decimal places")}, to within about ${m}.`;
    }
    case "sms": {
      const who = link.to.length === 0 ? (fr ? "sans destinataire" : "with no one to send it to") : fr ? `pour ${plural("fr", link.to.length, "numéro", "numéros")}` : `for ${plural("en", link.to.length, "number", "numbers")}`;
      const text = link.bodyChars === 0 ? (fr ? "sans texte" : "no text") : fr ? `${plural("fr", link.bodyChars, "caractère", "caractères")} de texte` : `${plural("en", link.bodyChars, "character", "characters")} of text`;
      return fr ? `Un message texte ${who}, ${text}.` : `A text message ${who}, ${text}.`;
    }
  }
}
