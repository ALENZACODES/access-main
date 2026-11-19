import { WCAG22_AA } from './wcag22.js';
import type { Lang } from './types.js';

/**
 * One by-hand step for every Level A and AA criterion of WCAG 2.2: what a
 * person does, and what they look for. The steps are this tool's own
 * wording. Each one is a first look that finds common problems; none of
 * them tests the whole criterion, and going through all of them does not
 * make a page conform.
 */

export interface ManualStep {
  readonly sc: string;
  /** What to do. */
  readonly action: { readonly en: string; readonly fr: string };
  /** What to look for. */
  readonly look: { readonly en: string; readonly fr: string };
  /** What is needed besides a browser. */
  readonly needs: Need;
}

export type Need = 'browser' | 'keyboard' | 'screen-reader' | 'touch-device' | 'media';

export const NEED_LABELS: Readonly<Record<Need, { readonly en: string; readonly fr: string }>> = {
  browser: { en: 'a browser', fr: 'un navigateur' },
  keyboard: { en: 'a keyboard', fr: 'un clavier' },
  'screen-reader': { en: 'a screen reader', fr: 'un lecteur d’écran' },
  'touch-device': { en: 'a phone or tablet', fr: 'un téléphone ou une tablette' },
  media: { en: 'pages with audio or video', fr: 'des pages avec du son ou de la vidéo' },
};

const s = (sc: string, needs: Need, actionEn: string, actionFr: string, lookEn: string, lookFr: string): ManualStep => ({
  sc,
  needs,
  action: { en: actionEn, fr: actionFr },
  look: { en: lookEn, fr: lookFr },
});

