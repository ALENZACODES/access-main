/** Rebuild forbidden organisation names from code points so those names never appear in source. */
function fromCodes(codes: readonly number[]): string {
  return String.fromCharCode(...codes);
}

const SHORT = fromCodes([83, 67, 73, 79]);
const DOMAIN = fromCodes([115, 99, 105, 111, 110, 116, 97, 114, 105, 111]);
const FULL_EN = fromCodes([83, 112, 105, 110, 97, 108, 32, 67, 111, 114, 100, 32, 73, 110, 106, 117, 114, 121, 32, 79, 110, 116, 97, 114, 105, 111]);
const FULL_FR = fromCodes([76, 233, 115, 105, 111, 110, 115, 32, 77, 233, 100, 117, 108, 108, 97, 105, 114, 101, 115, 32, 79, 110, 116, 97, 114, 105, 111]);
const PERSON = fromCodes([86, 105, 103, 109, 111, 110, 100]);

export function forbiddenOrgNeedles(): string[] {
  return [SHORT, DOMAIN, `${DOMAIN}.org`, `www.${DOMAIN}.org`, FULL_EN, FULL_FR, PERSON];
}

export function containsForbiddenOrg(text: string): boolean {
  const lower = text.toLowerCase();
  return forbiddenOrgNeedles().some((needle) => lower.includes(needle.toLowerCase()));
}

/** Sample claim used only in negative tests. The assertion must not print the needle. */
export function endorsedByForbiddenOrgSample(lang: "en" | "fr" = "en"): string {
  return lang === "fr" ? `Application officielle de ${SHORT}` : `Endorsed by ${FULL_EN}`;
}

export function assertNoForbiddenOrg(text: string, label = "text"): void {
  if (containsForbiddenOrg(text)) {
    throw new Error(`forbidden organisation name found in ${label}`);
  }
}
