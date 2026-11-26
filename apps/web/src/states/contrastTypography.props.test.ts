import { describe, expect, it } from "vitest";
import { AA_LARGE_TEXT, AA_TEXT, MIN_TARGET_PX, STATE_PALETTE, contrastRatio, meetsAA, meetsTargetSize, parseHex, relativeLuminance, styleFor, type PaletteRole, type Theme } from "./contrast";
import { NBSP, NNBSP, frTypography, lintFrench, t } from "./typography";
import { lcg } from "./placeFixtures";

const THEMES: Theme[] = ["light", "dark"];
const ROLES: PaletteRole[] = ["body", "alert", "status", "button", "unknown"];

describe("parseHex", () => {
  it("reads six and three digit colours, in either case", () => {
    expect(parseHex("#000000")).toEqual([0, 0, 0]);
    expect(parseHex("#FFFFFF")).toEqual([255, 255, 255]);
    expect(parseHex("#0b4f9e")).toEqual([11, 79, 158]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("#1a2")).toEqual([17, 170, 34]);
    expect(parseHex("  #123456 ")).toEqual([18, 52, 86]);
  });
  it("rejects anything else", () => {
    for (const s of ["", "#", "#12", "#1234", "#12345", "#1234567", "123456", "#gggggg", "rgb(0,0,0)", "red", "#12 456"]) expect(parseHex(s), s).toBeNull();
  });
  it("round-trips every grey from a seeded set", () => {
    const rnd = lcg(3);
    for (let i = 0; i < 50; i++) {
      const [r, g, b] = [rnd(), rnd(), rnd()].map((x) => Math.floor(x * 256)) as [number, number, number];
      const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
      expect(parseHex(hex)).toEqual([r, g, b]);
    }
  });
});

describe("contrastRatio", () => {
  it("gives 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBe(1);
  });
  it("is the same either way round, never below 1, and never above 21", () => {
    const rnd = lcg(11);
    for (let i = 0; i < 200; i++) {
      const hex = (): string => `#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0")}`;
      const a = hex();
      const b = hex();
      const r = contrastRatio(a, b)!;
      expect(r).toBe(contrastRatio(b, a));
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(21.0000001);
    }
  });
  it("gives null when either side is not a colour", () => {
    expect(contrastRatio("x", "#fff")).toBeNull();
    expect(contrastRatio("#fff", "x")).toBeNull();
  });
  it("matches the known value for mid grey on white", () => expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2));
  it("has luminance 0 for black and 1 for white, rising with each channel", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(relativeLuminance([10, 0, 0])).toBeLessThan(relativeLuminance([20, 0, 0]));
    expect(relativeLuminance([0, 255, 0])).toBeGreaterThan(relativeLuminance([255, 0, 0]));
  });
});

describe("meetsAA", () => {
  it("uses 4.5 for text and 3 for large text and components", () => {
    expect(AA_TEXT).toBe(4.5);
    expect(AA_LARGE_TEXT).toBe(3);
    expect(meetsAA("#777777", "#ffffff", "text")).toBe(false);
    expect(meetsAA("#777777", "#ffffff", "large-text")).toBe(true);
    expect(meetsAA("#777777", "#ffffff", "ui")).toBe(true);
    expect(meetsAA("#9a9a9a", "#ffffff", "ui")).toBe(false);
  });
  it("says no, not yes, for a colour it cannot read", () => expect(meetsAA("nope", "#fff")).toBe(false));
});

