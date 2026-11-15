import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import routerSource from "../router.tsx?raw";
import { errorStateList, SHELL_PATHS } from "./errorStates.ts";

function lookup(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => (value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined), messages);
}

describe("error states", () => {
  it("lists the shell routes the router defines", () => {
    for (const path of SHELL_PATHS) {
      if (path === "/") expect(routerSource).toContain("index: true");
      else expect(routerSource, path).toContain(`path: "${path.slice(1)}"`);
    }
  });

  it("gives every error state a message and at least one next action, in English and French", () => {
    for (const state of errorStateList()) {
      expect(state.actions.length, state.id).toBeGreaterThan(0);
      const keys = [...state.messageKeys, ...state.actions.map((action) => action.labelKey)];
      for (const key of keys) {
        for (const [language, messages] of [["en", en], ["fr", fr]] as const) {
          const text = lookup(messages, key);
          expect(typeof text, `${language} ${key}`).toBe("string");
          expect((text as string).trim().length, `${language} ${key}`).toBeGreaterThan(3);
        }
      }
    }
  });

  it("links only to routes the shell has", () => {
    const known = new Set<string>(SHELL_PATHS);
    for (const state of errorStateList()) {
      for (const action of state.actions) {
        if (action.kind === "link") expect(known.has(action.to), `${state.id} ${action.to}`).toBe(true);
      }
    }
  });

  it("uses plain language: short sentences, no codes, no blame", () => {
    for (const state of errorStateList()) {
      for (const key of state.messageKeys) {
        for (const messages of [en, fr]) {
          const text = lookup(messages, key) as string;
          for (const sentence of text.split(/(?<=[.!?])\s+/)) {
            expect(sentence.split(/\s+/).length, `${key}: ${sentence}`).toBeLessThanOrEqual(30);
          }
          expect(text, key).not.toMatch(/\b(error code|exception|stack|undefined|null|errno|E\d{3,})\b/i);
          expect(text, key).not.toMatch(/\byou (did|made) (something|a mistake)\b|\bvotre faute\b/i);
        }
      }
    }
  });
});
