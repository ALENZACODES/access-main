import { expect, test } from "@playwright/test";
import {
  auditFrenchFragments, formatFrenchDraft, frenchSpacingToken,
  frenchTypographyFindings, hasFrenchTypographyIssues, isFormattedFrenchQuote,
  NO_BREAK_SPACE, NARROW_NO_BREAK_SPACE, CURLY_APOSTROPHE,
  punctuationSummary, quoteFrench, trailingHardSpaces,
  typographyCountsByPath, unicodeApostrophePositions,
  type TypographyFragment,
} from "./p20w-french-typography";

const fragment = (text: string, changes: Partial<TypographyFragment> = {}): TypographyFragment => ({
  path: "#paragraph", text, language: "fr-CA", visible: true, kind: "text", ...changes,
});
const codes = (text: string): string[] => frenchTypographyFindings(fragment(text)).map((entry) => entry.code);

test.describe("P20W French punctuation contract", () => {
  test("French text with all required spaces passes", () => {
    const copy = `L${CURLY_APOSTROPHE}information${NO_BREAK_SPACE}: ${quoteFrench("exemple")}${NARROW_NO_BREAK_SPACE}!`;
    expect(codes(copy)).toEqual([]);
  });
  for (const phrase of ["L'information", "d'accord", "qu'il", "c'est", "l'école"]) {
    test(`flags straight apostrophe in ${phrase}`, () => {
      expect(codes(phrase)).toContain("straight-apostrophe");
    });
  }
  for (const phrase of ["L’information", "d’accord", "qu’il", "c’est", "l’école"]) {
    test(`accepts typographic apostrophe in ${phrase}`, () => {
      expect(codes(phrase)).not.toContain("straight-apostrophe");
    });
  }
  test("English passages are explicitly excluded", () => {
    expect(frenchTypographyFindings(fragment("It's ready!", { language: "en" }))).toEqual([]);
  });
  test("hidden paragraphs are not rendered-copy violations", () => {
    expect(frenchTypographyFindings(fragment("L'information : exemple!", { visible: false }))).toEqual([]);
  });
  test("unknown language is not silently treated as French", () => {
    expect(frenchTypographyFindings(fragment("L'information : exemple!", { language: "und" }))).toEqual([]);
  });
  test("colon immediately after a letter requires a no-break space", () => {
    expect(codes("Information: détail")).toContain("colon-space");
  });
  test("ordinary whitespace before a French colon is not equivalent to no-break space", () => {
    expect(codes("Information : détail")).toContain("colon-space");
  });
  test("ordinary whitespace before a question mark is not a narrow no-break space", () => {
    expect(codes("Pourquoi ?")).toContain("narrow-space");
  });
  test("a correct no-break space before colon is accepted", () => {
    expect(codes(`Information${NO_BREAK_SPACE}: détail`)).not.toContain("colon-space");
  });
  for (const punctuation of [";", "!", "?"] as const) {
    test(`requires a narrow no-break space before ${punctuation}`, () => {
      expect(codes(`Information${punctuation}`)).toContain("narrow-space");
    });
    test(`accepts the required spacing before ${punctuation}`, () => {
      expect(codes(`Information${NARROW_NO_BREAK_SPACE}${punctuation}`)).not.toContain("narrow-space");
    });
    test(`space formatter uses a narrow no-break space before ${punctuation}`, () => {
      expect(frenchSpacingToken(punctuation)).toBe(NARROW_NO_BREAK_SPACE + punctuation);
    });
  }
  test("colon token uses the wider no-break space", () => {
    expect(frenchSpacingToken(":")).toBe(NO_BREAK_SPACE + ":");
  });
  test("guillemet openings require internal narrow no-break space", () => {
    expect(codes("«bonjour»")).toContain("open-guillemet");
  });
  test("guillemet closings require internal narrow no-break space", () => {
    expect(codes("«bonjour»")).toContain("close-guillemet");
  });
  test("correct guillemet construction passes", () => {
    expect(codes(quoteFrench("information"))).toEqual([]);
    expect(isFormattedFrenchQuote(quoteFrench("information"))).toBe(true);
  });
  test("malformed guillemets do not pass the quote check", () => {
    expect(isFormattedFrenchQuote("« information »")).toBe(false);
  });
});

