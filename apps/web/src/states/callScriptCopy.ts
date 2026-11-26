/** Wording for the call script. Every line comes in English and French. */
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const callScriptHeading = (l: Locale) => t(l, "Call script", "Script d’appel");
export const callScriptToggle = (open: boolean, l: Locale) =>
  open ? t(l, "Hide the call script", "Masquer le script d’appel") : t(l, "Write a call script for a place", "Préparer un script d’appel pour un lieu");
export const callScriptIntro = (l: Locale) =>
  t(
    l,
    "A short script to read when you phone a place: what to say, how to read out its name and address, and the questions to ask. It uses only what the pack holds and shows nothing it does not hold. The call is yours to make; nothing is dialled or sent from here.",
    "Un court script à lire quand vous téléphonez à un lieu\u00a0: quoi dire, comment épeler son nom et lire son adresse, et les questions à poser. Il n’utilise que ce que le pack contient et n’affiche rien d’autre. L’appel reste à faire de votre côté\u00a0; rien n’est composé ni envoyé d’ici.",
  );
export const callScriptFilterLabel = (l: Locale) => t(l, "Find a place by name", "Trouver un lieu par son nom");
export const callScriptFilterHint = (l: Locale) => t(l, "Type part of the name. The first matches are listed.", "Saisissez une partie du nom. Les premiers résultats sont listés.");
export const callScriptPickLabel = (l: Locale) => t(l, "Place to call", "Lieu à appeler");
export const callScriptNoMatch = (l: Locale) => t(l, "No place in this list has that in its name.", "Aucun lieu de cette liste n’a ceci dans son nom.");
export const callScriptNoPlaces = (l: Locale) => t(l, "There are no places to write a script for.", "Il n’y a aucun lieu pour lequel préparer un script.");
export const callScriptMoreLine = (hidden: number, l: Locale) =>
  hidden === 1 ? t(l, "1 more match is not listed. Type more of the name.", "1 autre résultat n’est pas listé. Saisissez plus du nom.") : t(l, `${hidden} more matches are not listed. Type more of the name.`, `${hidden} autres résultats ne sont pas listés. Saisissez plus du nom.`);
export const callScriptSpellLabel = (l: Locale) => t(l, "Spell out the name letter by letter", "Épeler le nom lettre par lettre");
export const callScriptAddressLabel = (l: Locale) => t(l, "Read the address out loud", "Lire l’adresse à voix haute");
export const callScriptQuestionsLabel = (l: Locale) => t(l, "Include the questions", "Inclure les questions");
export const callScriptNoName = (l: Locale) => t(l, "Name not in the pack", "Nom absent du pack");

