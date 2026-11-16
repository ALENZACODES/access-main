/** Colour contrast contracts for ordinary visible body text. */
import type { Page } from "@playwright/test";
import type { AuditContext, Problem } from "./p20e-policy";
import { problem } from "./p20e-policy";
export type Rgb = readonly [number, number, number];
export interface TextColour {
  readonly selector: string;
  readonly text: string;
  readonly foreground: string;
  readonly background: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly visible: boolean;
}
export function readColour(value: string): Rgb | null {
  const match = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?))?\s*\)$/.exec(value);
  if (!match) return null;
  const channels = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  if (match[4] && Number(match[4]) < 1) return null;
  return [channels[0]!, channels[1]!, channels[2]!];
}
export function luminance(colour: Rgb): number {
  const normalized = colour.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * normalized[0]! + 0.7152 * normalized[1]! + 0.0722 * normalized[2]!;
}
export function contrast(a: Rgb, b: Rgb): number {
  const left = luminance(a);
  const right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}
export function minimumRatio(fontSize: number, fontWeight: number): number {
  return fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
}
export function contrastProblems(items: readonly TextColour[], ctx: AuditContext): Problem[] {
  const output: Problem[] = [];
  for (const item of items) {
    if (!item.visible || !item.text.trim()) continue;
    const foreground = readColour(item.foreground);
    const background = readColour(item.background);
    if (!foreground || !background) {
      output.push(problem("text-colour-unresolved", ctx, item.selector, "Text colours cannot be resolved for contrast inspection."));
      continue;
    }
    const actual = contrast(foreground, background);
    const required = minimumRatio(item.fontSize, item.fontWeight);
    if (actual + 0.001 < required) {
      output.push(problem("text-contrast", ctx, item.selector,
        `Text contrast ${actual.toFixed(2)}:1 is below the ${required}:1 requirement.`));
    }
  }
  return output;
}
export async function collectTextColours(page: Page, limit = 180): Promise<TextColour[]> {
  return page.evaluate((cap) => {
    const body = document.querySelector("main,[role='main']") ?? document.body;
    const results: TextColour[] = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()) && results.length < cap) {
      const parent = node.parentElement;
      if (!parent || !(node.textContent ?? "").trim()) continue;
      if (parent.closest("script,style,noscript,template,[hidden],[aria-hidden='true'],[inert]")) continue;
      const box = parent.getBoundingClientRect();
      const style = getComputedStyle(parent);
      if (!box.width || !box.height || style.display === "none" || style.visibility === "hidden") continue;
      let background = "rgb(255, 255, 255)";
      let cursor: Element | null = parent;
      while (cursor) {
        const candidate = getComputedStyle(cursor).backgroundColor;
        if (candidate !== "transparent" && candidate !== "rgba(0, 0, 0, 0)") {
          background = candidate;
          break;
        }
        cursor = cursor.parentElement;
      }
      const id = parent.id ? `#${parent.id}` : parent.tagName.toLowerCase();
      results.push({
        selector: id, text: (node.textContent ?? "").trim().slice(0, 100),
        foreground: style.color, background,
        fontSize: Number.parseFloat(style.fontSize) || 16,
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400, visible: true,
      });
    }
    return results;
  }, limit);
}
