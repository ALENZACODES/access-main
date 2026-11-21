// The part of the panel that says which web addresses the App's code names and which network requests it can
// make. The rows come from addressRegister.ts, which the CI scan keeps in step with the source. Only the host
// is shown, never a full address. A request whose destination the code does not fix is shown as unknown.

import type { AddressRegisterView } from "./addressView";
import type { CallDestination } from "./addressRegister";
import type { Locale } from "./copyLint";
import { button, esc } from "./html";

export const ADDRESS_STRINGS = {
  en: {
    heading: "Web addresses and network requests in the App",
    note: "These lists were read from the App’s source, not from your device. The App has no account, no analytics and no upload. Whether your browser or the site that serves the App sends anything else was not checked.",
    linksHeading: "Addresses named in the App",
    callsHeading: "Places where the App makes network requests",
    kinds: { link: "A page you can open", identifier: "A name inside a data format" },
    destinations: { "same-site": "The same site", UNKNOWN: "Unknown. The address comes from data the code does not fix." } as Record<CallDestination, string>,
    columns: { host: "Address", kind: "What it is", what: "What it is for", where: "Where it goes", count: "Places in the code" },
    summary: (links: number, calls: number): string => `${links} ${links === 1 ? "address" : "addresses"} named. ${calls} ${calls === 1 ? "place makes" : "places make"} network requests.`,
    none: "None found.",
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    caption: { links: "Addresses named in the App", calls: "Places where the App makes network requests" },
  },
  fr: {
    heading: "Adresses web et requêtes réseau dans l’App",
    note: "Ces listes ont été lues dans le code source de l’App, pas sur votre appareil. L’App n’a ni compte, ni analytique, ni envoi de données. Nous n’avons pas contrôlé si votre navigateur ou le site qui sert l’App envoie autre chose.",
    linksHeading: "Adresses nommées dans l’App",
    callsHeading: "Endroits où l’App fait des requêtes réseau",
    kinds: { link: "Une page que vous pouvez ouvrir", identifier: "Un nom dans un format de données" },
    destinations: { "same-site": "Le même site", UNKNOWN: "Inconnu. L’adresse vient de données que le code ne fixe pas." } as Record<CallDestination, string>,
    columns: { host: "Adresse", kind: "De quoi il s’agit", what: "À quoi cela sert", where: "Où cela va", count: "Endroits dans le code" },
    summary: (links: number, calls: number): string => `${links} ${links > 1 ? "adresses nommées" : "adresse nommée"}. ${calls} ${calls > 1 ? "endroits font" : "endroit fait"} des requêtes réseau.`,
    none: "Aucun trouvé.",
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    caption: { links: "Adresses nommées dans l’App", calls: "Endroits où l’App fait des requêtes réseau" },
  },
} as const;

const cell = (label: string, text: string): string => `<span data-label="${esc(label)}">${esc(text)}</span>`;

function table(caption: string, head: readonly string[], rows: readonly (readonly string[])[]): string {
  const th = head.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const tr = rows.map(([first = "", ...rest]) => `<tr><th scope="row">${cell(head[0] ?? "", first)}</th>${rest.map((t, i) => `<td>${cell(head[i + 1] ?? "", t)}</td>`).join("")}</tr>`).join("");
  return `<table><caption>${esc(caption)}</caption><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/** Empty when both lists are empty, so the section only appears when it has something to say. */
export function renderAddressesHtml(locale: Locale, v: AddressRegisterView): string {
  if (v.addresses.length === 0 && v.calls.length === 0) return "";
  const s = ADDRESS_STRINGS[locale];
  const links =
    v.addresses.length === 0
      ? `<h4>${esc(s.linksHeading)}</h4><p>${esc(s.none)}</p>`
      : `<h4>${esc(s.linksHeading)}</h4>` + table(s.caption.links, [s.columns.host, s.columns.kind, s.columns.what], v.addresses.map((a) => [a.host, s.kinds[a.kind], a.holds[locale]]));
  const calls =
    v.calls.length === 0
      ? `<h4>${esc(s.callsHeading)}</h4><p>${esc(s.none)}</p>`
      : `<h4>${esc(s.callsHeading)}</h4>` + table(s.caption.calls, [s.columns.what, s.columns.where, s.columns.count], v.calls.map((c) => [c.holds[locale], s.destinations[c.destination], String(c.calls)]));
  return (
    `<div data-privacy-addresses role="group" aria-labelledby="privacy-addresses-title"><h3 id="privacy-addresses-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(v.addresses.length, v.calls.length))}</p>${links}${calls}<div>${button("export-addresses-csv", s.csvButton)}${button("export-addresses-text", s.textButton)}</div></div>`
  );
}
