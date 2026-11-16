/**
 * Colour contrast (WCAG 2.2 SC 1.4.3 and 1.4.11) and target size helpers, plus the
 * palette the state components use. Tests fail if any pair drops below AA.
 */
export type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio between two hex colours, or null if either is not valid hex. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_UI_COMPONENT = 3;

export function meetsAA(fg: string, bg: string, kind: "text" | "large-text" | "ui" = "text"): boolean {
  const r = contrastRatio(fg, bg);
  if (r === null) return false;
  return r >= (kind === "text" ? AA_TEXT : kind === "large-text" ? AA_LARGE_TEXT : AA_UI_COMPONENT);
}

/** The App's target size rule (stricter than WCAG 2.5.8's 24px). */
export const MIN_TARGET_PX = 44;

export function meetsTargetSize(widthPx: number, heightPx: number): boolean {
  return widthPx >= MIN_TARGET_PX && heightPx >= MIN_TARGET_PX;
}

export interface ColorPair {
  readonly fg: string;
  readonly bg: string;
}
export type PaletteRole = "body" | "alert" | "status" | "button" | "unknown";
export type Theme = "light" | "dark";

export interface Palette {
  readonly roles: Readonly<Record<PaletteRole, ColorPair>>;
  /** Focus ring colour; must reach 3:1 against the body background. */
  readonly focusRing: string;
}

export const STATE_PALETTE: Readonly<Record<Theme, Palette>> = {
  light: {
    roles: {
      body: { fg: "#1A1A1A", bg: "#FFFFFF" },
      alert: { fg: "#7A1212", bg: "#FDECEC" },
      status: { fg: "#14305A", bg: "#EAF1FB" },
      button: { fg: "#FFFFFF", bg: "#0B4F9E" },
      unknown: { fg: "#4D3B00", bg: "#FFF4CC" },
    },
    focusRing: "#0B4F9E",
  },
  dark: {
    roles: {
      body: { fg: "#F2F2F2", bg: "#121212" },
      alert: { fg: "#FFD9D9", bg: "#4A1010" },
      status: { fg: "#DCE9FF", bg: "#13294B" },
      button: { fg: "#0B1B33", bg: "#9CC4FF" },
      unknown: { fg: "#FFF1B8", bg: "#3D3000" },
    },
    focusRing: "#9CC4FF",
  },
};

export function styleFor(role: PaletteRole, theme: Theme = "light"): string {
  const p = STATE_PALETTE[theme].roles[role];
  return `color:${p.fg};background:${p.bg}`;
}