export const MANUAL_STEPS: readonly ManualStep[] = [
  s('1.1.1', 'screen-reader', 'Move through the images, icons and maps with a screen reader.', 'Parcourez les images, les icônes et les cartes avec un lecteur d’écran.', 'Each one that carries information is announced with words that say the same thing. Decorative ones are skipped.', 'Chaque élément porteur d’information est annoncé avec des mots qui disent la même chose. Les éléments décoratifs sont ignorés.'),
  s('1.2.1', 'media', 'Find each recording that is only sound or only picture.', 'Repérez chaque enregistrement qui est seulement sonore ou seulement visuel.', 'A sound recording has a transcript. A silent video has a text or an audio version that says what happens.', 'Un enregistrement sonore a une transcription. Une vidéo muette a un texte ou une version audio qui dit ce qui se passe.'),
  s('1.2.2', 'media', 'Play each recorded video with the sound off and captions on.', 'Lisez chaque vidéo enregistrée sans le son, avec les sous-titres.', 'Captions give the speech and the sounds that matter, in step with the picture.', 'Les sous-titres donnent les paroles et les sons qui comptent, au rythme de l’image.'),
  s('1.2.3', 'media', 'Play each recorded video without looking at the picture.', 'Lisez chaque vidéo enregistrée sans regarder l’image.', 'What is only shown is also said, in an audio description or in a full text version.', 'Ce qui est seulement montré est aussi dit, dans une audiodescription ou dans une version texte complète.'),
  s('1.2.4', 'media', 'Watch a live broadcast with the sound off.', 'Regardez une diffusion en direct sans le son.', 'Captions follow the speech as it happens.', 'Des sous-titres suivent les paroles au fur et à mesure.'),
  s('1.2.5', 'media', 'Play each recorded video with the audio description track.', 'Lisez chaque vidéo enregistrée avec la piste d’audiodescription.', 'The description says what is only shown. A text version alone does not count here.', 'La description dit ce qui est seulement montré. Une version texte seule ne suffit pas ici.'),
  s('1.3.1', 'screen-reader', 'List the headings, landmarks, lists, tables and form fields with a screen reader.', 'Listez les titres, les repères, les listes, les tableaux et les champs avec un lecteur d’écran.', 'What looks like a heading, a list, a table or a group is announced as one, and each field has its label.', 'Ce qui ressemble à un titre, une liste, un tableau ou un groupe est annoncé comme tel, et chaque champ a son étiquette.'),
  s('1.3.2', 'screen-reader', 'Read the page from top to bottom with a screen reader.', 'Lisez la page de haut en bas avec un lecteur d’écran.', 'The order makes sense: nothing is read before what introduces it.', 'L’ordre a du sens\u00A0: rien n’est lu avant ce qui l’introduit.'),
  s('1.3.3', 'browser', 'Read the instructions on the page.', 'Lisez les consignes de la page.', 'None of them relies only on shape, colour, size, position or sound, such as “the round button on the right”.', 'Aucune ne repose seulement sur la forme, la couleur, la taille, la position ou le son, comme «\u202Fle bouton rond à droite\u202F».'),
  s('1.3.4', 'touch-device', 'Turn the device from portrait to landscape and back.', 'Faites pivoter l’appareil du mode portrait au mode paysage, puis l’inverse.', 'The page follows the device and stays usable both ways.', 'La page suit l’appareil et reste utilisable dans les deux sens.'),
  s('1.3.5', 'browser', 'Fill in the forms that ask about the person, with the browser’s autofill.', 'Remplissez les formulaires qui portent sur la personne, avec le remplissage automatique du navigateur.', 'Name, email, phone and address fields are offered the right saved values.', 'Les champs nom, courriel, téléphone et adresse reçoivent les bonnes valeurs enregistrées.'),
  s('1.4.1', 'browser', 'Look at the page in shades of grey.', 'Regardez la page en niveaux de gris.', 'Links, errors, required fields, states and map legends can still be told apart.', 'Les liens, les erreurs, les champs obligatoires, les états et les légendes de carte se distinguent encore.'),
  s('1.4.2', 'media', 'Open each page and listen.', 'Ouvrez chaque page et écoutez.', 'No sound starts by itself for more than three seconds, or a control at the top stops it.', 'Aucun son ne démarre seul pendant plus de trois secondes, ou une commande en haut de page l’arrête.'),
  s('1.4.3', 'browser', 'Measure the contrast of text placed on images, gradients and maps.', 'Mesurez le contraste du texte posé sur des images, des dégradés et des cartes.', 'Text reaches 4.5 to 1, or 3 to 1 when it is large, at the least favourable spot.', 'Le texte atteint 4,5 pour 1, ou 3 pour 1 quand il est grand, à l’endroit le moins favorable.'),
  s('1.4.4', 'browser', 'Zoom the browser to 200%.', 'Zoomez le navigateur à 200\u00A0%.', 'All text grows, nothing is cut off or covered, and every function still works.', 'Tout le texte grandit, rien n’est coupé ni recouvert, et chaque fonction marche encore.'),
  s('1.4.5', 'browser', 'Try to select the text of headings, buttons and banners.', 'Essayez de sélectionner le texte des titres, des boutons et des bannières.', 'Text is real text, not a picture of text. Logos are the exception.', 'Le texte est du vrai texte, pas une image de texte. Les logos font exception.'),
  s('1.4.10', 'browser', 'Set the window to 320 CSS pixels wide, or zoom a 1280 pixel window to 400%.', 'Réglez la fenêtre à 320 pixels CSS de large, ou zoomez à 400\u00A0% une fenêtre de 1280 pixels.', 'Everything can be read and used by scrolling one way only. Maps and data tables may scroll both ways.', 'Tout se lit et s’utilise en défilant dans un seul sens. Les cartes et les tableaux de données peuvent défiler dans les deux sens.'),
  s('1.4.11', 'browser', 'Measure the contrast of field borders, icons, focus rings and chart lines against what is next to them.', 'Mesurez le contraste des bordures de champ, des icônes, des anneaux de focus et des traits de graphique avec ce qui les entoure.', 'Each part needed to find or understand a control reaches 3 to 1.', 'Chaque partie nécessaire pour trouver ou comprendre une commande atteint 3 pour 1.'),
  s('1.4.12', 'browser', 'Apply wider text spacing with a user style: line height 1.5, paragraph spacing 2, letter spacing 0.12 and word spacing 0.16 times the font size.', 'Appliquez un espacement de texte plus large par un style utilisateur\u00A0: interligne 1,5, espace entre paragraphes 2, espace entre lettres 0,12 et entre mots 0,16 fois la taille de police.', 'No text is cut off, overlaps or disappears.', 'Aucun texte n’est coupé, ne se chevauche ni ne disparaît.'),
  s('1.4.13', 'keyboard', 'Open each tooltip and popup by hover and by focus.', 'Ouvrez chaque infobulle et chaque fenêtre surgissante au survol et au focus.', 'It can be closed without moving, the pointer can move onto it, and it stays until dismissed.', 'Elle se ferme sans déplacer le pointeur, le pointeur peut aller dessus, et elle reste jusqu’à ce qu’on la ferme.'),
  s('2.1.1', 'keyboard', 'Put the mouse away and do every task with the keyboard.', 'Rangez la souris et faites chaque tâche au clavier.', 'Every control can be reached and used, including the map, menus, dialogs and custom widgets.', 'Chaque commande s’atteint et s’utilise, y compris la carte, les menus, les boîtes de dialogue et les composants sur mesure.'),
  s('2.1.2', 'keyboard', 'Tab into each widget, dialog, map and embedded frame, then tab on.', 'Entrez avec Tab dans chaque composant, boîte de dialogue, carte et cadre intégré, puis continuez.', 'Focus can always leave with Tab, Shift+Tab, Escape or a key the page names.', 'Le focus peut toujours sortir avec Tab, Maj+Tab, Échap ou une touche que la page indique.'),
  s('2.1.4', 'keyboard', 'Press letter, number and punctuation keys one at a time while focus is on the page, not in a field.', 'Appuyez sur des lettres, des chiffres et des signes un par un, le focus étant sur la page et non dans un champ.', 'Nothing happens, or the shortcut can be turned off or changed.', 'Rien ne se passe, ou le raccourci peut être désactivé ou modifié.'),
  s('2.2.1', 'browser', 'Leave each page and each form open and idle for the length of its time limit.', 'Laissez chaque page et chaque formulaire ouverts, sans rien faire, pendant la durée de leur délai.', 'Before time runs out, a warning lets the person ask for more time, or there is no limit.', 'Avant la fin du délai, un avertissement permet de demander plus de temps, ou il n’y a pas de délai.'),
  s('2.2.2', 'browser', 'Watch each page for five seconds without touching anything.', 'Regardez chaque page pendant cinq secondes sans rien toucher.', 'Anything that moves, blinks, scrolls or updates by itself can be paused, stopped or hidden.', 'Tout ce qui bouge, clignote, défile ou se met à jour seul peut être mis en pause, arrêté ou masqué.'),
  s('2.3.1', 'media', 'Watch animations and videos for flashing.', 'Regardez si des animations ou des vidéos produisent des flashs.', 'Nothing flashes more than three times in one second.', 'Rien ne flashe plus de trois fois par seconde.'),
  s('2.4.1', 'keyboard', 'Load a page and press Tab once.', 'Chargez une page et appuyez une fois sur Tab.', 'A skip link appears and moves focus to the main content, or landmarks and headings let a screen reader jump there.', 'Un lien d’évitement apparaît et amène le focus au contenu principal, ou des repères et des titres permettent à un lecteur d’écran d’y aller.'),
  s('2.4.2', 'browser', 'Read the title of each page in the browser tab.', 'Lisez le titre de chaque page dans l’onglet du navigateur.', 'It names the page and differs from the titles of the other pages.', 'Il nomme la page et diffère des titres des autres pages.'),
  s('2.4.3', 'keyboard', 'Tab through the page and watch where focus goes.', 'Parcourez la page avec Tab et regardez où va le focus.', 'The order follows the meaning of the page. Opening a dialog moves focus into it, and closing it brings focus back.', 'L’ordre suit le sens de la page. Ouvrir une boîte de dialogue y amène le focus, et la fermer le ramène.'),
  s('2.4.4', 'screen-reader', 'List the links of the page with a screen reader.', 'Listez les liens de la page avec un lecteur d’écran.', 'Each link says where it goes, alone or with the sentence, list item or table cell it stands in.', 'Chaque lien dit où il mène, seul ou avec la phrase, l’élément de liste ou la cellule où il se trouve.'),
  s('2.4.5', 'browser', 'Try to reach one page of the site in two different ways.', 'Essayez d’atteindre une page du site de deux façons différentes.', 'At least two of these exist: navigation, search, a site map, links from related pages. Steps of a process are the exception.', 'Au moins deux de ces moyens existent\u00A0: navigation, recherche, plan du site, liens depuis des pages liées. Les étapes d’un processus font exception.'),
  s('2.4.6', 'browser', 'Read the headings and the labels alone, without the text around them.', 'Lisez les titres et les étiquettes seuls, sans le texte autour.', 'Each one says what its section or its field is about.', 'Chacun dit de quoi parle sa section ou son champ.'),
  s('2.4.7', 'keyboard', 'Tab through every control, in light and in dark mode.', 'Parcourez chaque commande avec Tab, en mode clair et en mode sombre.', 'It is always plain to see which control has focus.', 'On voit toujours clairement quelle commande a le focus.'),
  s('2.4.11', 'keyboard', 'Tab through the page with sticky headers, footers, banners and chat buttons in place.', 'Parcourez la page avec Tab, les en-têtes, pieds de page, bandeaux et boutons de clavardage fixes étant en place.', 'The control with focus is never fully hidden behind them.', 'La commande qui a le focus n’est jamais entièrement cachée derrière eux.'),
  s('2.5.1', 'touch-device', 'Do every task with single taps of one finger.', 'Faites chaque tâche avec de simples touchers d’un seul doigt.', 'Nothing needs a pinch, a two-finger move or a drawn path. The map has zoom buttons.', 'Rien ne demande de pincer, de bouger deux doigts ni de tracer un chemin. La carte a des boutons de zoom.'),
  s('2.5.2', 'touch-device', 'Press on a control, slide the finger off it, then lift.', 'Appuyez sur une commande, glissez le doigt en dehors, puis relâchez.', 'Nothing is triggered. Actions happen when the finger lifts, not when it lands.', 'Rien ne se déclenche. Les actions ont lieu quand le doigt se lève, pas quand il se pose.'),
  s('2.5.3', 'screen-reader', 'Compare the text shown on each button and link with the name a screen reader announces.', 'Comparez le texte affiché sur chaque bouton et chaque lien avec le nom qu’annonce un lecteur d’écran.', 'The announced name contains the visible text, so voice control users can say what they see.', 'Le nom annoncé contient le texte visible, pour que les personnes qui commandent à la voix puissent dire ce qu’elles voient.'),
  s('2.5.4', 'touch-device', 'Shake and tilt the device on each page.', 'Secouez et inclinez l’appareil sur chaque page.', 'Nothing depends on motion alone: a control does the same thing, and motion can be turned off.', 'Rien ne dépend du mouvement seul\u00A0: une commande fait la même chose, et le mouvement peut être désactivé.'),
  s('2.5.7', 'touch-device', 'Find everything that is dragged: sliders, sortable lists, the map, panels.', 'Repérez tout ce qui se fait glisser\u00A0: curseurs, listes à trier, carte, panneaux.', 'Each can also be done with single taps or clicks, such as arrow buttons.', 'Chacun peut aussi se faire par de simples touchers ou clics, par exemple avec des boutons fléchés.'),
  s('2.5.8', 'touch-device', 'Tap the small controls: icons, close buttons, map pins, links in a row.', 'Touchez les petites commandes\u00A0: icônes, boutons de fermeture, repères de carte, liens en rangée.', 'Each is at least 24 by 24 CSS pixels or has that much room around it, and the right one responds.', 'Chacune mesure au moins 24 sur 24 pixels CSS ou dispose d’autant d’espace autour, et c’est la bonne qui répond.'),
  s('3.1.1', 'screen-reader', 'Open the English and the French version of a page with a screen reader.', 'Ouvrez la version anglaise et la version française d’une page avec un lecteur d’écran.', 'Each is read with the voice of its own language.', 'Chacune est lue avec la voix de sa propre langue.'),
  s('3.1.2', 'screen-reader', 'Listen to passages in another language than the page, such as a French quotation on an English page.', 'Écoutez les passages dans une autre langue que la page, comme une citation anglaise dans une page française.', 'The voice changes for the passage. Proper names and words that have entered the language are the exception.', 'La voix change pour le passage. Les noms propres et les mots passés dans la langue font exception.'),
  s('3.2.1', 'keyboard', 'Tab onto every control without activating it.', 'Amenez le focus sur chaque commande avec Tab, sans l’activer.', 'Receiving focus opens nothing, submits nothing and moves nowhere.', 'Recevoir le focus n’ouvre rien, n’envoie rien et ne déplace rien.'),
  s('3.2.2', 'keyboard', 'Change each field, checkbox, radio button and select with the keyboard.', 'Modifiez chaque champ, case à cocher, bouton radio et liste déroulante au clavier.', 'Changing a value does not submit the form or load another page, unless the page said so beforehand.', 'Changer une valeur n’envoie pas le formulaire et ne charge pas une autre page, sauf si la page l’a annoncé avant.'),
  s('3.2.3', 'browser', 'Compare the menus and the footer on several pages.', 'Comparez les menus et le pied de page sur plusieurs pages.', 'The same links come in the same order everywhere.', 'Les mêmes liens viennent partout dans le même ordre.'),
  s('3.2.4', 'browser', 'Compare controls that do the same thing on several pages.', 'Comparez les commandes qui font la même chose sur plusieurs pages.', 'They have the same name and the same icon everywhere.', 'Elles ont partout le même nom et la même icône.'),
  s('3.2.6', 'browser', 'Find the help on several pages: contact details, a help link, a chat button.', 'Repérez l’aide sur plusieurs pages\u00A0: coordonnées, lien d’aide, bouton de clavardage.', 'It sits in the same place, relative to the rest, on every page that has it.', 'Elle se trouve au même endroit, par rapport au reste, sur chaque page qui la propose.'),
  s('3.3.1', 'screen-reader', 'Submit each form empty, then with wrong values.', 'Envoyez chaque formulaire vide, puis avec des valeurs fausses.', 'The field in error is named in text, and a screen reader announces the message.', 'Le champ en erreur est nommé en texte, et un lecteur d’écran annonce le message.'),
  s('3.3.2', 'browser', 'Read each form before filling it in.', 'Lisez chaque formulaire avant de le remplir.', 'Every field has a visible label, and the expected format is given before the person types.', 'Chaque champ a une étiquette visible, et le format attendu est donné avant la saisie.'),
  s('3.3.3', 'browser', 'Enter a wrong value in each field that has a known format.', 'Saisissez une valeur fausse dans chaque champ dont le format est connu.', 'The message says how to correct it, not only that it is wrong.', 'Le message dit comment corriger, pas seulement que c’est faux.'),
  s('3.3.4', 'browser', 'Go through each step that sends personal data, a report or a deletion.', 'Parcourez chaque étape qui envoie des données personnelles, un signalement ou une suppression.', 'The person can review and correct before sending, or undo afterwards.', 'La personne peut relire et corriger avant l’envoi, ou annuler après.'),
  s('3.3.7', 'browser', 'Fill in each process of several steps to the end.', 'Remplissez jusqu’au bout chaque processus en plusieurs étapes.', 'Nothing already given has to be typed again: it is filled in or offered to choose.', 'Rien de ce qui a déjà été donné n’est à retaper\u00A0: c’est prérempli ou proposé au choix.'),
  s('3.3.8', 'browser', 'Sign in using a password manager, and by pasting the password.', 'Connectez-vous avec un gestionnaire de mots de passe, et en collant le mot de passe.', 'Both work. No step asks to remember, transcribe or solve something without another way through.', 'Les deux marchent. Aucune étape ne demande de mémoriser, de recopier ou de résoudre quelque chose sans autre moyen.'),
  s('4.1.2', 'screen-reader', 'Operate each custom control with a screen reader: menus, tabs, toggles, the map controls.', 'Utilisez chaque commande sur mesure avec un lecteur d’écran\u00A0: menus, onglets, bascules, commandes de la carte.', 'Its name, what kind of control it is, and its state are announced, and the state is announced again when it changes.', 'Son nom, son type et son état sont annoncés, et l’état est annoncé de nouveau quand il change.'),
  s('4.1.3', 'screen-reader', 'Trigger messages that appear without a page load: search results count, saved, offline, errors.', 'Déclenchez les messages qui apparaissent sans rechargement\u00A0: nombre de résultats, enregistré, hors ligne, erreurs.', 'A screen reader announces each one without focus moving.', 'Un lecteur d’écran annonce chacun sans que le focus se déplace.'),
];

const BY_SC: ReadonlyMap<string, ManualStep> = new Map(MANUAL_STEPS.map((x) => [x.sc, x]));

export function manualStep(sc: string): ManualStep | null {
  return BY_SC.get(sc) ?? null;
}

/** Criteria of the Level A and AA list that have no step here. Empty when the two tables agree. */
export function criteriaWithoutStep(): string[] {
  return WCAG22_AA.filter((x) => !BY_SC.has(x.sc)).map((x) => x.sc);
}

/** `Do: … Look for: …` on one line. */
export function describeStep(step: ManualStep, lang: Lang): string {
  return lang === 'fr' ? `À faire\u00A0: ${step.action.fr} À observer\u00A0: ${step.look.fr}` : `Do: ${step.action.en} Look for: ${step.look.en}`;
}
