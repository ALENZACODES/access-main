/** Words for reading a pasted point: what was understood, what was wrong, and the other ways to write the same point. */
import { POINT_STYLES, type PointStyle, formatPointAs } from "./pointFormat";
import type { PointFormat, PointProblem, PointRead } from "./pointRead";
import type { Point } from "./packGeo";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export function pointFormatName(f: PointFormat, locale: Locale): string {
  switch (f) {
    case "decimal":
      return t(locale, "decimal degrees", "degrés décimaux");
    case "hemisphere":
      return t(locale, "degrees with north, south, east or west", "degrés avec nord, sud, est ou ouest");
    case "dm":
      return t(locale, "degrees and minutes", "degrés et minutes");
    case "dms":
      return t(locale, "degrees, minutes and seconds", "degrés, minutes et secondes");
    case "geo-link":
      return t(locale, "a geo link", "un lien geo");
    case "map-link":
      return t(locale, "a map link", "un lien de carte");
  }
}

export function pointStyleName(s: PointStyle, locale: Locale): string {
  switch (s) {
    case "decimal":
      return t(locale, "Decimal degrees", "Degrés décimaux");
    case "hemisphere":
      return t(locale, "Degrees with N, S, E, W", "Degrés avec N, S, E, O");
    case "dm":
      return t(locale, "Degrees and minutes", "Degrés et minutes");
    case "dms":
      return t(locale, "Degrees, minutes and seconds", "Degrés, minutes et secondes");
    case "geo":
      return t(locale, "Geo link", "Lien geo");
  }
}

export function pointProblemText(p: PointProblem, locale: Locale): string {
  switch (p) {
    case "too-long":
      return t(locale, "That is too long to be a point. Paste only the point.", "C’est trop long pour un point. Collez seulement le point.");
    case "no-numbers":
      return t(locale, "No numbers were found.", "Aucun nombre n’a été trouvé.");
    case "one-number":
      return t(locale, "Only one number was found. A point needs a latitude and a longitude.", "Un seul nombre a été trouvé. Un point demande une latitude et une longitude.");
    case "number-count":
      return t(locale, "The numbers do not make a point. Use two numbers, or four for degrees and minutes, or six for degrees, minutes and seconds.", "Les nombres ne forment pas un point. Utilisez deux nombres, ou quatre pour des degrés et minutes, ou six pour des degrés, minutes et secondes.");
    case "out-of-range":
      return t(locale, "A latitude must be from -90 to 90 and a longitude from -180 to 180.", "Une latitude doit être de -90 à 90 et une longitude de -180 à 180.");
    case "bad-minutes":
      return t(locale, "Minutes and seconds must be under 60, and degrees and minutes must be whole when a smaller part follows.", "Les minutes et les secondes doivent être inférieures à 60, et les degrés et minutes doivent être entiers lorsqu’une partie plus petite suit.");
    case "bad-letters":
      return t(locale, "Use one of N or S and one of E or W (O in French), each beside its own number.", "Utilisez N ou S et E ou O, chacun à côté de son nombre.");
    case "sign-and-letter":
      return t(locale, "Use either a minus sign or a letter S or W, not both.", "Utilisez un signe moins ou la lettre S ou O, pas les deux.");
    case "mixed-parts":
      return t(locale, "Write the latitude and the longitude with the same parts, for example both in degrees and minutes.", "Écrivez la latitude et la longitude avec les mêmes parties, par exemple toutes deux en degrés et minutes.");
    case "link-no-point":
      return t(locale, "No point was found in that link. A link with the point in it is needed.", "Aucun point n’a été trouvé dans ce lien. Il faut un lien qui contient le point.");
    case "stray-text":
      return t(locale, "There are words or marks that are not part of a point.", "Il y a des mots ou des signes qui ne font pas partie d’un point.");
  }
}

/** "Read as 43.65000, -79.38000, from decimal degrees." and a note when the order was changed. */
export function pointReadText(r: Extract<PointRead, { status: "ok" }>, locale: Locale): string {
  const text = formatPointAs(r.point, "decimal", locale);
  const head = t(locale, `Read as ${text}, from ${pointFormatName(r.format, locale)}.`, `Lu comme ${text}, à partir de ${pointFormatName(r.format, locale)}.`);
  const swap = r.swapped ? t(locale, " The first number was over 90, so it was read as the longitude. Check that this is right.", " Le premier nombre dépassait 90; il a donc été lu comme la longitude. Vérifiez que c’est exact.") : "";
  return `${head}${swap}`;
}

/** What to say about a pasted text in any state. Empty text says nothing. */
export function pointStatusText(r: PointRead, locale: Locale): string {
  if (r.status === "none") return "";
  return r.status === "invalid" ? pointProblemText(r.problem, locale) : pointReadText(r, locale);
}

export function pointPasteHelp(locale: Locale): string {
  return t(
    locale,
    "Paste a point in any of these forms: 43.65, -79.38  |  43.65 N, 79.38 W  |  43° 39.0′ N, 79° 22.8′ W  |  a geo link  |  a map link that holds a point.",
    "Collez un point dans l’une de ces formes\u00a0: 43,65\u202f; -79,38  |  43,65 N\u202f; 79,38 O  |  43° 39,0′ N\u202f; 79° 22,8′ O  |  un lien geo  |  un lien de carte qui contient un point.",
  );
}

/** The same point in each style, for reading aloud or typing into another program. */
export function pointEquivalents(p: Point, locale: Locale): ReadonlyArray<{ readonly style: PointStyle; readonly label: string; readonly text: string }> {
  return POINT_STYLES.map((style) => ({ style, label: pointStyleName(style, locale), text: formatPointAs(p, style, locale) }));
}
