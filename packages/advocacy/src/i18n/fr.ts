import type { MessageKey } from "./en.ts";

/** French catalog. U+00A0 precedes : ; ? ! as French typography requires. */
export const fr: Record<MessageKey, string> = {
  "app.title": "Dossier de preuves pour la défense des droits",
  "app.subtitle": "Examinez les cellules agrégées avant qu’elles ne quittent cet appareil.",
  "lang.label": "Langue",
  "lang.en": "English",
  "lang.fr": "Français",
  "demo.banner":
    "Données de démonstration seulement. Ces cellules proviennent d’enregistrements synthétiques étiquetés, définis par ce module. Ce ne sont pas des statistiques réelles ni des comptes principaux, et aucun total provincial n’est affiché.",
  "meta.asOf": "En date du {date}",
  "meta.threshold": "Seuil des petites cellules\u00a0: les comptes inférieurs à {k} sont supprimés.",
  "summary.heading": "Sommaire",
  "summary.published": "Cellules publiées\u00a0: {n}",
  "summary.suppressed": "Cellules supprimées\u00a0: {n}",
  "summary.unknown": "Cellules à compte inconnu\u00a0: {n}",
  "published.heading": "Cellules publiées",
  "published.empty": "Aucune cellule ne respecte les règles de publication.",
  "suppressed.heading": "Cellules supprimées",
  "suppressed.intro":
    "Ces cellules ont été supprimées pour protéger les petites communautés. Le compte est retenu. Il n’est ni arrondi ni estimé.",
  "suppressed.empty": "Aucune cellule n’a été supprimée.",
  "suppressed.item": "Supprimée. Compte retenu.",
  "unknown.heading": "Comptes inconnus",
  "unknown.intro": "Aucun compte n’est disponible pour ces cellules. Inconnu ne veut pas dire zéro.",
  "unknown.empty": "Aucune cellule n’a de compte inconnu.",
  "unknown.item": "Compte inconnu.",
  "field.category": "Catégorie",
  "field.area": "Secteur",
  "field.period": "Période",
  "field.count": "Compte",
  "field.status": "État",
  "field.dataStatus": "Statut des données",
  "field.headline": "Compte principal",
  "headline.yes": "Compte dans les totaux principaux",
  "headline.no": "Pas un compte principal\u00a0: {reasons}",
  "exclusion.example_record": "enregistrement de démonstration",
  "exclusion.fixture_record": "enregistrement de test",
  "exclusion.undated": "sans date",
  "exclusion.future_dated": "date postérieure à la date de référence",
  "exclusion.too_old": "de plus de 730 jours",
  "exclusion.status_window": "observation d’état de plus de 30 jours",
  "category.parking": "Stationnement",
  "category.outage": "Panne",
  "category.unknown": "Catégorie inconnue",
  "area.unknown": "Secteur inconnu",
  "period.unknown": "Période inconnue",
  "tier.0": "Niveau 0\u00a0: import de données ouvertes",
  "tier.1": "Niveau 1\u00a0: déclaration d’un exploitant",
  "tier.E": "Niveau E\u00a0: contrôle au bureau d’une page officielle",
  "label.PROTOTYPE-UNVERIFIED": "Étiquette d’échantillon de prototype",
  "label.SEEDED-OPEN-DATA": "Données ouvertes préchargées",
  "export.button": "Exporter le dossier",
  "export.done": "Dossier de preuves exporté sous {file}.",
  "method.heading": "Comment les comptes sont traités",
  "rules.heading": "Règles de suppression",
  "footer.note":
    "Prototype. Les libellés de statut des données suivent les niveaux du prototype. Rien de ce qui est affiché ici ne porte une étiquette de confirmation.",
  "pack.method.1":
    "Les comptes sont des sommes d’observations de source regroupées par catégorie, secteur grossier et période. Ils sont calculés sur cet appareil à partir des enregistrements fournis.",
  "pack.method.2":
    "Une cellule dont le compte est inférieur à {k} est supprimée. Une cellule d’une petite communauté, ou d’une communauté de taille inconnue, est supprimée à moins que son compte atteigne au moins {limit}. Les cellules supprimées sont listées sans compte. Rien n’est arrondi ni estimé.",
  "pack.method.3":
    "Inconnu reste inconnu. Une cellule contenant une contribution inconnue est publiée comme inconnue, jamais comme zéro.",
  "pack.method.4":
    "Aucun total n’est imprimé entre les cellules, ni aucun total provincial, de sorte qu’une cellule supprimée ne peut pas être retrouvée par soustraction.",
  "pack.method.5":
    "Les enregistrements marqués comme démonstration ou exemple ne sont pas des comptes principaux. Seuls les niveaux de prototype 0, 1 et E et les libellés PROTOTYPE-UNVERIFIED et SEEDED-OPEN-DATA sont acceptés. Rien dans ce dossier ne porte une étiquette de confirmation.",
  "pack.counting":
    "L’admissibilité aux comptes principaux suit les règles de décompte des pièces de packages/schema/docs/counting-rules.md. Les enregistrements dont example est à true ou dont l’identifiant est celui d’un jeu de test, les valeurs de plus de 730 jours, les observations d’état hors de la fenêtre de 30 jours et les valeurs sans date ne sont pas comptés. Les valeurs inconnues ne sont pas comptées.",
  "pack.rule.small_cell_threshold": "Les comptes inférieurs à {k} sont supprimés.",
  "pack.rule.small_community_minimum": "Dans une petite communauté, un compte inférieur à {limit} est supprimé.",
  "pack.rule.community_size_unknown_minimum":
    "Lorsque la taille de la communauté est inconnue, un compte inférieur à {limit} est supprimé.",
  "pack.rule.no_rounding": "Les comptes supprimés sont retenus. Ils ne sont ni arrondis ni estimés.",
  "pack.rule.no_totals": "Aucun total entre les cellules n’est imprimé.",
};
