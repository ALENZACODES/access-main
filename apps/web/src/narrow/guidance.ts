import type { LocalizedText } from './audit.js';
import type { AuditReport } from './report.js';
import { CHECK_LABELS, NBSP, type CheckId, type Lang } from './types.js';

/**
 * For each check: who is affected when it finds something, and how a person
 * can look at it by hand. A finding from these checks is a prompt, and an
 * UNKNOWN always needs a person, so the report can say what to do next. The
 * texts name people and tasks, give no medical advice, and promise nothing:
 * doing the hand check does not make a page conform.
 */

export interface Guidance {
  readonly who: LocalizedText;
  readonly byHand: LocalizedText;
}

const g = (whoEn: string, whoFr: string, handEn: string, handFr: string): Guidance => ({ who: { en: whoEn, fr: whoFr }, byHand: { en: handEn, fr: handFr } });

export const GUIDANCE: Readonly<Partial<Record<CheckId, Guidance>>> = {
  reflow: g(
    'People who zoom in, and people on a small phone.',
    'Les personnes qui agrandissent la page et celles qui ont un petit téléphone.',
    'Set the window to 320 pixels wide, or zoom to 400 percent at 1280 wide, and read every part without scrolling sideways.',
    'Réglez la fenêtre à 320 pixels de large, ou zoomez à 400 pour cent à 1280 de large, et lisez chaque partie sans défiler de côté.',
  ),
  'target-size': g(
    'People with limited hand control, with tremor, or who use a finger, a knuckle or a mouth stick.',
    'Les personnes dont le contrôle de la main est limité, qui ont des tremblements, ou qui utilisent un doigt, une jointure ou une licorne buccale.',
    'On a phone, press each control with the side of a thumb and note the ones that are easy to miss.',
    'Sur un téléphone, appuyez sur chaque commande avec le côté du pouce et notez celles que l’on manque facilement.',
  ),
  'target-spacing': g(
    'People who press near a control and not exactly on it.',
    'Les personnes qui appuient près d’une commande plutôt qu’exactement dessus.',
    'Press between two neighbouring controls and see whether the wrong one reacts.',
    'Appuyez entre deux commandes voisines et regardez si la mauvaise réagit.',
  ),
  contrast: g(
    'People with low vision, and anyone reading outdoors or on a dim screen.',
    'Les personnes malvoyantes, et toute personne qui lit dehors ou sur un écran peu lumineux.',
    'Measure the text and its background with a contrast tool, and read the page on a phone in daylight.',
    'Mesurez le texte et son arrière-plan avec un outil de contraste, et lisez la page sur un téléphone en plein jour.',
  ),
  name: g(
    'People who use a screen reader or voice control.',
    'Les personnes qui utilisent un lecteur d’écran ou la commande vocale.',
    'Move to each control with a screen reader and listen for a name that says what it does.',
    'Allez sur chaque commande avec un lecteur d’écran et écoutez si un nom dit ce qu’elle fait.',
  ),
  'label-in-name': g(
    'People who speak the visible words to activate a control.',
    'Les personnes qui prononcent les mots visibles pour activer une commande.',
    'With voice control on, say the words shown on each control and see whether it responds.',
    'Avec la commande vocale, dites les mots affichés sur chaque commande et regardez si elle répond.',
  ),
  language: g(
    'People who listen to the page, because the voice follows the declared language.',
    'Les personnes qui écoutent la page, car la voix suit la langue déclarée.',
    'Listen to the first paragraph with a screen reader in English and in French.',
    'Écoutez le premier paragraphe avec un lecteur d’écran, en anglais et en français.',
  ),
  'focus-obscured': g(
    'People who use a keyboard and need to see where they are.',
    'Les personnes qui utilisent un clavier et doivent voir où elles se trouvent.',
    'Press Tab through the page and watch for a focused control that hides under a fixed bar.',
    'Parcourez la page avec la touche Tab et repérez une commande active qui se cache sous une barre fixe.',
  ),
  'text-spacing': g(
    'People with low vision or dyslexia who widen the spacing of text.',
    'Les personnes malvoyantes ou dyslexiques qui élargissent l’espacement du texte.',
    'Apply a text spacing bookmarklet and look for text that is cut off or overlaps.',
    'Appliquez un signet d’espacement du texte et cherchez du texte coupé ou qui se chevauche.',
  ),
  i18n: g(
    'People who read the page in French.',
    'Les personnes qui lisent la page en français.',
    'Switch the language and read each screen for English left behind, missing words and wrong punctuation.',
    'Changez de langue et lisez chaque écran pour repérer de l’anglais oublié, des mots manquants et une ponctuation fautive.',
  ),
  offline: g(
    'People with a weak or costly connection, often when they are already on their way.',
    'Les personnes dont la connexion est faible ou coûteuse, souvent quand elles sont déjà en route.',
    'Load the page once, turn the network off, reload, and see what is still there.',
    'Chargez la page une fois, coupez le réseau, rechargez, et regardez ce qui reste.',
  ),
  keyboard: g(
    'People who cannot use a mouse or a touch screen, and people who use a switch.',
    'Les personnes qui ne peuvent utiliser ni souris ni écran tactile, et celles qui utilisent un contacteur.',
    'Put the mouse away and do the main task with Tab, Shift+Tab, Enter, Space and the arrow keys.',
    'Rangez la souris et faites la tâche principale avec Tab, Maj+Tab, Entrée, Espace et les flèches.',
  ),
  'focus-visible': g(
    'People who use a keyboard and can see the screen.',
    'Les personnes qui utilisent un clavier et voient l’écran.',
    'Press Tab through the page and stop wherever you lose sight of the focus.',
    'Parcourez la page avec la touche Tab et arrêtez-vous là où vous perdez le focus de vue.',
  ),
  motion: g(
    'People who get dizzy or distracted by movement on screen.',
    'Les personnes que le mouvement à l’écran étourdit ou distrait.',
    'Turn on the reduced motion setting of the device and look for anything that still moves.',
    'Activez le réglage de réduction des animations de l’appareil et cherchez ce qui bouge encore.',
  ),
  'static-html': g(
    'People who use assistive technology, which reads the markup and not the look.',
    'Les personnes qui utilisent une technologie d’assistance, laquelle lit le balisage et non l’apparence.',
    'Open the page with a screen reader and list its headings, landmarks, links and form fields.',
    'Ouvrez la page avec un lecteur d’écran et listez ses titres, ses repères, ses liens et ses champs.',
  ),
  copy: g(
    'Everyone who relies on what the App says about a place.',
    'Toutes les personnes qui se fient à ce que l’App dit d’un lieu.',
    'Read each flagged sentence and ask whether the App can show a source for it.',
    'Lisez chaque phrase signalée et demandez-vous si l’App peut en montrer la source.',
  ),
  provenance: g(
    'Everyone who plans a trip from this data.',
    'Toutes les personnes qui préparent un déplacement à partir de ces données.',
    'Open the record and look for its source, licence, date and tier.',
    'Ouvrez la fiche et cherchez sa source, sa licence, sa date et son niveau.',
  ),
  'link-cue': g(
    'People who cannot tell colours apart.',
    'Les personnes qui ne distinguent pas les couleurs.',
    'View the page in greyscale and find the links inside a paragraph.',
    'Affichez la page en niveaux de gris et trouvez les liens dans un paragraphe.',
  ),
  'non-text-contrast': g(
    'People with low vision who need to see where a field starts and ends.',
    'Les personnes malvoyantes qui doivent voir où un champ commence et finit.',
    'Measure the border of each field against the page with a contrast tool.',
    'Mesurez la bordure de chaque champ par rapport à la page avec un outil de contraste.',
  ),
  dragging: g(
    'People who cannot hold and drag, and people who use a switch or voice control.',
    'Les personnes qui ne peuvent pas maintenir et faire glisser, et celles qui utilisent un contacteur ou la commande vocale.',
    'Do the same task with single taps or with the keyboard only.',
    'Faites la même tâche avec de simples touchers ou avec le clavier seul.',
  ),
  consistency: g(
    'People who learn where things are and rely on them staying there.',
    'Les personnes qui apprennent où sont les choses et comptent les y retrouver.',
    'Open three pages side by side and compare the order of the navigation and the place of the help link.',
    'Ouvrez trois pages côte à côte et comparez l’ordre de la navigation et la place du lien d’aide.',
  ),
  waiver: g(
    'The team, because an expired waiver hides nothing and a wrong one hides too much.',
    'L’équipe, car une dérogation expirée ne cache rien et une dérogation erronée cache trop.',
    'Read the waivers file and confirm each reason and end date with its owner.',
    'Lisez le fichier des dérogations et confirmez chaque motif et chaque date de fin avec la personne responsable.',
  ),
  external: g(
    'People who use the App offline or who do not want other sites to see their visit.',
    'Les personnes qui utilisent l’App hors ligne ou qui ne veulent pas que d’autres sites voient leur visite.',
    'Open the network panel, reload, and list every host that is not the App.',
    'Ouvrez le panneau réseau, rechargez, et listez chaque hôte qui n’est pas l’App.',
  ),
  manifest: g(
    'People who install the App on their home screen.',
    'Les personnes qui installent l’App sur leur écran d’accueil.',
    'Install the App on a phone and look at its name, its icon and how it opens.',
    'Installez l’App sur un téléphone et regardez son nom, son icône et sa façon de s’ouvrir.',
  ),
  'service-worker': g(
    'People who open the App with no connection.',
    'Les personnes qui ouvrent l’App sans connexion.',
    'Install the App, turn the network off, and open each main screen.',
    'Installez l’App, coupez le réseau, et ouvrez chaque écran principal.',
  ),
  parity: g(
    'People whose device is fixed in one position, and people who use dark mode or high contrast.',
    'Les personnes dont l’appareil est fixé dans une position, et celles qui utilisent le mode sombre ou le contraste élevé.',
    'Turn the device, switch to dark mode, and look for a control that is gone.',
    'Tournez l’appareil, passez en mode sombre, et cherchez une commande qui a disparu.',
  ),
  budget: g(
    'The team, because a limit that is passed means the count of findings went up.',
    'L’équipe, car une limite dépassée signifie que le nombre d’anomalies a augmenté.',
    'Compare this run with the last one and look at what is new.',
    'Comparez cette exécution à la précédente et regardez ce qui est nouveau.',
  ),
  weight: g(
    'People on a slow or metered connection, and people with an older phone.',
    'Les personnes dont la connexion est lente ou limitée, et celles qui ont un téléphone ancien.',
    'Load the page on a throttled connection and time how long it takes to be usable.',
    'Chargez la page sur une connexion bridée et mesurez le temps avant de pouvoir l’utiliser.',
  ),
  forms: g(
    'People who fill in forms with a screen reader, with zoom, or with memory difficulties.',
    'Les personnes qui remplissent des formulaires avec un lecteur d’écran, avec le zoom, ou avec des difficultés de mémoire.',
    'Fill in the form with a screen reader, make one mistake on purpose, and listen for what is announced.',
    'Remplissez le formulaire avec un lecteur d’écran, faites une erreur exprès, et écoutez ce qui est annoncé.',
  ),
  auth: g(
    'People who cannot memorise or retype a password or a code.',
    'Les personnes qui ne peuvent ni mémoriser ni retaper un mot de passe ou un code.',
    'Sign in using a password manager and paste, with no typing.',
    'Connectez-vous avec un gestionnaire de mots de passe et le collage, sans rien taper.',
  ),
  status: g(
    'People who cannot see a message appear on screen.',
    'Les personnes qui ne voient pas un message apparaître à l’écran.',
    'With a screen reader on, trigger each message and listen for it without moving focus.',
    'Avec un lecteur d’écran, déclenchez chaque message et écoutez-le sans déplacer le focus.',
  ),
  media: g(
    'People who are deaf or hard of hearing, and people who listen to a screen reader over the sound.',
    'Les personnes sourdes ou malentendantes, et celles qui écoutent un lecteur d’écran par-dessus le son.',
    'Play each clip with the sound off, then with a screen reader on.',
    'Lisez chaque séquence sans le son, puis avec un lecteur d’écran.',
  ),
  'fixed-space': g(
    'People who zoom in, for whom a fixed bar can cover most of the screen.',
    'Les personnes qui agrandissent la page, pour qui une barre fixe peut couvrir presque tout l’écran.',
    'Zoom to 200 percent on a phone held sideways and see how much room is left to read.',
    'Zoomez à 200 pour cent sur un téléphone tenu à l’horizontale et regardez la place qui reste pour lire.',
  ),
  clipping: g(
    'People who enlarge text or read in a language with longer words.',
    'Les personnes qui agrandissent le texte ou lisent dans une langue aux mots plus longs.',
    'Switch to French, enlarge the text, and look for words that are cut off.',
    'Passez en français, agrandissez le texte, et cherchez des mots coupés.',
  ),
  'lang-parts': g(
    'People who listen to the page, because a passage in the other language is read with the wrong voice.',
    'Les personnes qui écoutent la page, car un passage dans l’autre langue est lu avec la mauvaise voix.',
    'Listen to the flagged passage with a screen reader.',
    'Écoutez le passage signalé avec un lecteur d’écran.',
  ),
  timing: g(
    'People who read slowly, and people distracted by content that moves by itself.',
    'Les personnes qui lisent lentement, et celles que distrait un contenu qui bouge tout seul.',
    'Wait on the page without touching it and note anything that changes, moves or runs out.',
    'Attendez sur la page sans y toucher et notez tout ce qui change, bouge ou expire.',
  ),
  purpose: g(
    'People who rely on autofill because typing is slow or tiring.',
    'Les personnes qui comptent sur le remplissage automatique parce que la saisie est lente ou fatigante.',
    'Fill in the form with the autofill of the browser and see which fields get the wrong value.',
    'Remplissez le formulaire avec le remplissage automatique du navigateur et regardez quels champs reçoivent la mauvaise valeur.',
  ),
  tables: g(
    'People who read tables with a screen reader, one cell at a time.',
    'Les personnes qui lisent les tableaux avec un lecteur d’écran, une cellule à la fois.',
    'Move through the table cell by cell with a screen reader and listen for the headers.',
    'Parcourez le tableau cellule par cellule avec un lecteur d’écran et écoutez les en-têtes.',
  ),
  frames: g(
    'People who use a screen reader and meet embedded content with no description.',
    'Les personnes qui utilisent un lecteur d’écran et rencontrent un contenu intégré sans description.',
    'List the frames with a screen reader and see whether each title says what is inside.',
    'Listez les cadres avec un lecteur d’écran et regardez si chaque titre dit ce qu’il contient.',
  ),
  bypass: g(
    'People who use a keyboard or a switch and would otherwise pass every link on every page.',
    'Les personnes qui utilisent un clavier ou un contacteur et devraient sinon passer par tous les liens de chaque page.',
    'Load the page, press Tab once, press Enter, and see where focus lands.',
    'Chargez la page, appuyez une fois sur Tab, puis sur Entrée, et regardez où arrive le focus.',
  ),
  links: g(
    'People who read a list of links out of context.',
    'Les personnes qui lisent une liste de liens hors contexte.',
    'Open the list of links of a screen reader and see whether each one makes sense alone.',
    'Ouvrez la liste des liens d’un lecteur d’écran et regardez si chacun se comprend seul.',
  ),
  images: g(
    'People who cannot see images.',
    'Les personnes qui ne voient pas les images.',
    'Turn images off, or listen with a screen reader, and see whether anything is lost.',
    'Désactivez les images, ou écoutez avec un lecteur d’écran, et regardez si quelque chose se perd.',
  ),
  plain: g(
    'People who read with difficulty, who are tired or in pain, or who read in a second language.',
    'Les personnes qui lisent avec difficulté, qui sont fatiguées ou ont mal, ou qui lisent dans une langue seconde.',
    'Read the flagged text aloud once and ask someone outside the team what it asks them to do.',
    'Lisez le texte signalé à voix haute une fois et demandez à une personne extérieure à l’équipe ce qu’il lui demande de faire.',
  ),
  locale: g(
    'People who read dates, times and amounts in French or in English.',
    'Les personnes qui lisent des dates, des heures et des montants en français ou en anglais.',
    'Read each date and amount in both languages and ask whether it can be read two ways.',
    'Lisez chaque date et chaque montant dans les deux langues et demandez-vous s’il peut se lire de deux façons.',
  ),
  sensory: g(
    'People who cannot see colour, shape or position, or cannot hear a sound.',
    'Les personnes qui ne perçoivent pas la couleur, la forme ou la position, ou qui n’entendent pas un son.',
    'Follow the instruction with a screen reader and the screen off.',
    'Suivez la consigne avec un lecteur d’écran et l’écran éteint.',
  ),
  'text-zoom': g(
    'People with low vision who enlarge text.',
    'Les personnes malvoyantes qui agrandissent le texte.',
    'Set the text size of the browser to 200 percent and read every part.',
    'Réglez la taille du texte du navigateur à 200 pour cent et lisez chaque partie.',
  ),
  headings: g(
    'People who move through a page by its headings.',
    'Les personnes qui parcourent une page par ses titres.',
    'List the headings with a screen reader and see whether the list reads like a table of contents.',
    'Listez les titres avec un lecteur d’écran et regardez si la liste se lit comme une table des matières.',
  ),
  handlers: g(
    'People who use a keyboard, a switch or voice control.',
    'Les personnes qui utilisent un clavier, un contacteur ou la commande vocale.',
    'Reach the element with Tab and activate it with Enter and with Space.',
    'Atteignez l’élément avec Tab et activez-le avec Entrée puis avec Espace.',
  ),
  typography: g(
    'People with low vision or dyslexia, for whom small, tight or justified text is hard to follow.',
    'Les personnes malvoyantes ou dyslexiques, pour qui un texte petit, serré ou justifié est difficile à suivre.',
    'Read the passage on a phone at arm’s length.',
    'Lisez le passage sur un téléphone tenu à bout de bras.',
  ),
  order: g(
    'People who listen to the page or move through it with the keyboard, in the order of the markup.',
    'Les personnes qui écoutent la page ou la parcourent au clavier, dans l’ordre du balisage.',
    'Press Tab through the part and compare the order with what you see.',
    'Parcourez la partie avec la touche Tab et comparez l’ordre à ce que vous voyez.',
  ),
  generated: g(
    'People who use a screen reader or replace the fonts and styles of a page.',
    'Les personnes qui utilisent un lecteur d’écran ou remplacent les polices et les styles d’une page.',
    'Turn the style sheets off and see whether the words are still there.',
    'Désactivez les feuilles de style et regardez si les mots sont toujours là.',
  ),
  lookalike: g(
    'People who move by headings and lists with a screen reader.',
    'Les personnes qui se déplacent par titres et par listes avec un lecteur d’écran.',
    'List the headings and the lists with a screen reader and look for the flagged text.',
    'Listez les titres et les listes avec un lecteur d’écran et cherchez le texte signalé.',
  ),
  regions: g(
    'People who jump between the main parts of a page with a screen reader.',
    'Les personnes qui sautent d’une grande partie de la page à l’autre avec un lecteur d’écran.',
    'List the landmarks with a screen reader and see which content belongs to none.',
    'Listez les repères avec un lecteur d’écran et regardez quel contenu n’appartient à aucun.',
  ),
  aria: g(
    'People who use a screen reader, which announces the role and state written in the markup.',
    'Les personnes qui utilisent un lecteur d’écran, lequel annonce le rôle et l’état écrits dans le balisage.',
    'Move to the element with a screen reader and compare what is announced with what the element does.',
    'Allez sur l’élément avec un lecteur d’écran et comparez ce qui est annoncé à ce que fait l’élément.',
  ),
  references: g(
    'People who use a screen reader, for whom a broken link between two elements leaves one of them with no name or no description.',
    'Les personnes qui utilisent un lecteur d’écran, pour qui un lien rompu entre deux éléments laisse l’un d’eux sans nom ou sans description.',
    'Activate the link or move to the field and see whether the other element is reached or announced.',
    'Activez le lien ou allez sur le champ et regardez si l’autre élément est atteint ou annoncé.',
  ),
  hrefs: g(
    'People who use a keyboard or a screen reader, and people who tap a phone number or an email link.',
    'Les personnes qui utilisent un clavier ou un lecteur d’écran, et celles qui touchent un numéro de téléphone ou un lien de courriel.',
    'Activate the link on a phone and see what opens.',
    'Activez le lien sur un téléphone et regardez ce qui s’ouvre.',
  ),
  css: g(
    'People who use a keyboard, enlarge text, change text spacing or turn motion off.',
    'Les personnes qui utilisent un clavier, agrandissent le texte, modifient l’espacement du texte ou coupent les animations.',
    'Find the rule in the style sheet, then try the page with the keyboard, with zoom and with reduced motion.',
    'Trouvez la règle dans la feuille de style, puis essayez la page au clavier, avec le zoom et avec la réduction des animations.',
  ),
  obsolete: g(
    'People who replace colours, fonts or spacing, and people on a narrow screen.',
    'Les personnes qui remplacent les couleurs, les polices ou l’espacement, et celles qui ont un écran étroit.',
    'Open the page at 320 pixels wide with your own colours and text size.',
    'Ouvrez la page à 320 pixels de large avec vos propres couleurs et votre taille de texte.',
  ),
  states: g(
    'People who use a screen reader or a keyboard, when what is announced differs from what the control does.',
    'Les personnes qui utilisent un lecteur d’écran ou un clavier, quand ce qui est annoncé diffère de ce que fait la commande.',
    'Move to the control with a screen reader, listen to its state, then try to use it.',
    'Allez sur la commande avec un lecteur d’écran, écoutez son état, puis essayez de l’utiliser.',
  ),
  lists: g(
    'People who use a screen reader, which announces a list and its number of items.',
    'Les personnes qui utilisent un lecteur d’écran, lequel annonce une liste et son nombre d’éléments.',
    'Move into the list with a screen reader and compare the number announced with the items you see.',
    'Entrez dans la liste avec un lecteur d’écran et comparez le nombre annoncé aux éléments que vous voyez.',
  ),
  sectioning: g(
    'People who move by landmarks and headings with a screen reader.',
    'Les personnes qui se déplacent par repères et par titres avec un lecteur d’écran.',
    'List the landmarks and the headings with a screen reader and see whether each part can be found and told apart.',
    'Listez les repères et les titres avec un lecteur d’écran et regardez si chaque partie se trouve et se distingue.',
  ),
  constraints: g(
    'People who fill in forms with a screen reader, by pasting, or with limited hand control.',
    'Les personnes qui remplissent des formulaires avec un lecteur d’écran, par collage, ou avec un contrôle limité de la main.',
    'Enter a value that breaks the limit and see what the page says about it.',
    'Saisissez une valeur qui dépasse la limite et regardez ce que la page en dit.',
  ),
  symbols: g(
    'People who use a screen reader or voice control, and people who replace the fonts of a page.',
    'Les personnes qui utilisent un lecteur d’écran ou la commande vocale, et celles qui remplacent les polices d’une page.',
    'Listen to the control or the text with a screen reader and note what is spoken.',
    'Écoutez la commande ou le texte avec un lecteur d’écran et notez ce qui est prononcé.',
  ),
  document: g(
    'People who listen to the page or read it in a language written from right to left, and people on a weak connection.',
    'Les personnes qui écoutent la page ou la lisent dans une langue écrite de droite à gauche, et celles dont la connexion est faible.',
    'Listen to the start of the page with a screen reader, then load it once with scripts blocked and see what is left.',
    'Écoutez le début de la page avec un lecteur d’écran, puis chargez-la une fois en bloquant les scripts et regardez ce qui reste.',
  ),
  'table-markup': g(
    'People who read tables with a screen reader and rely on the headers announced with each cell.',
    'Les personnes qui lisent les tableaux avec un lecteur d’écran et comptent sur les en-têtes annoncés avec chaque cellule.',
    'Move down a column and along a row with a screen reader and compare the headers announced with the ones you see.',
    'Descendez une colonne et longez une ligne avec un lecteur d’écran et comparez les en-têtes annoncés à ceux que vous voyez.',
  ),
  labels: g(
    'People who fill in forms with a screen reader or voice control, and people who press the label to reach a small field.',
    'Les personnes qui remplissent des formulaires avec un lecteur d’écran ou la commande vocale, et celles qui appuient sur l’étiquette pour atteindre un petit champ.',
    'Press each label and see which field gets focus, then listen to the name of each field with a screen reader.',
    'Appuyez sur chaque étiquette et regardez quel champ reçoit le focus, puis écoutez le nom de chaque champ avec un lecteur d’écran.',
  ),
  identifiers: g(
    'People who use a screen reader, for whom a reference that finds nothing leaves a control with no name or no description.',
    'Les personnes qui utilisent un lecteur d’écran, pour qui une référence qui ne trouve rien laisse une commande sans nom ou sans description.',
    'Search the markup for the id that is referred to, then listen to the control with a screen reader.',
    'Cherchez dans le balisage l’identifiant référencé, puis écoutez la commande avec un lecteur d’écran.',
  ),
  'name-words': g(
    'People who use a screen reader and hear every word of a name each time they reach the control.',
    'Les personnes qui utilisent un lecteur d’écran et entendent chaque mot d’un nom à chaque passage sur la commande.',
    'Move to the control with a screen reader and write down exactly what is spoken.',
    'Allez sur la commande avec un lecteur d’écran et notez exactement ce qui est prononcé.',
  ),
};

