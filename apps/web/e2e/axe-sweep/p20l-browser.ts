import type { Page } from "@playwright/test";
import type { EvidenceCard } from "./p20l-provenance";

/**
 * Inspect the same semantic markup a screen reader encounters. Do not read
 * application stores, call private APIs, or synthesize missing data records.
 */
export async function renderedEvidenceCards(page: Page): Promise<EvidenceCard[]> {
  return page.locator("main .result-items > li").evaluateAll((items) =>
    items.map((node, index) => {
      const element = node as HTMLElement;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = box.width > 0 && box.height > 0 &&
        style.display !== "none" && style.visibility !== "hidden" &&
        !element.closest("[hidden], [inert], [aria-hidden='true']");
      const lists = [...element.querySelectorAll<HTMLDListElement>("dl.result-meta")];
      return {
        location: `${window.location.pathname}#result-${index + 1}`,
        name: element.querySelector(".result-name")?.textContent?.trim() ?? "",
        descriptionLists: lists.map((list) =>
          [...list.querySelectorAll(":scope > div")].map((row) => ({
            term: row.querySelector("dt")?.textContent?.trim() ?? "",
            value: row.querySelector("dd")?.textContent?.trim() ?? "",
          })),
        ),
        visible,
      };
    }),
  );
}

export interface OfflineObservation {
  readonly language: string;
  readonly mainCount: number;
  readonly headingCount: number;
  readonly offlineStatus: boolean;
  readonly resultsCount: number;
}

/** Read the rendered offline state after changing connectivity; never infer a record. */
export async function inspectOfflineState(page: Page): Promise<OfflineObservation> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const statusText = [...(main?.querySelectorAll("[role='status']") ?? [])]
      .map((node) => node.textContent?.trim() ?? "").join(" ").toLocaleLowerCase();
    return {
      language: document.documentElement.lang,
      mainCount: document.querySelectorAll("main").length,
      headingCount: main?.querySelectorAll("h1").length ?? 0,
      offlineStatus: /offline|hors ligne|connexion|connection|unavailable|indisponible/i.test(statusText),
      resultsCount: main?.querySelectorAll(".result-items > li").length ?? 0,
    };
  });
}

export interface AccessibleMetadataStructure {
  readonly location: string;
  readonly name: string;
  readonly hasList: boolean;
  readonly termCount: number;
  readonly valueCount: number;
  readonly unlabeledValueCount: number;
}

/** A second structural probe makes missing dt/dd associations explicit. */
export async function inspectEvidenceStructure(page: Page): Promise<AccessibleMetadataStructure[]> {
  return page.locator("main .result-items > li").evaluateAll((items) =>
    items.map((node, index) => {
      const item = node as HTMLElement;
      const list = item.querySelector("dl.result-meta");
      const rows = list ? [...list.children] : [];
      return {
        location: `${window.location.pathname}#result-${index + 1}`,
        name: item.querySelector(".result-name")?.textContent?.trim() ?? "",
        hasList: list !== null,
        termCount: list?.querySelectorAll("dt").length ?? 0,
        valueCount: list?.querySelectorAll("dd").length ?? 0,
        unlabeledValueCount: rows.filter((row) => row.querySelector("dd") && !row.querySelector("dt")).length,
      };
    }),
  );
}
