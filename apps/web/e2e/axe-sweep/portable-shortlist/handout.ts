import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { downloadText, listRegion, type Language } from "./browser.ts";

export interface HandoutEntry {
  name: string;
  details: Record<string, string>;
  labels: string[];
  questionHeading: string | null;
  questions: string[];
}

export interface HandoutContents {
  title: string;
  intro: string;
  entries: HandoutEntry[];
  footer: string[];
}

const handoutName = /^(Make a large-print page|Créer une page en gros caractères)$/;
const saveName = /^(Save the page|Enregistrer la page) \(\.html\)$/;

export async function openHandout(page: Page) {
  const section = listRegion(page);
  const toggle = section.getByRole("button", { name: handoutName });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await toggle.press("Enter");

  // Its accessible name changes after opening. Reacquire the control and
  // check its announced relationship to the panel a keyboard user reached.
  const hide = section.getByRole("button", { name: /^(Hide the large-print page|Masquer la page en gros caractères)$/ });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  const preview = section.getByRole("region", { name: /^(Preview|Aperçu)$/ });
  await expect(preview).toBeVisible();
  const panel = preview.locator("..");
  const id = await panel.getAttribute("id");
  if (!id) throw new Error("Large-print settings have no panel ID");
  await expect(hide).toHaveAttribute("aria-controls", id);
  return { hide, preview, panel };
}

/** Read the content as displayed, without calling the application's handout builder.
 * Both presentations use definition lists. The preview numbers places with an
 * ordered list, while the portable document numbers them in its article headings.
 */
export function readHandout(root: Locator, presentation: "preview" | "document"): Promise<HandoutContents> {
  return root.evaluate((element, mode) => {
    function visibleText(node: Element | null, purpose: string) {
      if (!(node instanceof HTMLElement) || !node.checkVisibility()) {
        throw new Error(`Missing visible ${purpose} in ${mode}`);
      }
      const text = node.innerText.trim();
      if (!text) throw new Error(`Empty ${purpose} in ${mode}`);
      return text;
    }

    function detailsFor(entry: Element) {
      const list = entry.querySelector(":scope > dl");
      if (!list) throw new Error("Place has no definition list");
      // HTML permits grouping adjacent dt/dd elements inside a div.
      const fields = [...list.querySelectorAll(":scope > dt, :scope > dd, :scope > div > dt, :scope > div > dd")];
      const details: Record<string, string> = {};
      const labels: string[] = [];
      for (let i = 0; i < fields.length; i += 2) {
        const term = fields[i];
        const description = fields[i + 1];
        if (term?.localName !== "dt" || description?.localName !== "dd") {
          throw new Error("Expected one term and its definition in reading order");
        }
        const label = visibleText(term, "field label");
        if (Object.hasOwn(details, label)) throw new Error(`Repeated field label: ${label}`);
        labels.push(label);
        details[label] = visibleText(description, label);
      }
      if (labels.length === 0) throw new Error("Place has no fields");
      return { labels, details };
    }

    const preview = mode === "preview";
    const content = preview ? element : element.querySelector("main");
    if (!content) throw new Error("Downloaded handout has no main landmark");
    const title = visibleText(content.querySelector(preview ? "h4" : "h1"), "document heading");
    const paragraphs = [...content.querySelectorAll(":scope > p")];
    const intro = visibleText(paragraphs[0] ?? null, "introduction");
    const items = content.querySelectorAll(preview ? ":scope > ol > li" : ":scope > article");
    const entries = Array.from(items, (item, index) => {
      const heading = visibleText(item.querySelector(preview ? ":scope > strong" : ":scope > h2"), "place heading");
      const number = `${index + 1}. `;
      if (!preview && !heading.startsWith(number)) {
        throw new Error(`Expected article ${index + 1} to announce its position`);
      }
      const questionLabel = item.querySelector(preview ? ":scope > p" : ":scope > h3");
      const questions = Array.from(item.querySelectorAll(":scope > ol > li"), (q) => visibleText(q, "question"));
      return {
        name: preview ? heading : heading.slice(number.length),
        ...detailsFor(item),
        questionHeading: questionLabel ? visibleText(questionLabel, "questions heading") : null,
        questions,
      };
    });
    const footer = preview ? paragraphs.slice(1) : [...element.querySelectorAll("footer > p")];
    return { title, intro, entries, footer: footer.map((line) => visibleText(line, "footer paragraph")) };
  }, presentation);
}

export type HandoutSwitch = "notes" | "points" | "sources" | "questions";

const switchNames: Record<HandoutSwitch, RegExp> = {
  notes: /^Include the pack’s notes$|^Inclure les notes du pack$/,
  sources: /^Include where each detail comes from$|^Inclure la provenance de chaque détail$/,
  points: /^Include map points as numbers$|^Inclure les points de carte en chiffres$/,
  questions: /^Include questions to ask,|^Inclure des questions à poser,/,
};

export async function toggleOption(panel: Locator, option: HandoutSwitch) {
  const control = panel.getByRole("checkbox", { name: switchNames[option] });
  const before = await control.isChecked();
  await control.focus();
  await control.press("Space");
  await expect(control).toBeChecked({ checked: !before });
}

export async function saveHandout(page: Page, panel: Locator, language: Language) {
  const filename = language === "en" ? "large-print-list.html" : "liste-en-gros-caracteres.html";
  const html = await downloadText(page, panel.getByRole("button", { name: saveName }), filename);
  const announcement = panel.locator("[aria-live='polite']");
  await expect(announcement).toHaveText(language === "en"
    ? `Saved ${filename}. Open it in a browser to read or print it.`
    : `Fichier ${filename} enregistré. Ouvrez-le dans un navigateur pour le lire ou l’imprimer.`);
  return html;
}

/** The recipient can open just the file with a different language preference,
 * no application storage, no network connection and scripting switched off.
 */
export async function readOffline<T>(browser: Browser, html: string, inspect: (reader: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    offline: true,
    serviceWorkers: "block",
    locale: "de-DE",
  });
  try {
    const page = await context.newPage();
    const external: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/i.test(request.url())) external.push(request.resourceType());
    });
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const result = await inspect(page);
    expect(external, "a saved handout should render without fetching any online resource").toEqual([]);
    return result;
  } finally {
    await context.close();
  }
}
