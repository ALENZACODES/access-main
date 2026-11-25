import type { SavedFile } from "../../states/downloadFile";
import { displayText, type CardLanguage, type CommunicationCard } from "./model";

export type PrintFaces = CardLanguage | "both";
export type PrintSize = "large" | "extra-large";

export interface CardPrintOptions {
  language: CardLanguage;
  faces: PrintFaces;
  size: PrintSize;
}

export const pointSize: Record<PrintSize, number> = { large: 24, "extra-large": 32 };

export const printCopy = {
  en: {
    title: "Printable communication cards",
    fileName: "communication-cards.html",
    summary: "Prepare a print copy",
    choices: "Cards to include",
    choose: "Select cards for the file. If you edit or restore a card, select it again.",
    all: "Select all cards",
    none: "Clear selection",
    faces: "Messages to print",
    en: "English",
    fr: "French",
    both: "Both languages",
    size: "Print size",
    large: "Large (24 pt)",
    extra: "Extra large (32 pt)",
    preview: "Preview of the first selected card",
    save: "Download printable cards",
    saved: "Open the downloaded HTML file in a browser to print the cards.",
    failed: "The file could not be downloaded.",
    paper: "Each card starts on a new printed page.",
    card: "Card",
    of: "of",
    selected: "Cards selected",
  },
  fr: {
    title: "Cartes de communication à imprimer",
    fileName: "cartes-de-communication.html",
    summary: "Préparer une copie à imprimer",
    choices: "Cartes à inclure",
    choose: "Sélectionnez les cartes à inclure dans le fichier. Si vous modifiez ou restaurez une carte, sélectionnez-la de nouveau.",
    all: "Sélectionner toutes les cartes",
    none: "Effacer la sélection",
    faces: "Messages à imprimer",
    en: "Anglais",
    fr: "Français",
    both: "Les deux langues",
    size: "Taille du texte imprimé",
    large: "Grand (24 pt)",
    extra: "Très grand (32 pt)",
    preview: "Aperçu de la première carte sélectionnée",
    save: "Télécharger les cartes à imprimer",
    saved: "Ouvrez le fichier HTML téléchargé dans un navigateur pour imprimer les cartes.",
    failed: "Le téléchargement du fichier a échoué.",
    paper: "Chaque carte commence sur une nouvelle page imprimée.",
    card: "Carte",
    of: "sur",
    selected: "Cartes sélectionnées",
  },
} as const;

export function printLanguages(faces: PrintFaces, language: CardLanguage): CardLanguage[] {
  if (faces !== "both") return [faces];
  return language === "fr" ? ["fr", "en"] : ["en", "fr"];
}

export function cardPosition(index: number, total: number, language: CardLanguage): string {
  const copy = printCopy[language];
  return `${copy.card} ${index + 1} ${copy.of} ${total}`;
}

export function printableCardsFile(
  cards: readonly CommunicationCard[],
  options: CardPrintOptions,
  owner: Document,
): SavedFile {
  if (cards.length === 0) throw new RangeError("Select a card for the print copy");
  const { language, faces, size } = options;
  const copy = printCopy[language];
  const doc = owner.implementation.createHTMLDocument(copy.title);
  doc.documentElement.lang = language;
  const encoding = doc.createElement("meta");
  encoding.setAttribute("charset", "utf-8");
  doc.head.prepend(encoding);
  const viewport = doc.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  const style = doc.createElement("style");
  style.textContent = `
    @page { margin: 15mm; }
    * { box-sizing: border-box; }
    body { color: #111; background: #fff; margin: 1rem auto; padding: 0 1rem; max-width: 48rem; font: 1rem/1.4 system-ui, sans-serif; }
    h1, h2, h3 { font: bold 1.1rem/1.4 system-ui, sans-serif; }
    article { margin-block: 1rem; padding: 1rem; border: 2px solid currentColor; }
    p { font-size: ${pointSize[size]}pt; margin-block: .3em .7em; white-space: pre-wrap; overflow-wrap: anywhere; }
    @media print {
      body { margin: 0; padding: 0; max-width: none; }
      article { margin: 0; padding: .5cm; }
      article + article { break-before: page; }
      h2, h3 { break-after: avoid; }
    }`;
  doc.head.append(viewport, style);
  const main = doc.createElement("main");
  const title = doc.createElement("h1");
  title.textContent = copy.title;
  main.append(title);
  const languages = printLanguages(faces, language);
  for (const [index, card] of cards.entries()) {
    const article = doc.createElement("article");
    const heading = doc.createElement("h2");
    heading.textContent = cardPosition(index, cards.length, language);
    article.append(heading);
    for (const face of languages) {
      const label = doc.createElement("h3");
      label.textContent = copy[face];
      const message = doc.createElement("p");
      message.lang = card[face] ? face : "und";
      message.dir = "auto";
      message.textContent = displayText(card, face);
      article.append(label, message);
    }
    main.append(article);
  }
  doc.body.append(main);
  return {
    name: copy.fileName,
    mime: "text/html;charset=utf-8",
    content: "<!doctype html>\n" + doc.documentElement.outerHTML,
  };
}
