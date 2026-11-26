import { expect, type Page } from "@playwright/test";

export interface AuditFinding {
  readonly code: string;
  readonly element: string;
  readonly detail: string;
}

/** DOM diagnostics are deliberately deterministic and avoid user-provided text. */
export async function auditSemantics(page: Page): Promise<AuditFinding[]> {
  return page.evaluate(() => {
    type Finding = { code: string; element: string; detail: string };
    const findings: Finding[] = [];
    const identifier = (element: Element): string => {
      const id = element.getAttribute("id");
      if (id) return `${element.localName}#${id}`;
      const parent = element.parentElement;
      if (!parent) return element.localName;
      const siblings = Array.from(parent.children).filter(
        (sibling) => sibling.localName === element.localName,
      );
      return `${element.localName}:nth-of-type(${siblings.indexOf(element) + 1})`;
    };
    const report = (code: string, element: Element, detail: string): void => {
      findings.push({ code, element: identifier(element), detail });
    };
    const rendered = (element: Element): boolean => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
      if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rectangle = element.getBoundingClientRect();
      if (rectangle.width > 0 && rectangle.height > 0) return true;
      // Empty links or custom widgets may collapse to 0×0 and still be in the tab order.
      return element.tabIndex >= 0 || element.matches("a[href], button, input, select, textarea, summary");
    };
    const labelled = (element: Element): boolean => {
      const label = element.getAttribute("aria-label")?.trim();
      if (label) return true;
      const ids = element.getAttribute("aria-labelledby")?.trim().split(/\s+/) ?? [];
      if (ids.some((id) => document.getElementById(id)?.textContent?.trim())) return true;
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement) {
        if (Array.from(element.labels ?? []).some((item) => item.textContent?.trim())) return true;
      }
      if (element instanceof HTMLImageElement) return element.hasAttribute("alt");
      if (element.getAttribute("title")?.trim()) return true;
      if (element.querySelector("img[alt]:not([alt='']), svg[aria-label]")) return true;
      return Boolean(element.textContent?.trim());
    };

    // Roles with required attributes must not appear in invalid states.
    const controlled = document.querySelectorAll<HTMLElement>(
      "[aria-controls], [aria-labelledby], [aria-describedby], [aria-errormessage]",
    );
    for (const element of Array.from(controlled)) {
      for (const attribute of ["aria-controls", "aria-labelledby", "aria-describedby", "aria-errormessage"]) {
        const value = element.getAttribute(attribute);
        if (value === null) continue;
        const ids = value.trim().split(/\s+/).filter(Boolean);
        if (ids.length === 0) report("empty-idref", element, attribute);
        for (const id of ids) {
          if (document.getElementById(id) === null) report("missing-idref", element, `${attribute}=${id}`);
        }
      }
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>(
      "[role='checkbox'],[role='switch'],[role='radio'],[role='tab'],[role='option'],[role='menuitemcheckbox'],[role='menuitemradio']",
    ))) {
      if (!rendered(element)) continue;
      const state = element.getAttribute("aria-checked") ??
        (element.getAttribute("role") === "tab" || element.getAttribute("role") === "option"
          ? element.getAttribute("aria-selected") : null);
      if (state === null) report("missing-widget-state", element, "Widget state not declared");
      else if (!["true", "false", "mixed"].includes(state)) {
        report("invalid-widget-state", element, state);
      }
      if (!labelled(element)) report("unnamed-widget", element, "Widget has no name");
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>(
      "[role='button'],[role='link'],[role='tab'],[role='switch'],[role='checkbox'],[role='radio']",
    ))) {
      if (!rendered(element)) continue;
      const native = element.matches("button, a[href], input, select, textarea");
      if (!native && element.tabIndex < 0) report("unreachable-custom-control", element, "Not keyboard focusable");
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[aria-expanded]"))) {
      if (!rendered(element)) continue;
      const value = element.getAttribute("aria-expanded");
      if (value !== "true" && value !== "false") {
        report("invalid-expanded-state", element, String(value));
      }
      if (!labelled(element)) report("unnamed-expander", element, "Expanded control has no name");
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[aria-current]"))) {
      if (!rendered(element)) continue;
      const value = element.getAttribute("aria-current");
      if (!value || !["page", "step", "location", "date", "time", "true", "false"].includes(value)) {
        report("invalid-current-state", element, String(value));
      }
    }

    // No positive tabindex: it alters reading-order expectations for switch users.
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[tabindex]"))) {
      if (!rendered(element)) continue;
      const raw = element.getAttribute("tabindex") ?? "";
      if (!/^-?\d+$/.test(raw.trim())) report("invalid-tabindex", element, raw);
      else if (Number(raw) > 0) report("positive-tabindex", element, raw);
    }

    // Disabled elements may not still be advertised as operable to assistive tech.
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[aria-disabled='true']"))) {
      if (!rendered(element)) continue;
      if (element.getAttribute("aria-pressed") === "true" && element.getAttribute("role") === "button") {
        // Disabled pressed toggles are legitimate; no finding.
        continue;
      }
      if (element.hasAttribute("aria-expanded") && element.getAttribute("aria-expanded") === "true") {
        report("disabled-expanded", element, "Disabled disclosure remains expanded");
      }
    }

    for (const element of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      if (!rendered(element)) continue;
      const href = element.getAttribute("href") ?? "";
      if (href === "#" || href.trim() === "") report("placeholder-link", element, "No destination");
      if (href.startsWith("#") && href.length > 1) {
        let id = "";
        try { id = decodeURIComponent(href.slice(1)); } catch { id = href.slice(1); }
        if (!document.getElementById(id)) report("missing-fragment-target", element, id);
      }
      if (!labelled(element) && !Array.from(element.querySelectorAll("img"))
        .some((image) => image.getAttribute("alt")?.trim())) {
        report("unnamed-link", element, "Link has no accessible label");
      }
    }

    for (const element of Array.from(document.querySelectorAll<HTMLButtonElement>("button"))) {
      if (rendered(element) && !labelled(element)) report("unnamed-button", element, "Button has no label");
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[role='alert'],[role='status'],[aria-live]"))) {
      if (!rendered(element)) continue;
      const live = element.getAttribute("aria-live");
      if (live !== null && !["off", "polite", "assertive"].includes(live)) {
        report("invalid-live-value", element, live);
      }
      const atomic = element.getAttribute("aria-atomic");
      if (atomic !== null && atomic !== "true" && atomic !== "false") {
        report("invalid-live-atomic", element, atomic);
      }
    }

    return findings;
  });
}