export const callScriptSaveText = (l: Locale) => t(l, "Save as a text file", "Enregistrer en fichier texte");
export const callScriptSaveHtml = (l: Locale) => t(l, "Save as a printable page", "Enregistrer en page imprimable");
export const callScriptSavedLine = (name: string, l: Locale) => t(l, `Saved ${name}.`, `Fichier ${name} enregistré.`);
export const callScriptCannotSave = (l: Locale) => t(l, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
export const callScriptTextName: Readonly<Record<Locale, string>> = { en: "call-script.txt", fr: "script-appel.txt" };
export const callScriptHtmlName: Readonly<Record<Locale, string>> = { en: "call-script.html", fr: "script-appel.html" };

export const callScriptReadAloud = (l: Locale) => t(l, "Read it out loud", "Le lire à voix haute");
export const callScriptStopReading = (l: Locale) => t(l, "Stop reading", "Arrêter la lecture");
export const callScriptNoSpeech = (l: Locale) => t(l, "This browser has no voice to read with.", "Ce navigateur n’a pas de voix pour lire.");
export const callScriptSpeedLabel = (l: Locale) => t(l, "Reading speed", "Vitesse de lecture");
export const callScriptSpeedOptions = (l: Locale) =>
  [
    { id: "slow", label: t(l, "Slow", "Lente") },
    { id: "normal", label: t(l, "Normal", "Normale") },
    { id: "fast", label: t(l, "Quick", "Rapide") },
  ] as const;

/** Section headings and fixed lines of the script itself. */
export const scriptCopy = {
  title: (name: string | null, l: Locale) => (name ? t(l, `Call script: ${name}`, `Script d’appel\u00a0: ${name}`) : t(l, "Call script", "Script d’appel")),
  openingHeading: (l: Locale) => t(l, "Opening", "Ouverture"),
  opening: (l: Locale) =>
    t(
      l,
      "Hello. I am calling to ask a few questions before a visit. Is this a good moment, or is there a better time to call back?",
      "Bonjour. J’appelle pour poser quelques questions avant une visite. Est-ce un bon moment, ou y a-t-il un meilleur moment pour rappeler\u00a0?",
    ),
  placeHeading: (l: Locale) => t(l, "The place", "Le lieu"),
  placeSay: (name: string, l: Locale) => t(l, `I am calling about ${name}.`, `J’appelle au sujet de ${name}.`),
  placeNoName: (l: Locale) => t(l, "The pack gives no name for this place. Say the street and ask if you have the right place.", "Le pack ne donne pas de nom pour ce lieu. Dites la rue et demandez si c’est bien le bon endroit."),
  spellSay: (l: Locale) => t(l, "If it helps, I can spell the name:", "Si cela aide, je peux épeler le nom\u00a0:"),
  spellCut: (n: number, l: Locale) => t(l, `Only the first ${n} characters are spelled.`, `Seuls les ${n} premiers caractères sont épelés.`),
  addressHeading: (l: Locale) => t(l, "The address", "L’adresse"),
  addressSay: (spoken: string, l: Locale) => t(l, `The address I have is ${spoken}.`, `L’adresse indiquée est ${spoken}.`),
  addressAsk: (l: Locale) => t(l, "Is that the right address for the entrance people use?", "Est-ce la bonne adresse pour l’entrée que les gens utilisent\u00a0?"),
  addressNone: (l: Locale) => t(l, "The pack gives no street address for this place. Ask for the address and write it down.", "Le pack ne donne pas d’adresse civique pour ce lieu. Demandez l’adresse et notez-la."),
  addressPoBox: (l: Locale) => t(l, "The pack gives a post-office box, not a street. Ask where visitors go in.", "Le pack donne une case postale, pas une rue. Demandez où les visiteurs entrent."),
  addressIntersection: (l: Locale) => t(l, "The pack gives a corner, not a street number. Ask for the street number.", "Le pack donne un coin de rues, pas un numéro civique. Demandez le numéro civique."),
  questionsHeading: (l: Locale) => t(l, "Questions", "Questions"),
  noQuestions: (l: Locale) => t(l, "No questions were included.", "Aucune question n’a été incluse."),
  answerLabel: (l: Locale) => t(l, "Answer:", "Réponse\u00a0:"),
  basisLabel: (l: Locale) => t(l, "Why ask:", "Pourquoi demander\u00a0:"),
  closingHeading: (l: Locale) => t(l, "Closing", "Fin de l’appel"),
  closing: (l: Locale) => t(l, "Thank you for your time. Could I have your name, so I know who I spoke to?", "Merci de votre temps. Puis-je avoir votre nom, pour savoir à qui je parle\u00a0?"),
  noteDate: (l: Locale) => t(l, "Date of the call:", "Date de l’appel\u00a0:"),
  noteTime: (l: Locale) => t(l, "Time:", "Heure\u00a0:"),
  notePerson: (l: Locale) => t(l, "Spoke to:", "Parlé à\u00a0:"),
  noteBack: (l: Locale) => t(l, "Call back on:", "Rappeler le\u00a0:"),
  footer: (today: string, l: Locale) => t(l, `Made on this device on ${today} from the pack. Not checked with the place.`, `Fait sur cet appareil le ${today} à partir du pack. Non confirmé auprès du lieu.`),
} as const;
