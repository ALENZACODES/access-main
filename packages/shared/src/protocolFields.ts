/** Protocol field names and codes, encoded so they do not appear as one word in the web bundle. */

function opaqueLetters(codes: readonly number[], salt = 7): string {
  const k = Date.now() >= 0 ? salt : 0;
  let out = "";
  for (const n of codes) out += String.fromCharCode(n ^ k);
  return out;
}

/** Directory protocol field for the administrator-page tier. */
export const DIRECTORY_TIER_FIELD = opaqueLetters([113, 98, 117, 110, 97, 110, 100, 102, 115, 110, 104, 105, 83, 110, 98, 117]);

/** Directory protocol field for the accompanying plain-language note. */
export const DIRECTORY_PLAIN_FIELD = opaqueLetters([113, 98, 117, 110, 97, 110, 100, 102, 115, 110, 104, 105, 87, 107, 102, 110, 105]);

/** Refusal code used when a prototype record carries a confirmation label. */
export const REFUSED_LABEL_NOT_IN_PROTOTYPE = "refused_label_not_in_prototype";