/** Used for a check that has no entry of its own, such as one a newer build added. */
export const FALLBACK_GUIDANCE: Guidance = g(
  'People who use assistive technology, a keyboard, zoom or a small screen.',
  'Les personnes qui utilisent une technologie d’assistance, un clavier, le zoom ou un petit écran.',
  'Read the message of the finding, open the page, and try the same thing with a keyboard and with a screen reader.',
  'Lisez le message de l’anomalie, ouvrez la page, et essayez la même chose au clavier et avec un lecteur d’écran.',
);

export function hasGuidance(check: string): boolean {
  return Object.prototype.hasOwnProperty.call(GUIDANCE, check);
}

export function guidanceFor(check: string): Guidance {
  return hasGuidance(check) ? ((GUIDANCE as Readonly<Record<string, Guidance>>)[check] ?? FALLBACK_GUIDANCE) : FALLBACK_GUIDANCE;
}

const HEAD = {
  who: { en: 'Who this affects', fr: 'Qui est concerné' },
  byHand: { en: 'To look at it by hand', fr: 'Pour le contrôler à la main' },
} as const;

/** Two lines for one check: who is affected, and how to look by hand. */
export function describeGuidance(check: string, lang: Lang): string {
  const colon = lang === 'fr' ? `${NBSP}:` : ':';
  const x = guidanceFor(check);
  return `${HEAD.who[lang]}${colon} ${x.who[lang]}\n${HEAD.byHand[lang]}${colon} ${x.byHand[lang]}`;
}

