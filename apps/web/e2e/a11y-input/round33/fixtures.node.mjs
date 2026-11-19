/** Synthetic, non-sensitive examples used only by this suite. */
export const DAY = '2026-11-19';
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const bilingual = (en = 'Open options', fr = 'Ouvrir les options') => ({ en, fr });
export function source(overrides = {}) { return { id: 'source-one', publisher: 'Open public data', url: 'https://example.org/evidence', licence: 'CC BY 4.0', tier: 'PRIMARY', collectedOn: '2026-11-18', ...overrides }; }
export function control(overrides = {}) { return { id: 'first', role: 'button', name: bilingual(), enabled: true, visible: true, focusable: true, tabIndex: 0, targetWidth: 44, targetHeight: 44, ...overrides }; }
export function controls() { return [control(), control({ id: 'second', name: bilingual('Second action', 'Deuxième action'), group: 'group-one' }), control({ id: 'third', name: bilingual('Third action', 'Troisième action'), group: 'group-one' })]; }
export function journey(overrides = {}) { return { id: 'sample-journey', title: bilingual('Accessible journey', 'Parcours accessible'), controls: controls(), state: 'READY', evidence: source(), cache: { state: 'PRESENT', path: '/offline/route/one.json' }, ...overrides }; }
export function observation(id, overrides = {}) { return { id, visible: true, indicator: true, occluded: false, targetWidth: 44, targetHeight: 44, ...overrides }; }
export function focusWalk() { return controls().map((item) => observation(item.id)); }
export function announcement(overrides = {}) { return { id: 'status-one', kind: 'status', politeness: 'polite', atomic: true, sequence: 1, day: DAY, message: bilingual('Ready for input', 'Prêt pour la saisie'), targetId: 'first', state: 'READY', evidenceState: 'PRIMARY', ...overrides }; }
export function announcements() { return [announcement(), announcement({ id: 'status-two', sequence: 2, targetId: 'second', message: bilingual('Next control', 'Contrôle suivant') })]; }
export function live(overrides = {}) { return { id: 'live-one', role: 'status', live: 'polite', atomic: true, hidden: false, busy: false, messageChanged: false, content: 'Ready', ...overrides }; }
