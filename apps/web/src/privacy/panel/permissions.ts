// Asks the browser what it has allowed, for the features in featureRegister.ts that have a permission name.
// It only reads. A browser that has no permission query, does not know the name, or throws answers
// "unknown", never "prompt" or "denied" on its own guess. The browser is a parameter so tests need no browser.

import type { FeatureRow } from "./featureRegister";

export type PermissionAnswer = "granted" | "denied" | "prompt" | "unknown";

export interface FeatureHost {
  permissions?: { query(descriptor: { name: string }): Promise<{ state: string }> };
}

export interface FeatureStates {
  /** ISO date and time of the check */
  at: string;
  /** Feature id to the browser's answer. Only rows with a permission name are present. */
  answers: Readonly<Record<string, PermissionAnswer>>;
}

const KNOWN: readonly PermissionAnswer[] = ["granted", "denied", "prompt"];

function toAnswer(state: unknown): PermissionAnswer {
  return typeof state === "string" && (KNOWN as readonly string[]).includes(state) ? (state as PermissionAnswer) : "unknown";
}

async function ask(host: FeatureHost, name: string): Promise<PermissionAnswer> {
  if (host.permissions === undefined || typeof host.permissions.query !== "function") return "unknown";
  try {
    return toAnswer((await host.permissions.query({ name })).state);
  } catch {
    return "unknown";
  }
}

/** One question per permission name, in the register's order. Two rows that share a name get the same answer. */
export async function readFeatureStates(host: FeatureHost, register: readonly FeatureRow[], now: Date): Promise<FeatureStates> {
  const answers: Record<string, PermissionAnswer> = {};
  const byName = new Map<string, PermissionAnswer>();
  for (const r of register) {
    if (r.permission === undefined) continue;
    let a = byName.get(r.permission);
    if (a === undefined) {
      a = await ask(host, r.permission);
      byName.set(r.permission, a);
    }
    answers[r.id] = a;
  }
  return { at: now.toISOString(), answers };
}

/** The host for a real page. Everything is read from the page's browser object only when it is called. */
export function browserFeatureHost(nav: { permissions?: FeatureHost["permissions"] } | undefined = typeof navigator === "undefined" ? undefined : navigator): FeatureHost {
  return nav?.permissions === undefined ? {} : { permissions: nav.permissions };
}