export interface GuidanceItem {
  readonly check: string;
  readonly label: string;
  readonly failed: number;
  readonly unknown: number;
  readonly guidance: Guidance;
}

/** The checks of a report that found something, with their guidance, the ones with failures first, then by number of findings. */
export function guidanceForReport(report: AuditReport, lang: Lang): GuidanceItem[] {
  const counts = new Map<string, { failed: number; unknown: number }>();
  for (const r of report.routes) {
    for (const e of r.entries) {
      const c = counts.get(e.check) ?? { failed: 0, unknown: 0 };
      if (e.status === 'fail') c.failed++;
      else c.unknown++;
      counts.set(e.check, c);
    }
  }
  const labels = CHECK_LABELS as Readonly<Record<string, LocalizedText | undefined>>;
  return [...counts.entries()]
    .map(([check, c]) => ({ check, label: labels[check]?.[lang] ?? check, failed: c.failed, unknown: c.unknown, guidance: guidanceFor(check) }))
    .sort((a, b) => Number(b.failed > 0) - Number(a.failed > 0) || b.failed + b.unknown - (a.failed + a.unknown) || a.check.localeCompare(b.check));
}

/** A plain text "what to do next" section for a report, or an empty string when the report has no finding. */
export function renderNextSteps(report: AuditReport, lang: Lang): string {
  const items = guidanceForReport(report, lang);
  if (items.length === 0) return '';
  const colon = lang === 'fr' ? `${NBSP}:` : ':';
  const lines: string[] = [lang === 'fr' ? `Et maintenant${colon}` : `What to do next${colon}`];
  for (const item of items) {
    lines.push('');
    lines.push(
      lang === 'fr'
        ? `${item.label} (${item.check})${colon} ${item.failed} à corriger, ${item.unknown} à contrôler`
        : `${item.label} (${item.check})${colon} ${item.failed} to fix, ${item.unknown} to check`,
    );
    lines.push(`  ${HEAD.who[lang]}${colon} ${item.guidance.who[lang]}`);
    lines.push(`  ${HEAD.byHand[lang]}${colon} ${item.guidance.byHand[lang]}`);
  }
  lines.push('');
  lines.push(
    lang === 'fr'
      ? 'Faire ces contrôles à la main ne rend pas une page conforme. Ils montrent où regarder.'
      : 'Doing these hand checks does not make a page conform. They show where to look.',
  );
  return lines.join('\n') + '\n';
}
