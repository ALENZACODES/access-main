import type { CheckResult, Entry, EntryStatus } from './types.js';

/**
 * Checks a JSON file of records for recorded source, licence and retrieval
 * date, and for facts that keep "unknown" as unknown. The record shape is:
 *
 *   { id, source: { name, url, licence, retrieved: "YYYY-MM-DD" },
 *     facts: { key: "yes" | "no" | "unknown" | { value, evidence? } } }
 *
 * The licence list is a convenience, not legal advice. Pass your own list to
 * change it.
 */

export type Tri = 'yes' | 'no' | 'unknown';

export const OPEN_LICENCES: readonly string[] = [
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0', 'ODC-By-1.0', 'PDDL-1.0',
  'OGL-Canada-2.0', 'OGL-Ontario', 'OGL-UK-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense',
];

export interface ProvenanceOptions {
  readonly now: Date;
  readonly allowedLicences?: readonly string[];
  /** Fact keys that every record must state explicitly, using "unknown" when not known. */
  readonly requiredFacts?: readonly string[];
}

const UNKNOWN_SPELLINGS = new Set(['', 'n/a', 'na', 'none', 'null', '?', 'tbd', 'unclear', 'not sure', 'inconnu', 'aucun', 'non disponible', 'unknown ']);
const INFERENCE_WORDS = /\b(?:assumed|inferred|probably|likely|presumed|estimated|guess(?:ed)?|supposed|probablement|presume|suppose|estime)\b/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validDate(s: string): Date | null {
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : null;
}

export function auditProvenance(data: unknown, opts: ProvenanceOptions): CheckResult {
  const entries: Entry[] = [];
  const allowed = new Set((opts.allowedLicences ?? OPEN_LICENCES).map((l) => l.toLowerCase()));
  const add = (id: string, rule: string, en: string, fr: string, status: EntryStatus = 'fail'): void => {
    entries.push({ check: 'provenance', id, status, rule, message: { en, fr } });
  };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data['records']) ? data['records'] : null;
  if (list === null) {
    add('data', 'shape', 'The file must hold a list of records.', 'Le fichier doit contenir une liste d’enregistrements.');
    return { checked: 1, entries };
  }
  list.forEach((rec: unknown, i: number) => {
    if (!isRecord(rec)) {
      add(`#${i}`, 'shape', 'This record is not an object.', 'Cet enregistrement n’est pas un objet.');
      return;
    }
    const id = typeof rec['id'] === 'string' && rec['id'] ? rec['id'] : `#${i}`;
    const src = rec['source'];
    if (!isRecord(src)) {
      add(id, 'source-missing', 'No source is recorded.', 'Aucune source n’est consignée.');
    } else {
      for (const f of ['name', 'url', 'licence', 'retrieved']) {
        const v = src[f];
        if (typeof v !== 'string' || !v.trim()) add(id, `source-${f}`, `The source has no ${f}.`, `La source n’a pas de champ ${f}.`);
      }
      const url = src['url'];
      if (typeof url === 'string' && url.trim() && !/^https:\/\//i.test(url.trim())) {
        add(id, 'source-url', 'The source URL must use https.', 'L’URL de la source doit utiliser https.');
      }
      const lic = src['licence'];
      if (typeof lic === 'string' && lic.trim() && !allowed.has(lic.trim().toLowerCase())) {
        add(id, 'licence-unlisted', 'The licence is not on the open licence list. Check it by hand.', 'La licence ne figure pas dans la liste des licences ouvertes. À examiner à la main.', 'unknown');
      }
      const ret = src['retrieved'];
      if (typeof ret === 'string' && ret.trim()) {
        const d = validDate(ret.trim());
        if (!d) add(id, 'retrieved-format', 'The retrieval date must be a real date written YYYY-MM-DD.', 'La date de collecte doit être une vraie date au format AAAA-MM-JJ.');
        else if (d.getTime() > opts.now.getTime()) add(id, 'retrieved-future', 'The retrieval date is in the future.', 'La date de collecte est dans le futur.');
      }
    }
    const facts = rec['facts'];
    const factMap = isRecord(facts) ? facts : {};
    for (const key of opts.requiredFacts ?? []) {
      if (!(key in factMap)) add(`${id}.${key}`, 'fact-missing', 'The fact is not stated. Write "unknown" when it is not known.', 'Le fait n’est pas indiqué. Écrivez «\u202Funknown\u202F» lorsqu’il n’est pas connu.');
    }
    for (const [key, raw] of Object.entries(factMap)) {
      const fid = `${id}.${key}`;
      const value = isRecord(raw) ? raw['value'] : raw;
      const evidence = isRecord(raw) ? raw['evidence'] : undefined;
      if (typeof value === 'boolean') {
        if (!isRecord(src)) add(fid, 'fact-unsourced', 'A yes or no fact needs a source.', 'Un fait oui ou non nécessite une source.');
      } else if (typeof value === 'string' && (value === 'yes' || value === 'no')) {
        if (!isRecord(src)) add(fid, 'fact-unsourced', 'A yes or no fact needs a source.', 'Un fait oui ou non nécessite une source.');
      } else if (value === 'unknown') {
        // stays unknown
      } else if (value === null || value === undefined || (typeof value === 'string' && UNKNOWN_SPELLINGS.has(value.trim().toLowerCase()))) {
        add(fid, 'fact-unknown-spelling', 'An unknown fact must be written "unknown", not left empty or written another way.', 'Un fait UNKNOWN doit s’écrire «\u202Funknown\u202F», sans valeur vide ni autre formulation.');
      } else {
        add(fid, 'fact-value', 'The value must be "yes", "no" or "unknown".', 'La valeur doit être «\u202Fyes\u202F», «\u202Fno\u202F» ou «\u202Funknown\u202F».');
      }
      if (typeof evidence === 'string' && INFERENCE_WORDS.test(evidence.normalize('NFD').replace(/\p{M}/gu, '')) && value !== 'unknown') {
        add(fid, 'fact-inferred', 'The evidence reads as a guess. Record the fact as unknown instead.', 'La preuve ressemble à une supposition. Consignez plutôt le fait comme UNKNOWN.');
      }
    }
  });
  return { checked: list.length, entries };
}
