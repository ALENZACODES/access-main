// Claim wording. The App has no accounts, sends nothing to a server and keeps
// contributions on the device until the person exports them. Words that suggest
// otherwise (account, server, sync, cloud, upload, telemetry) are allowed only in
// the exact sentences listed here, so a careless line cannot imply a service the
// App does not have.

import type { Locale } from "./copyLint";

const TERMS: Readonly<Record<Locale, RegExp>> = {
  en: /(?<![\p{L}])(?:servers?|accounts?|sign[- ]?in|log[- ]?in|sync(?:ed|s|ing|hroni[sz]ed?|hroni[sz]ation)?|cloud|uploads?|uploaded|uploading|telemetry|analytics|online backup|backed up online)(?![\p{L}])/iu,
  fr: /(?<![\p{L}])(?:serveurs?|comptes?|ouvr\p{L}* une session|connectez-vous|se connecter|synchronis\p{L}*|nuage|infonuagique|téléverse\p{L}*|télécharger vers|télémétrie|analytiques?|sauvegarde en ligne)(?![\p{L}])/iu,
};

/** Text that names these things only to say the App has none. Exact sentences, per language. */
export const APPROVED_CLAIMS: Readonly<Record<Locale, readonly string[]>> = {
  en: ["The App has no accounts and does not send your data anywhere. Everything listed here is on this device."],
  fr: ["L’App n’a pas de comptes et n’envoie vos données nulle part. Tout ce qui est listé ici est sur cet appareil."],
};

export interface ClaimIssue {
  sentence: string;
  term: string;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Sentences that use a claim term without being approved. */
export function claimIssues(locale: Locale, text: string): ClaimIssue[] {
  const approved = new Set(APPROVED_CLAIMS[locale].flatMap(sentences));
  const out: ClaimIssue[] = [];
  for (const s of sentences(text)) {
    if (approved.has(s)) continue;
    const m = TERMS[locale].exec(s);
    if (m !== null) out.push({ sentence: s, term: m[0] });
  }
  return out;
}