test.describe("P20W normalization for draft copy", () => {
  test("converts apostrophe between letters", () => {
    expect(formatFrenchDraft("L'information")).toBe("L’information");
  });
  test("converts colon spacing without a plain space", () => {
    expect(formatFrenchDraft("Information: détail")).toBe(`Information${NO_BREAK_SPACE}: détail`);
  });
  test("converts semicolon spacing", () => {
    expect(formatFrenchDraft("Un; deux")).toBe(`Un${NARROW_NO_BREAK_SPACE}; deux`);
  });
  test("converts exclamation spacing", () => {
    expect(formatFrenchDraft("Attention !")).toBe(`Attention${NARROW_NO_BREAK_SPACE}!`);
  });
  test("converts question spacing", () => {
    expect(formatFrenchDraft("Pourquoi ?")).toBe(`Pourquoi${NARROW_NO_BREAK_SPACE}?`);
  });
  test("adds spaces inside French guillemets", () => {
    expect(formatFrenchDraft("«le texte»")).toBe(quoteFrench("le texte"));
  });
  test("normalization is idempotent on correctly spaced text", () => {
    const text = `L’information${NO_BREAK_SPACE}: ${quoteFrench("exemple")}${NARROW_NO_BREAK_SPACE}!`;
    expect(formatFrenchDraft(formatFrenchDraft(text))).toBe(text);
  });
  test("mail and website addresses are preserved exactly", () => {
    const text = "L'adresse example@example.org reste locale";
    expect(formatFrenchDraft(text)).toContain("example@example.org");
  });
  test("an HTTPS address is not modified internally", () => {
    const url = "https://example.org/a?value=one";
    expect(formatFrenchDraft(`Consultez ${url}`)).toContain(url);
  });
  test("zero-width or empty text is handled without exceptions", () => {
    expect(formatFrenchDraft("")).toBe("");
    expect(auditFrenchFragments([])).toEqual([]);
  });
});

test.describe("P20W fragment diagnostics", () => {
  test("a single fragment reports multiple independent errors", () => {
    const findings = frenchTypographyFindings(fragment("L'information: erreur!"));
    expect(findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "straight-apostrophe", "colon-space", "narrow-space",
    ]));
  });
  test("the full report preserves path provenance", () => {
    const findings = auditFrenchFragments([fragment("L'information!", { path: "#one" })]);
    expect(findings.every((item) => item.path === "#one")).toBe(true);
  });
  test("English and hidden fragments do not contaminate a French report", () => {
    const findings = auditFrenchFragments([
      fragment("L'information!", { language: "en" }),
      fragment("L'information!", { visible: false }),
      fragment("L’information", { path: "#good" }),
    ]);
    expect(findings).toEqual([]);
  });
  test("the presence of errors can be checked without changing copy", () => {
    expect(hasFrenchTypographyIssues([fragment("L'information")])).toBe(true);
    expect(hasFrenchTypographyIssues([fragment("L’information")])).toBe(false);
  });
  test("summary groups errors by rule", () => {
    const issues = auditFrenchFragments([fragment("L'information!")]);
    const summary = punctuationSummary(issues);
    expect(summary).toContain("straight-apostrophe");
    expect(summary).toContain("narrow-space");
  });
  test("grouped counts retain separate document paths", () => {
    const findings = auditFrenchFragments([
      fragment("L'information", { path: "#a" }),
      fragment("L'information", { path: "#b" }),
    ]);
    expect(typographyCountsByPath(findings)).toMatchObject({ "#a": 1, "#b": 1 });
  });
  test("letter-to-letter straight quotes are counted", () => {
    expect(unicodeApostrophePositions("L'information et d'accord")).toHaveLength(2);
  });
  test("quotation punctuation outside words is ignored", () => {
    expect(unicodeApostrophePositions("'quoted'" )).toEqual([]);
  });
  test("trailing non-breaking spaces are counted, not silently trimmed", () => {
    expect(trailingHardSpaces(`texte${NO_BREAK_SPACE}${NARROW_NO_BREAK_SPACE}`)).toBe(2);
    expect(trailingHardSpaces("texte")).toBe(0);
  });
  test("error locations include the relevant text offset", () => {
    const result = frenchTypographyFindings(fragment("L'information"));
    expect(result[0]?.offset).toBe(1);
    expect(result[0]?.excerpt).toContain("information");
  });
});
