// One call that gives a shell everything the live privacy panel needs beyond its own inventory:
// the prefix, the purposes, the gate rules (so declining removes what a feature saved), the list of
// refused saves, and the plain list of what Erase does not reach. A page that builds the panel can
// spread this into its controller settings instead of repeating each piece, so the pieces cannot drift apart.

import type { ControllerDeps } from "./controller";
import { LIVE_PURPOSES, LIVE_RULES, PRIVACY_STORAGE_PREFIX, liveRefused } from "./live";
import { DEVICE_REGISTER } from "./deviceRegister";
import { ADDRESS_REGISTER, CALL_REGISTER } from "./addressRegister";
import { FEATURE_REGISTER } from "./featureRegister";
import { STATEMENT_REGISTER } from "./statementRegister";
import { browserFeatureHost } from "./permissions";
import { outsideItemsForScope } from "./outsideSection";
import { STORAGE_REGISTER, UNSCANNED, panelExtraKeys, type RegisterRow, type UnscannedRow } from "./storageRegister";

export type LiveControllerDeps = Pick<ControllerDeps, "prefix" | "purposes" | "withdrawRules" | "extraKeys" | "refused" | "outside" | "deviceRegister" | "kept" | "features" | "addresses" | "glance" | "receipt" | "statements">;

export interface LiveControllerOptions {
  /** For tests: other registers. Defaults to the App's own. */
  register?: readonly RegisterRow[];
  unscanned?: readonly UnscannedRow[];
}

export function liveControllerDeps(options: LiveControllerOptions = {}): LiveControllerDeps {
  const register = options.register ?? STORAGE_REGISTER;
  const unscanned = options.unscanned ?? UNSCANNED;
  const extraKeys = panelExtraKeys(register, PRIVACY_STORAGE_PREFIX);
  return {
    prefix: PRIVACY_STORAGE_PREFIX,
    purposes: LIVE_PURPOSES,
    withdrawRules: LIVE_RULES,
    extraKeys,
    refused: liveRefused,
    deviceRegister: DEVICE_REGISTER,
    kept: { register, unscanned },
    features: { register: FEATURE_REGISTER, host: browserFeatureHost() },
    addresses: { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER },
    glance: true,
    receipt: true,
    statements: STATEMENT_REGISTER,
    outside: outsideItemsForScope(register, unscanned, { prefix: PRIVACY_STORAGE_PREFIX, keys: extraKeys }),
  };
}

/** Problems that would make the live settings misleading. Empty when they agree with each other. */
export function checkLiveControllerDeps(deps: LiveControllerDeps, register: readonly RegisterRow[] = STORAGE_REGISTER): string[] {
  const problems: string[] = [];
  const purposeIds = new Set((deps.purposes ?? []).map((p) => p.id));
  for (const rule of deps.withdrawRules ?? []) {
    if (!purposeIds.has(rule.purposeId)) problems.push(`rule for ${rule.key} names the unknown purpose ${rule.purposeId}`);
    const row = register.find((r) => r.key === rule.key);
    if (row === undefined) problems.push(`rule for ${rule.key} has no row in the register`);
    else if (!row.gated) problems.push(`${rule.key} has a rule but its register row says it is not gated`);
    if (!rule.key.startsWith(deps.prefix)) problems.push(`rule for ${rule.key} is outside the prefix ${deps.prefix}, so the panel could not export it`);
  }
  for (const row of register) {
    if (row.gated && !(deps.withdrawRules ?? []).some((r) => r.key === row.key)) problems.push(`${row.key} is marked gated but has no rule`);
  }
  return problems;
}
