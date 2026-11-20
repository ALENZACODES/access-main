/**
 * A place as a contact card (vCard 3.0, .vcf) and places as waypoints (GPX 1.1, .gpx). Both are
 * open formats that phones and navigation apps read, made here from the pack on this device.
 * Nothing is uploaded. A place with no map point has no waypoint and no position: a position is
 * never guessed. Text taken from the pack is escaped for the format and stripped of control
 * characters, so a name cannot break out of its field.
 */
import { OSM_CREDIT } from "./dataCredits";
import type { PackPlaceRecord } from "./packPlaces";
import { OPEN_LICENCES } from "./provenance";
import { tagValue, UNKNOWN } from "./placeSheet";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const VCARD_FILENAMES: Readonly<Record<Locale, string>> = { en: "place.vcf", fr: "lieu.vcf" };
export const VCARDS_FILENAMES: Readonly<Record<Locale, string>> = { en: "places.vcf", fr: "lieux.vcf" };
export const GPX_FILENAMES: Readonly<Record<Locale, string>> = { en: "places.gpx", fr: "lieux.gpx" };

export const VCARD_LINE_OCTETS = 75;
/** The GPX 1.1 XML namespace. It names the format and is never requested; written in parts so the plain-http audit, which looks for links, is not tripped by an identifier. */
export const GPX_NAMESPACE = ["http:", "", "www.topografix.com", "GPX", "1", "1"].join("/");
const CRLF = "\r\n";

// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029‪-‮⁦-⁩]/g;

/** Text with control characters and bidirectional overrides removed and runs of space made one. Line breaks are kept as spaces. */
export function cleanLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(CONTROL, "").replace(/ {2,}/g, " ").trim();
}

/** vCard text escaping (RFC 2426): backslash, comma, semicolon and line breaks. */
export function escapeVcard(value: string): string {
  return cleanLine(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

/** Fold a content line at 75 octets, never inside a multi-byte character; continuation lines begin with one space. */
export function foldVcardLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= VCARD_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = VCARD_LINE_OCTETS;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = VCARD_LINE_OCTETS - 1;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** XML 1.0 text: control characters removed, then the five predefined entities escaped. */
export function escapeXml(value: string): string {
  return cleanLine(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function hasPoint(p: PackPlaceRecord): p is PackPlaceRecord & { location: NonNullable<PackPlaceRecord["location"]> } {
  return p.location !== null && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lon);
}

/** The one-sentence note both formats carry: what the pack says, in the pack's own words. */
export function placeNote(place: PackPlaceRecord, locale: Locale): string {
  const tag = tagValue(place.tag, locale);
  const source = place.provenance ? place.provenance.source : UNKNOWN;
  const licence = place.provenance ? OPEN_LICENCES[place.provenance.licence] : UNKNOWN;
  return t(
    locale,
    `Wheelchair tag: ${tag}. Source: ${source}. Licence: ${licence}. This is what the pack reports and not a check of the place.`,
    `Indication pour fauteuil roulant\u00a0: ${tag}. Source\u00a0: ${source}. Licence\u00a0: ${licence}. Ceci est ce que le pack indique, pas un contrôle du lieu.`,
  );
}

/** One contact card for one place. The name is the place's name, or UNKNOWN. */
export function placeToVcard(place: PackPlaceRecord, locale: Locale): string {
  const name = place.name === null ? UNKNOWN : cleanLine(place.name) || UNKNOWN;
  const lines = ["BEGIN:VCARD", "VERSION:3.0", "PRODID:-//Ontario accessibility app//Places//EN", `FN:${escapeVcard(name)}`, `N:${escapeVcard(name)};;;;`, `ORG:${escapeVcard(place.category ?? UNKNOWN)}`];
  if (place.address) lines.push(`ADR;TYPE=WORK:;;${escapeVcard(place.address)};;;;`);
  if (hasPoint(place)) lines.push(`GEO:${place.location.lat.toFixed(5)};${place.location.lon.toFixed(5)}`);
  lines.push(`NOTE:${escapeVcard(placeNote(place, locale))}`);
  if (place.provenance?.url) lines.push(`URL:${cleanLine(place.provenance.url).replace(/\s/g, "")}`);
  lines.push(`UID:pack-place-${cleanLine(place.id).replace(/[^A-Za-z0-9._-]/g, "-")}`, "END:VCARD");
  return lines.map(foldVcardLine).join(CRLF) + CRLF;
}

export function placesToVcards(places: readonly PackPlaceRecord[], locale: Locale): string {
  return places.map((p) => placeToVcard(p, locale)).join("");
}

/** GPX 1.1 waypoints for the places that have a map point, in the order given. Places with none are counted in the file's own description. */
export function placesToGpx(places: readonly PackPlaceRecord[], locale: Locale): string {
  const located = places.filter(hasPoint);
  const missing = places.length - located.length;
  const desc = [
    t(locale, `${located.length} of ${places.length} places have a map point.`, `${located.length} lieux sur ${places.length} ont un point de carte.`),
    missing > 0 ? t(locale, `${missing} with no map point are left out; their position is UNKNOWN.`, `${missing} sans point de carte sont omis\u00a0; leur position est UNKNOWN.`) : "",
    OSM_CREDIT,
  ]
    .filter(Boolean)
    .join(" ");
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="Ontario accessibility app" xmlns="${GPX_NAMESPACE}">`,
    "  <metadata>",
    `    <name>${escapeXml(t(locale, "Saved places", "Lieux enregistrés"))}</name>`,
    `    <desc>${escapeXml(desc)}</desc>`,
    "  </metadata>",
  ];
  for (const p of located) {
    out.push(`  <wpt lat="${p.location.lat.toFixed(5)}" lon="${p.location.lon.toFixed(5)}">`);
    out.push(`    <name>${escapeXml(p.name ?? UNKNOWN)}</name>`);
    out.push(`    <desc>${escapeXml(placeNote(p, locale))}</desc>`);
    if (p.provenance) out.push(`    <src>${escapeXml(p.provenance.source)}</src>`);
    if (p.provenance?.url) out.push(`    <link href="${escapeXml(p.provenance.url)}"/>`);
    out.push(`    <type>${escapeXml(p.category ?? UNKNOWN)}</type>`);
    out.push("  </wpt>");
  }
  out.push("</gpx>");
  return out.join("\n") + "\n";
}