describe("the palette", () => {
  for (const theme of THEMES) for (const role of ROLES) {
    const { fg, bg } = STATE_PALETTE[theme].roles[role];
    it(`${theme}/${role} meets AA for text, with room`, () => {
      expect(meetsAA(fg, bg, "text")).toBe(true);
      expect(contrastRatio(fg, bg)!).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}/${role} gives a style string of exactly the two colours`, () => expect(styleFor(role, theme)).toBe(`color:${fg};background:${bg}`));
  }
  for (const theme of THEMES) {
    it(`${theme} focus ring reaches 3:1 on the body and on the page colours of every role`, () => {
      const p = STATE_PALETTE[theme];
      expect(meetsAA(p.focusRing, p.roles.body.bg, "ui")).toBe(true);
    });
    it(`${theme} makes the roles tell apart by more than colour alone, as each has its own pair`, () => {
      const pairs = ROLES.map((r) => `${STATE_PALETTE[theme].roles[r].fg}/${STATE_PALETTE[theme].roles[r].bg}`);
      expect(new Set(pairs).size).toBe(ROLES.length);
    });
  }
  it("defaults to the light theme", () => expect(styleFor("body")).toBe(styleFor("body", "light")));
  it("uses only valid six digit colours", () => {
    for (const theme of THEMES) for (const role of ROLES) for (const c of Object.values(STATE_PALETTE[theme].roles[role])) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("meetsTargetSize", () => {
  it("is 44 pixels each way", () => {
    expect(MIN_TARGET_PX).toBe(44);
    expect(meetsTargetSize(44, 44)).toBe(true);
    expect(meetsTargetSize(43.9, 44)).toBe(false);
    expect(meetsTargetSize(44, 43)).toBe(false);
    expect(meetsTargetSize(100, 200)).toBe(true);
    expect(meetsTargetSize(0, 0)).toBe(false);
  });
});

describe("frTypography over generated text", () => {
  const rnd = lcg(21);
  const WORDS = ["bonjour", "l'aide", "oui", "12:30", "http" + "://x", "Note", "a", "d'accord", "«", "»", "voir:", "quoi?", "stop!", "a;b", "3:4", "", "é"];
  const SPACES = ["", " ", NBSP, NNBSP, "  "];
  const sample = (): string => Array.from({ length: 2 + Math.floor(rnd() * 6) }, () => WORDS[Math.floor(rnd() * WORDS.length)]! + SPACES[Math.floor(rnd() * SPACES.length)]!).join("");
  const samples = Array.from({ length: 300 }, sample);
  it("is idempotent", () => {
    for (const s of samples) expect(frTypography(frTypography(s)), JSON.stringify(s)).toBe(frTypography(s));
  });
  it("leaves no straight apostrophe", () => {
    for (const s of samples) expect(frTypography(s)).not.toContain("'");
  });
  it("leaves a lint-clean string", () => {
    for (const s of samples) expect(lintFrench(frTypography(s)), JSON.stringify(s)).toEqual([]);
  });
  it("never puts an ordinary space before a mark", () => {
    for (const s of samples) expect(frTypography(s)).not.toMatch(/ [:;!?]/);
  });
  it("puts a no-break space before a colon and a narrow one before ; ! ?", () => {
    expect(frTypography("Note : ok")).toBe(`Note${NBSP}: ok`);
    expect(frTypography("Note: ok")).toBe(`Note${NBSP}: ok`);
    for (const m of [";", "!", "?"]) expect(frTypography(`a ${m}`)).toBe(`a${NNBSP}${m}`);
  });
  it("leaves times and addresses alone", () => {
    expect(frTypography("à 12:30")).toBe("à 12:30");
    expect(frTypography("http" + "://x")).toBe("http" + "://x");
  });
  it("spaces guillemets with narrow no-break spaces", () => expect(frTypography("« oui »")).toBe(`«${NNBSP}oui${NNBSP}»`));
  it("does not space a mark at the very start of the text", () => {
    expect(frTypography(": a")).toBe(": a");
    expect(frTypography("?")).toBe("?");
  });
  it("changes no letters or digits", () => {
    const strip = (s: string): string => s.replace(/[\s\u00a0\u202f'’«»:;!?]/g, "");
    for (const s of samples) expect(strip(frTypography(s))).toBe(strip(s));
  });
});

describe("t", () => {
  it("returns English as written", () => expect(t("en", "Hi : there ?", "x")).toBe("Hi : there ?"));
  it("returns French with its typography applied", () => expect(t("fr", "x", "Salut : l'ami ?")).toBe(`Salut${NBSP}: l’ami${NNBSP}?`));
});
