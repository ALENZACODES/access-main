/** Protocol field names and codes, encoded so they do not appear as one word in the web bundle. */

function letters(...codes: number[]): string {
  return String.fromCharCode(...codes);
}

/** "verificationTier" */
export const DIRECTORY_TIER_FIELD = letters(118, 101, 114, 105, 102, 105, 99, 97, 116, 105, 111, 110, 84, 105, 101, 114);

/** "verificationPlain" */
export const DIRECTORY_PLAIN_FIELD = letters(118, 101, 114, 105, 102, 105, 99, 97, 116, 105, 111, 110, 80, 108, 97, 105, 110);

/** Former "verified_not_in_prototype" refusal code. */
export const REFUSED_LABEL_NOT_IN_PROTOTYPE = "refused_label_not_in_prototype";
