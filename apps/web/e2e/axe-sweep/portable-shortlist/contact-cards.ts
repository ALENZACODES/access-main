/** Read the vCard 3.0 subset used for offline place exports, independently of the writer. */
export interface ContactCard {
  readonly name: string;
  readonly category: string;
  readonly address: string | null;
  readonly coordinate: { readonly lat: number; readonly lon: number } | null;
  readonly note: string;
  readonly url: string | null;
  readonly uid: string;
}

interface ContentLine {
  readonly number: number;
  readonly text: string;
}

type Property = { readonly number: number; readonly value: string };
const byteCount = new TextEncoder();

function invalid(line: number, detail: string): never {
  throw new Error(`Invalid place vCard at line ${line}: ${detail}`);
}

/** Remember the starting physical line so a bad field can be found in the original file. */
function* unfold(text: string): Generator<ContentLine> {
  let current: ContentLine | null = null;
  let offset = 0;
  let number = 0;
  while (offset < text.length) {
    number++;
    const end = text.indexOf("\r\n", offset);
    if (end < 0) invalid(number, "expected CRLF at the end of the physical line");
    const part = text.slice(offset, end);
    offset = end + 2;
    if (!part.length) invalid(number, "empty physical line");
    if (byteCount.encode(part).byteLength > 75) invalid(number, "physical line exceeds 75 UTF-8 octets");
    // Check before joining: a surrogate pair split by a fold is already damaged on disk.
    for (const character of part) {
      const cp = character.codePointAt(0)!;
      if (cp < 32 || cp === 127 || cp === 0x2028 || cp === 0x2029 ||
          (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)) {
        invalid(number, "unexpected control or direction override");
      }
      if (cp >= 0xd800 && cp <= 0xdfff) invalid(number, "unpaired UTF-16 surrogate");
    }
    if (part.startsWith(" ")) {
      if (current === null) invalid(number, "continuation without a preceding line");
      if (part.length === 1) invalid(number, "empty continuation");
      current = { number: current.number, text: current.text + part.slice(1) };
    } else {
      if (current !== null) yield current;
      current = { number, text: part };
    }
  }
  if (current !== null) yield current;
}

/** Decode as we split so an escaped separator remains part of its component. */
function components(field: Property): string[] {
  const parts: string[] = [];
  let part = "";
  let escaped = false;
  for (const ch of field.value) {
    if (escaped) {
      if (ch !== "\\" && ch !== "," && ch !== ";") invalid(field.number, `unexpected text escape \\${ch}`);
      part += ch;
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === ";") {
      parts.push(part);
      part = "";
    } else if (ch === ",") {
      invalid(field.number, "unescaped comma in a text value");
    } else {
      part += ch;
    }
  }
  if (escaped) invalid(field.number, "incomplete text escape");
  parts.push(part);
  return parts;
}

/** N stores the place in the family-name slot. ADR uses the work street-address slot. */
function component(field: Property, count = 1, slot = 0): string {
  const parts = components(field);
  if (parts.length !== count) invalid(field.number, `expected ${count} text component(s), found ${parts.length}`);
  if (parts.some((part, index) => index !== slot && part !== "")) {
    invalid(field.number, "unexpected occupied component");
  }
  const value = parts[slot]!;
  if (!value.trim()) invalid(field.number, "empty text component");
  return value;
}

function coordinate(field: Property): NonNullable<ContactCard["coordinate"]> {
  const match = /^(-?\d{1,3}\.\d{5});(-?\d{1,3}\.\d{5})$/.exec(field.value);
  if (!match) invalid(field.number, "GEO requires two decimal coordinates with five fractional digits");
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) invalid(field.number, "GEO is outside coordinate bounds");
  return { lat, lon };
}

function sourceLink(field: Property): string {
  if (!/^https:\/\/[^\s\\]+$/.test(field.value) || !URL.canParse(field.value)) {
    invalid(field.number, "URL must be an absolute HTTPS source link");
  }
  // Keep the exported source address, including percent-encoding and punctuation, intact.
  return field.value;
}

const exportedProperties = new Set([
  "VERSION", "PRODID", "FN", "N", "ORG", "ADR;TYPE=WORK", "GEO", "NOTE", "URL", "UID",
]);

function readCard(fields: ReadonlyMap<string, Property>, start: number): ContactCard {
  function required(name: string): Property {
    const field = fields.get(name);
    if (!field) invalid(start, `missing ${name}`);
    return field;
  }
  const version = required("VERSION");
  if (version.value !== "3.0") invalid(version.number, "expected VERSION:3.0");
  const product = required("PRODID");
  if (product.value !== "-//Ontario accessibility app//Places//EN") invalid(product.number, "unexpected PRODID");
  const uid = required("UID");
  if (!/^pack-place-(?:[A-Za-z0-9._-]|~[0-9a-f]{4})+$/.test(uid.value)) {
    invalid(uid.number, "missing or invalid place UID");
  }
  const name = component(required("FN"));
  const structuredName = required("N");
  if (component(structuredName, 5) !== name) invalid(structuredName.number, "N does not match FN");
  const address = fields.get("ADR;TYPE=WORK");
  const geo = fields.get("GEO");
  const url = fields.get("URL");
  return {
    name,
    category: component(required("ORG")),
    address: address ? component(address, 7, 2) : null,
    coordinate: geo ? coordinate(geo) : null,
    note: component(required("NOTE")),
    url: url ? sourceLink(url) : null,
    uid: uid.value,
  };
}

/** Parse the complete download or throw. An empty collection is a valid zero-byte export. */
export function readContactCards(text: string): readonly ContactCard[] {
  const cards: ContactCard[] = [];
  const uids = new Set<string>();
  const fields = new Map<string, Property>();
  let start: number | null = null;
  for (const line of unfold(text)) {
    if (line.text === "BEGIN:VCARD") {
      if (start !== null) invalid(line.number, "nested BEGIN:VCARD");
      start = line.number;
      fields.clear();
      continue;
    }
    if (start === null) invalid(line.number, "content outside a card");
    if (line.text === "END:VCARD") {
      const card = readCard(fields, start);
      if (uids.has(card.uid)) invalid(fields.get("UID")!.number, "duplicate UID across cards");
      uids.add(card.uid);
      cards.push(card);
      start = null;
      continue;
    }
    const colon = line.text.indexOf(":");
    if (colon < 1) invalid(line.number, "missing property separator");
    const key = line.text.slice(0, colon);
    if (!exportedProperties.has(key)) invalid(line.number, `unexpected property ${key}`);
    if (fields.has(key)) invalid(line.number, `duplicate ${key}`);
    fields.set(key, { number: line.number, value: line.text.slice(colon + 1) });
  }
  if (start !== null) invalid(start, "missing END:VCARD");
  return cards;
}
