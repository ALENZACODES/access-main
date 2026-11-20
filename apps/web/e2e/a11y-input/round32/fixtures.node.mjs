/** Synthetic fixtures only: no real-world accessibility claims. */
export const TODAY = "2026-11-19";
export const copy = (en = "Step-free entrance", fr = "Entrée sans marches") => ({ en, fr });
export function control(changes = {}) {
  return {
    id: "entry-button", group: "entry", label: copy(), disabled: false,
    hidden: false, inert: false, tabIndex: 0, role: "button", ...changes,
  };
}
export function controls() {
  return [
    control({ id: "first", group: "main", label: copy("First", "Premier") }),
    control({ id: "second", group: "main", label: copy("Second", "Deuxième") }),
    control({ id: "third", group: "footer", label: copy("Third", "Troisième") }),
  ];
}
export function node(changes = {}) {
  return {
    id: "start", role: "button", focusable: true, hidden: false,
    inert: false, tabIndex: 0, name: "Open", label: "Open", text: "Open",
    labelledBy: [], describedBy: [], controls: [], owns: [], activeDescendant: [],
    live: "off", ...changes,
  };
}
export function semanticTree() {
  return [
    node({ id: "main", role: "main", focusable: false, tabIndex: -1, name: "Main" }),
    node({ id: "heading", role: "heading", focusable: false, tabIndex: -1, name: "Introduction", level: 1 }),
    node({ id: "start", role: "button", name: "Begin" }),
    node({ id: "status", role: "status", focusable: false, tabIndex: -1, live: "polite", name: "Ready" }),
  ];
}
export function message(changes = {}) {
  return {
    id: "status-one", role: "status", live: "polite", atomic: true,
    relevant: "text", copy: copy("Ready", "Prêt"), sequence: 1,
    hidden: false, inert: false, action: "ADVANCE", ...changes,
  };
}
export function events() {
  return [
    message({ id: "one", sequence: 1 }),
    message({ id: "two", sequence: 2, copy: copy("Next", "Suivant") }),
    message({ id: "three", sequence: 3, copy: copy("Complete", "Terminé") }),
  ];
}
export function offline(changes = {}) {
  return {
    id: "record-one", cache: "CACHED", tier: "PRIMARY", access: "SUPPORTED",
    publisher: "Example public dataset", licence: "CC BY 4.0", collectedOn: TODAY,
    cacheId: "cache-one", ...changes,
  };
}
export function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}
export function codes(findings) {
  return findings.map((item) => item.code);
}
