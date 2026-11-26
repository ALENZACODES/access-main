/**
 * A plain-text copy of this device's fingerprint, and of a comparison with a pasted one. The text
 * holds counts, hashes and group letters. It holds no place name, note, address or location, and
 * it says that a match is about the saved records only.
 */
import type { Comparison } from "./packFingerprintCompare";
import { comparisonCounts, comparisonGroups, comparisonHeadline, fingerprintLimit } from "./packFingerprintCopy";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

const EOL = "\r\n";

/** The file for "save the code": a title, the date, the code and what it means. */
export function fingerprintToText(code: string, count: number, locale: Locale, today: string): string {
  return (
    [
      t(locale, "Fingerprint of the saved places on this device", "Empreinte des lieux enregistrés sur cet appareil"),
      t(locale, `Made on ${today}`, `Produite le ${today}`),
      t(locale, `Places: ${count}`, `Lieux\u00a0: ${count}`),
      "",
      code.replace(/\n/g, EOL),
      "",
      fingerprintLimit(locale),
    ].join(EOL) + EOL
  );
}

/** A comparison, for a note to keep. Group rows are letter, count here, count there and the result in words. */
export function comparisonToText(c: Comparison, locale: Locale, today: string): string {
  const rows = c.buckets.map((b) => `${b.key}  ${b.here}  ${b.there}  ${b.differs ? t(locale, "differs", "diffère") : t(locale, "same", "identique")}`);
  const groups = comparisonGroups(c, locale);
  return (
    [
      t(locale, "Comparison of saved places between two devices", "Comparaison des lieux enregistrés entre deux appareils"),
      t(locale, `Made on ${today}`, `Produite le ${today}`),
      "",
      comparisonHeadline(c.kind, locale),
      comparisonCounts(c, locale),
      ...(groups === "" ? [] : [groups]),
      "",
      t(locale, "group  this device  other device  result", "groupe  cet appareil  autre appareil  résultat"),
      ...rows,
      "",
      fingerprintLimit(locale),
    ].join(EOL) + EOL
  );
}
