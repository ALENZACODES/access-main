import type { Page } from "@playwright/test";
import type {
  DialogItem, Disclosure, DocumentSummary, Evidence, FocusWalk, FormItem,
  LiveItem, MediaItem, NavigationLink, Rect, TableItem, Target, TextControl,
} from "./p20i-contracts";

/** The visible DOM, not a saved fixture, supplies all geometry and names. */
export interface BrowserSnapshot {
  readonly document: DocumentSummary;
  readonly targets: readonly Target[];
  readonly fields: readonly TextControl[];
  readonly links: readonly NavigationLink[];
  readonly media: readonly MediaItem[];
  readonly tables: readonly TableItem[];
  readonly disclosures: readonly Disclosure[];
  readonly dialogs: readonly DialogItem[];
  readonly live: readonly LiveItem[];
  readonly forms: readonly FormItem[];
  readonly evidence: readonly Evidence[];
}

/** Plain serializable snapshot: no DOM nodes cross the Playwright bridge. */
export async function captureBrowser(page: Page): Promise<BrowserSnapshot> {
  return page.evaluate(() => {
    const rect = (element: Element): Rect => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const visible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && style.opacity !== "0" &&
        !element.closest("[hidden], [inert], [aria-hidden='true']");
    };
    const labelFor = (node: Element): string => {
      const own = node.getAttribute("aria-label")?.trim();
      if (own) return own;
      const by = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      if (by) return by;
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
        const labels = [...(node.labels ?? [])].map((item) => item.textContent?.trim() ?? "").join(" ").trim();
        if (labels) return labels;
      }
      const ownText = node.textContent?.trim();
      if (ownText) return ownText;
      return node.getAttribute("title")?.trim() ?? "";
    };
    const nodes = [...new Set(document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type='hidden']), textarea, select, summary, [role='button'], [role='link'], [role='radio'], [role='checkbox'], [role='switch']",
    ))];
    const targets: Target[] = nodes.map((node, index) => {
      const kind: Target["kind"] = node.matches("a[href], [role='link']") ? "link" :
        node.matches("button, [role='button']") ? "button" :
          node.matches("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox'], [role='switch']") ? "choice" :
            node.matches("summary") ? "summary" :
              node.matches("textarea, input, select") ? "field" : "custom";
      // A visible React Aria radio/checkbox has a 48px click surface, not the
      // dimensions of the tiny native input inside it. No unrelated parent counts.
      const wrapping = kind === "choice" ? node.closest<HTMLElement>("label, .radio-option, .check-option") : null;
      const interactive = wrapping !== null &&
        (wrapping.matches("label, [role='radio'], [role='checkbox']") ||
          wrapping.matches(".radio-option, .check-option"));
      return {
        id: node.id || `${kind}-${index}`,
        label: labelFor(node),
        rect: rect(node),
        visible: visible(node),
        disabled: node.matches(":disabled, [aria-disabled='true']") || Boolean(wrapping?.matches(":disabled, [aria-disabled='true']")),
        kind,
        labelRect: interactive && wrapping ? rect(wrapping) : null,
        labelInteractive: interactive,
      };
    });
    const fields: TextControl[] = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input:not([type='hidden']), textarea, select",
    )].map((field, index) => {
      const describedBy = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const associated = [...(field.labels ?? [])].map((label) => label.textContent?.trim() ?? "").join(" ");
      const labelledby = (field.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ");
      const errors = (field.getAttribute("aria-errormessage") ?? "").split(/\s+/).filter(Boolean);
      return {
        id: field.id || `field-${index}`,
        kind: field instanceof HTMLInputElement ? field.type : field.tagName.toLowerCase(),
        label: associated,
        ariaLabel: field.getAttribute("aria-label") ?? "",
        ariaLabelledby: labelledby,
        title: field.getAttribute("title") ?? "",
        placeholder: field.getAttribute("placeholder") ?? "",
        visible: visible(field),
        disabled: field.matches(":disabled, [aria-disabled='true']"),
        describedBy,
        missingDescriptions: describedBy.filter((id) => !document.getElementById(id)),
        required: field.required || field.getAttribute("aria-required") === "true",
        invalid: field.getAttribute("aria-invalid") === "true",
        errorText: errors.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim(),
      };
    });
    const links: NavigationLink[] = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((anchor, index) => {
      const url = new URL(anchor.href, document.baseURI);
      return {
        id: anchor.id || `link-${index}`,
        href: anchor.getAttribute("href") ?? "",
        text: labelFor(anchor),
        rect: rect(anchor),
        visible: visible(anchor),
        external: url.origin !== location.origin && (url.protocol === "http:" || url.protocol === "https:"),
        blank: anchor.target === "_blank",
        rel: anchor.rel,
        downloaded: anchor.hasAttribute("download"),
      };
    });
    const media: MediaItem[] = [...document.querySelectorAll<HTMLElement>("img, svg, canvas, video, audio")]
      .map((element, index) => {
        const kind = element.tagName.toLowerCase() as MediaItem["kind"];
        const alternate = element.getAttribute("aria-label") || element.getAttribute("alt") ||
          element.querySelector("title")?.textContent?.trim() || null;
        const decorative = element.getAttribute("aria-hidden") === "true" ||
          element.getAttribute("role") === "presentation" || element.getAttribute("role") === "none" ||
          (kind === "img" && element.getAttribute("alt") === "");
        const isMedia = element instanceof HTMLMediaElement;
        return {
          id: element.id || `${kind}-${index}`, kind, visible: visible(element), decorative, alternate,
          controls: isMedia && element.controls,
          captioned: kind !== "video" || Boolean(element.querySelector("track[kind='captions'], track[kind='subtitles']")),
        };
      });
    const tables: TableItem[] = [...document.querySelectorAll<HTMLTableElement>("table")].map((table, index) => {
      const headers = [...table.querySelectorAll<HTMLTableCellElement>("th")];
      const associationErrors = [...table.querySelectorAll<HTMLTableCellElement>("td")].flatMap((cell) => {
        if (cell.headers && cell.headers.length) return [];
        const row = cell.closest("tr");
        const col = [...(row?.children ?? [])].indexOf(cell);
        if (row?.querySelector("th[scope='row']") || table.querySelector(`tr:first-child th:nth-child(${col + 1})`)) return [];
        if (headers.some((header) => header.scope === "col")) return [];
        return [`Unassociated cell in row ${row?.rowIndex ?? -1}, column ${col}`];
      });
      return {
        id: table.id || `table-${index}`, rows: table.rows.length,
        headers: headers.length,
        caption: table.caption?.textContent?.trim() || table.getAttribute("aria-label") || "",
        layout: table.getAttribute("role") === "presentation" || table.getAttribute("role") === "none",
        associationErrors,
      };
    });
    const disclosures: Disclosure[] = [...document.querySelectorAll<HTMLElement>("button[aria-expanded], summary, [role='button'][aria-expanded]")]
      .map((element, index) => {
        const controlsId = element.getAttribute("aria-controls");
        return {
          id: element.id || `disclosure-${index}`,
          buttonName: labelFor(element),
          expanded: element.getAttribute("aria-expanded"),
          controlsId,
          controlledExists: controlsId === null || Boolean(document.getElementById(controlsId)),
        };
      });
    const dialogs: DialogItem[] = [...document.querySelectorAll<HTMLElement>("dialog[open], [role='dialog']")]
      .map((element, index) => ({
        id: element.id || `dialog-${index}`, name: labelFor(element),
        modal: element.getAttribute("aria-modal") === "true" || (element instanceof HTMLDialogElement && element.matches(":modal")),
        focusInside: element.contains(document.activeElement), visible: visible(element),
      }));
    const live: LiveItem[] = [...document.querySelectorAll<HTMLElement>("[aria-live], [role='status'], [role='alert'], [role='log']")]
      .map((element, index) => ({
        id: element.id || `live-${index}`, role: element.getAttribute("role") ?? "",
        live: element.getAttribute("aria-live") ?? "", busy: element.getAttribute("aria-busy") === "true",
        visible: visible(element), text: element.textContent?.trim() ?? "",
      }));
    const forms: FormItem[] = [...document.querySelectorAll<HTMLFormElement>("form")].map((form, index) => ({
      id: form.id || `form-${index}`, method: form.method, action: form.getAttribute("action") ?? "",
      fields: form.querySelectorAll("input, select, textarea").length,
      submits: form.querySelectorAll("button[type='submit'], input[type='submit'], button:not([type])").length,
      visible: visible(form),
    }));
    const evidence: Evidence[] = [...document.querySelectorAll<HTMLElement>("[data-source][data-licence], [data-evidence-status]")]
      .map((node) => ({
        source: node.getAttribute("data-source"),
        licence: node.getAttribute("data-licence"),
        date: node.getAttribute("data-source-date"),
        status: node.getAttribute("data-evidence-status") === "PASS" ? "PASS" as const :
          node.getAttribute("data-evidence-status") === "BLOCKED" ? "BLOCKED" as const : "UNKNOWN" as const,
      }));
    const mains = [...document.querySelectorAll<HTMLElement>("main, [role='main']")].filter(visible);
    const h1 = [...document.querySelectorAll<HTMLHeadingElement>("h1")].filter(visible)
      .map((element) => element.textContent?.trim() ?? "");
    const skip = document.querySelector<HTMLAnchorElement>("a[href='#main']");
    const documentSummary: DocumentSummary = {
      lang: document.documentElement.lang, title: document.title,
      h1, mainCount: mains.length,
      mainText: mains.map((element) => element.innerText).join(" ").trim(),
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      loading: Boolean(document.querySelector("main [role='status'][aria-busy='true']")),
      skipTargetExists: Boolean(skip && document.getElementById("main")),
    };
    return { document: documentSummary, targets, fields, links, media, tables, disclosures, dialogs, live, forms, evidence };
  });
}