export async function assertSemantics(page: Page): Promise<void> {
  expect(await auditSemantics(page), "Interactive semantics and references").toEqual([]);
}

/**
 * Resolve once the document has had no DOM change for `quietMs`, or after `capMs`. A route that is
 * still re-rendering replaces buttons between the count and the read, and an element that was
 * replaced reads as having no name, which is a page still settling and not an unnamed control.
 * The cap only bounds the wait; it does not let the audit pass or skip anything.
 */
export async function waitForQuietDom(page: Page, quietMs = 300, capMs = 5000): Promise<void> {
  await page.evaluate(({ quiet, cap }) => new Promise<void>((resolve) => {
    let timer = window.setTimeout(done, quiet);
    const capTimer = window.setTimeout(done, cap);
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(done, quiet);
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    function done(): void {
      observer.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(capTimer);
      resolve();
    }
  }), { quiet: quietMs, cap: capMs });
}

/** Assert accessibility tree names using Playwright's accessible-name engine. */
/** Check the name sources of controls found by Playwright's accessible role selector. */
export async function auditRoleNames(page: Page): Promise<AuditFinding[]> {
  await waitForQuietDom(page);
  const roles = ["button", "link", "checkbox", "switch", "radio", "tab"] as const;
  const findings: AuditFinding[] = [];
  for (const role of roles) {
    // Read every name source from the same DOM element. A newly displayed
    // prompt can shift all later button positions while protocol calls await.
    const unnamed = await page.getByRole(role).filter({ visible: true }).evaluateAll(elements => {
      const missing: number[] = [];
      for (const [index, node] of elements.entries()) {
        const label = node.getAttribute("aria-label")?.trim();
        const title = node.getAttribute("title")?.trim();
        const content = node instanceof HTMLElement ? node.innerText.trim() : "";
        const labelledBy = node.getAttribute("aria-labelledby");
        const fromLabels = (node instanceof HTMLInputElement || node instanceof HTMLSelectElement ||
          node instanceof HTMLTextAreaElement || node instanceof HTMLButtonElement) &&
          Array.from(node.labels ?? []).some(item => item.textContent?.trim());
        const wrapper = node instanceof HTMLElement && node.closest("label")?.textContent?.trim();
        if (!label && !title && !content && !labelledBy && !fromLabels && !wrapper &&
            !node.querySelector("img[alt]:not([alt=''])")) {
          missing.push(index);
        }
      }
      return missing;
    });
    for (const index of unnamed) {
      findings.push({ code: "unlabelled-role", element: `${role}[${index}]`, detail: "No name source" });
    }
  }
  return findings;
}
