/** Cross-input and EN/FR task equivalence. An absent capture is UNKNOWN, not a failure. */
import { INPUTS, LANGUAGES, TASKS, NETWORKS, fingerprint } from './input-continuity-contract.mjs';
import { analyze, aggregate } from './input-continuity-analysis.mjs';

export const CORE_TASKS = Object.freeze(['search', 'review-evidence', 'plan-journey', 'save-offline', 'resume-task']);
export const CORE_INPUTS = Object.freeze(['keyboard', 'switch', 'screen-reader', 'touch']);
export const parityKey = (task, network, input) => `${task}|${network}|${input}`;
export const groupKey = (task, network) => `${task}|${network}`;
export function modeSummaries(reviews) {
 const groups = new Map();
 for (const review of reviews) {
  const key = [review.task, review.network, review.input, review.language].join('|');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(review.status);
 }
 return groups;
}
export function parityReview(document, { today, tasks = CORE_TASKS, inputs = CORE_INPUTS, networks = ['offline'] } = {}) {
 const result = analyze(document, { today });
 if (!result.ok) return { ok: false, issues: result.issues, records: [], summary: null };
 if (!Array.isArray(tasks) || !Array.isArray(inputs) || !Array.isArray(networks)) return { ok: false, issues: [{ code: 'PARITY_SCOPE', path: '/scope' }], records: [], summary: null };
 const uniqueTasks = [...new Set(tasks)], uniqueInputs = [...new Set(inputs)], uniqueNetworks = [...new Set(networks)];
 if ( uniqueTasks.length > TASKS.length || uniqueInputs.length > INPUTS.length || uniqueNetworks.length > NETWORKS.length || uniqueTasks.some(x => !TASKS.includes(x)) || uniqueInputs.some(x => !INPUTS.includes(x)) || uniqueNetworks.some(x => !NETWORKS.includes(x))) {
  return { ok: false, issues: [{ code: 'PARITY_SCOPE', path: '/scope' }], records: [], summary: null };
 }
 const data = modeSummaries(result.reviews);
 const records = [];
 for (const task of uniqueTasks) for (const network of uniqueNetworks) for (const input of uniqueInputs) {
  const observed = Object.fromEntries(LANGUAGES.map(language => {
   const states = data.get(`${task}|${network}|${input}|${language}`) ?? [];
   return [language, { state: aggregate(states), captured: states.length, evidence: states.length > 0 }];
  }));
  const states = LANGUAGES.map(language => observed[language].state);
  const parity = states[0] === states[1] && states[0] !== 'UNKNOWN' ? 'MATCH' : states[0] === 'UNKNOWN' || states[1] === 'UNKNOWN' ? 'UNKNOWN' : 'DIFFER';
  const priority = states.includes('FAIL') ? 'block' : parity === 'MATCH' ? 'information' : 'review';
  records.push({ task, network, input, key: parityKey(task, network, input), languages: observed, parity, priority });
 }
 records.sort((a, b) => a.key.localeCompare(b.key));
 return { ok: true, issues: [], records, summary: { total: records.length, matched: records.filter(x => x.parity === 'MATCH').length, different: records.filter(x => x.parity === 'DIFFER').length, unknown: records.filter(x => x.parity === 'UNKNOWN').length, blocking: records.filter(x => x.priority === 'block').length, digest: fingerprint(records) } };
}
export function criticalTaskGaps(document, { today, tasks = CORE_TASKS, inputs = CORE_INPUTS, networks = ['offline'] } = {}) {
 const result = parityReview(document, { today, tasks, inputs, networks });
 if (!result.ok) return { ok: false, issues: result.issues, gaps: [] };
 const gaps = result.records.filter(r => r.parity !== 'MATCH' || r.priority === 'block').map(r => ({ key: r.key, task: r.task, network: r.network, input: r.input, en: r.languages.en.state, fr: r.languages.fr.state, parity: r.parity, priority: r.priority, state: 'UNKNOWN' }));
 return { ok: true, issues: [], gaps };
}
export function inputEquivalence(document, { today, task, language, network = 'offline', inputs = CORE_INPUTS } = {}) {
 const result = analyze(document, { today });
 if (!result.ok) return { ok: false, issues: result.issues, states: {}, status: 'UNKNOWN' };
 if (!TASKS.includes(task) || !LANGUAGES.includes(language) || !NETWORKS.includes(network) || !Array.isArray(inputs) || inputs.some(x => !INPUTS.includes(x))) return { ok: false, issues: [{ code: 'INPUT_SCOPE', path: '/scope' }], states: {}, status: 'UNKNOWN' };
 const states = Object.fromEntries([...new Set(inputs)].map(input => [input, aggregate(result.reviews.filter(x => x.task === task && x.language === language && x.network === network && x.input === input).map(x => x.status))]));
 return { ok: true, issues: [], states, status: aggregate(Object.values(states)), absent: Object.entries(states).filter(([, state]) => state === 'UNKNOWN').map(([input]) => input) };
}
