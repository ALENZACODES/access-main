import type { Page } from "@playwright/test";
import { auditState, type StateAuditInput, type StateNode } from "./p20v-state-contracts";

/** DOM sampling only; no click, network call, storage write, or focus mutation. */
export async function collectState(page: Page, route: string): Promise<StateAuditInput> {
  const sampled = await page.evaluate(() => {
    const names = [
      "aria-expanded", "aria-pressed", "aria-selected", "aria-sort", "aria-current",
      "aria-checked", "aria-busy", "aria-activedescendant",
    ] as const;
    const all = [...document.querySelectorAll<HTMLElement>("*")];
    const refs = all.filter((element) => element.id || names.some((name) => element.hasAttribute(name)));
    const isVisible = (element: HTMLElement): boolean => {
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const scopeOf = (element: HTMLElement): string => {
      const container = element.closest<HTMLElement>("nav, [role='navigation'], table, [role='table'], [role='grid']");
      if (!container) return "document";
      const index = all.indexOf(container);
      return container.id ? `#${container.id}` : `container-${index}`;
    };
    const record = (element: HTMLElement) => ({
      id: element.id,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") ?? "",
      visible: isVisible(element),
      disabled: element.matches(":disabled, [aria-disabled='true']"),
      scope: scopeOf(element),
      parentId: element.parentElement?.id || null,
      ownedIds: (element.getAttribute("aria-owns") ?? "").trim().split(/\s+/).filter(Boolean),
      states: Object.fromEntries(names.filter((name) => element.hasAttribute(name))
        .map((name) => [name, element.getAttribute(name) ?? ""])),
    });
    const nodes = refs.map(record);
    const relations = refs.flatMap((owner, ownerIndex) => {
      const targetId = owner.getAttribute("aria-activedescendant");
      if (targetId === null) return [];
      const destinations = refs.filter((element) => element.id === targetId);
      const targetIndex = destinations.length === 1 ? refs.indexOf(destinations[0]!) : -1;
      const target = targetIndex < 0 ? null : destinations[0]!;
      return [{
        ownerIndex,
        targetIndex,
        matchingTargets: destinations.length,
        contained: Boolean(target && owner.contains(target)),
        owned: Boolean(target && owner.getAttribute("aria-owns")?.split(/\s+/).includes(target.id)),
      }];
    });
    return { documentLanguage: document.documentElement.lang, nodes, relations };
  });
  const nodes: readonly StateNode[] = sampled.nodes;
  return {
    route,
    documentLanguage: sampled.documentLanguage,
    nodes,
    relations: sampled.relations.map((relation) => ({
      owner: nodes[relation.ownerIndex]!,
      target: relation.targetIndex === -1 ? null : nodes[relation.targetIndex]!,
      matchingTargets: relation.matchingTargets,
      contained: relation.contained,
      owned: relation.owned,
    })),
  };
}

export async function inspectState(page: Page, route: string) {
  return auditState(await collectState(page, route));
}