/** Browser focus identity is a reference to the DOM element, never its text. */
export async function captureFocusWalk(page: Page, maxStops = 36): Promise<FocusWalk> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("[data-p20i-focus]").forEach((node) => node.removeAttribute("data-p20i-focus"));
    document.body.focus();
  });
  const forward: FocusWalk["forward"][number][] = [];
  const reverse: FocusWalk["reverse"][number][] = [];
  let counter = 0;
  const step = async () => page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body) return null;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const ref = node.dataset.p20iFocus ?? "";
    return {
      identity: ref,
      name: node.getAttribute("aria-label") || node.innerText?.trim().slice(0, 80) || node.tagName,
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
      disabled: node.matches(":disabled, [aria-disabled='true']"),
      inMain: Boolean(node.closest("main, [role='main']")),
      disconnected: !node.isConnected,
      hiddenByOverlay: Boolean(node.closest("[inert], [aria-hidden='true']")),
    };
  });
  for (let index = 0; index < maxStops; index += 1) {
    await page.keyboard.press("Tab");
    await page.evaluate((id) => {
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body &&
          !document.activeElement.dataset.p20iFocus) document.activeElement.dataset.p20iFocus = id;
    }, `focus-${counter++}`);
    const item = await step();
    if (!item || forward.some((seen) => seen.identity === item.identity)) break;
    forward.push(item);
  }
  for (let index = 0; index < Math.min(forward.length, maxStops); index += 1) {
    await page.keyboard.press("Shift+Tab");
    const item = await step();
    if (!item || reverse.some((seen) => seen.identity === item.identity)) break;
    reverse.push(item);
  }
  const firstSkip = Boolean(forward[0]?.name && /^(Skip to main content|Aller au contenu principal)$/i.test(forward[0].name));
  return { forward, reverse, firstSkip, reachedMain: forward.some((item) => item.inMain) };
}
