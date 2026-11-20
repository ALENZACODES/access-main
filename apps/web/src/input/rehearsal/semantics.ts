import { type Finding, issue, sortFindings, validId, validText } from './model.ts';

/** Read-only snapshots preserve what the document declared, not assumptions about speech. */
export interface SemanticNode {
  readonly id: string;
  readonly tag: string;
  readonly role: string | null;
  readonly text: string;
  readonly label: string | null;
  readonly labelledBy: readonly string[];
  readonly describedBy: readonly string[];
  readonly controls: readonly string[];
  readonly tabIndex: number;
  readonly disabled: boolean;
  readonly hidden: boolean;
  readonly inert: boolean;
  readonly width: number;
  readonly height: number;
  readonly parent: string | null;
}
export interface SemanticSnapshot {
  readonly lang: string;
  readonly title: string;
  readonly nodes: readonly SemanticNode[];
  readonly focusOrder: readonly string[];
  readonly mainCount: number;
  readonly statusMessages: readonly string[];
}
export interface NameResolution { readonly id: string; readonly name: string; readonly described: string; readonly issues: readonly Finding[] }
const OPERABLE = new Set(['button','link','switch','checkbox','radio','tab','option','menuitem','textbox','combobox']);
const STRUCTURAL = new Set(['main','navigation','banner','contentinfo','complementary','region','dialog','alertdialog']);
const EMBEDDED = new Set(['button','input','select','textarea','a','summary']);
const IDREF = ['labelledBy','describedBy','controls'] as const;
export function nodeMap(nodes: readonly SemanticNode[]): Map<string, SemanticNode[]> {
  const map = new Map<string, SemanticNode[]>();
  for (const node of nodes) {
    const values = map.get(node.id) ?? [];
    values.push(node);
    map.set(node.id, values);
  }
  return map;
}
export function referencesFor(node: SemanticNode): readonly string[] {
  return [...node.labelledBy, ...node.describedBy, ...node.controls];
}
export function resolveName(node: SemanticNode, all: readonly SemanticNode[]): NameResolution {
  const findings: Finding[] = [];
  const map = nodeMap(all);
  let name = node.label?.trim() ?? '';
  if (!name && node.labelledBy.length) {
    const words: string[] = [];
    for (const id of node.labelledBy) {
      const matches = map.get(id) ?? [];
      if (matches.length !== 1) findings.push(issue(matches.length ? 'semantics.ambiguous-label' : 'semantics.missing-label', `${node.id}.labelledBy`));
      else if (validText(matches[0].text)) words.push(matches[0].text.trim());
    }
    name = words.join(' ');
  }
  if (!name) name = node.text.trim();
  const described: string[] = [];
  for (const id of node.describedBy) {
    const matches = map.get(id) ?? [];
    if (matches.length !== 1) findings.push(issue(matches.length ? 'semantics.ambiguous-description' : 'semantics.missing-description', `${node.id}.describedBy`));
    else if (validText(matches[0].text)) described.push(matches[0].text.trim());
  }
  return { id: node.id, name, described: described.join(' '), issues: findings };
}
export function auditLandmarks(snapshot: SemanticSnapshot): Finding[] {
  const issues: Finding[] = [];
  if (!['en','fr'].includes(snapshot.lang)) issues.push(issue('document.language', 'document.lang'));
  if (!validText(snapshot.title)) issues.push(issue('document.title', 'document.title'));
  if (snapshot.mainCount !== 1) issues.push(issue('document.main-count', 'document.main'));
  const headings = snapshot.nodes.filter(n => n.tag === 'h1' && !n.hidden);
  if (headings.length !== 1) issues.push(issue('document.h1-count', 'document.headings'));
  if (snapshot.nodes.some(n => n.role === 'main') && snapshot.mainCount > 1) issues.push(issue('document.multiple-main', 'document.main'));
  return issues;
}
export function auditIds(nodes: readonly SemanticNode[]): Finding[] {
  const issues: Finding[] = [];
  const map = nodeMap(nodes);
  for (const [id, matches] of map) {
    if (!validId(id)) issues.push(issue('semantics.invalid-id', `nodes.${id}`));
    if (matches.length > 1) issues.push(issue('semantics.duplicate-id', `nodes.${id}`));
  }
  nodes.forEach((node, index) => {
    for (const key of IDREF) {
      for (const ref of node[key]) {
        const matches = map.get(ref) ?? [];
        if (!matches.length) issues.push(issue('semantics.dangling-reference', `nodes[${index}].${key}`));
        else if (matches.length > 1) issues.push(issue('semantics.ambiguous-reference', `nodes[${index}].${key}`));
      }
    }
  });
  return issues;
}
export function auditOperable(nodes: readonly SemanticNode[]): Finding[] {
  const findings: Finding[] = [];
  nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    const role = node.role ?? '';
    const actionable = OPERABLE.has(role) || EMBEDDED.has(node.tag);
    if (!actionable) return;
    if (node.disabled) return;
    if (node.hidden || node.inert) findings.push(issue('operable.hidden-focusable', path));
    if (node.tabIndex > 0) findings.push(issue('operable.positive-tabindex', path));
    if (node.tabIndex < 0 && !['tab','option','menuitem'].includes(role)) findings.push(issue('operable.out-of-order', path, 'review'));
    if (!Number.isFinite(node.width) || !Number.isFinite(node.height) || node.width < 44 || node.height < 44) findings.push(issue('operable.target-size', path));
    const named = resolveName(node, nodes);
    if (!validText(named.name)) findings.push(issue('operable.unnamed', path));
    findings.push(...named.issues);
  });
  return findings;
}
export function auditFocusOrder(snapshot: SemanticSnapshot): Finding[] {
  const issues: Finding[] = [];
  const map = nodeMap(snapshot.nodes);
  const seen = new Set<string>();
  snapshot.focusOrder.forEach((id, index) => {
    const path = `focusOrder[${index}]`;
    if (seen.has(id)) issues.push(issue('focus.duplicate-stop', path));
    seen.add(id);
    const matches = map.get(id) ?? [];
    if (matches.length !== 1) { issues.push(issue('focus.missing-stop', path)); return; }
    const node = matches[0];
    if (node.hidden || node.inert || node.disabled) issues.push(issue('focus.unavailable-stop', path));
    if (node.tabIndex < 0) issues.push(issue('focus.negative-tabindex', path));
  });
  return issues;
}
export function auditLiveText(snapshot: SemanticSnapshot): Finding[] {
  const issues: Finding[] = [];
  snapshot.statusMessages.forEach((message, index) => {
    if (!validText(message, 800)) issues.push(issue('live.empty-or-long', `statusMessages[${index}]`));
  });
  return issues;
}
export function auditSemanticSnapshot(snapshot: SemanticSnapshot): Finding[] {
  return sortFindings([
    ...auditLandmarks(snapshot),
    ...auditIds(snapshot.nodes),
    ...auditOperable(snapshot.nodes),
    ...auditFocusOrder(snapshot),
    ...auditLiveText(snapshot),
  ]);
}
export function compareSemantics(before: SemanticSnapshot, after: SemanticSnapshot): Finding[] {
  const findings: Finding[] = [];
  const old = nodeMap(before.nodes);
  const now = nodeMap(after.nodes);
  for (const [id, nodes] of old) {
    const next = now.get(id);
    if (!next) { findings.push(issue('semantics.removed', `nodes.${id}`, 'review')); continue; }
    if (nodes.length !== 1 || next.length !== 1) continue;
    const first = nodes[0]; const second = next[0];
    if (first.role !== second.role) findings.push(issue('semantics.role-changed', `nodes.${id}`, 'review'));
    if (first.label !== second.label) findings.push(issue('semantics.name-changed', `nodes.${id}`, 'review'));
    if (!first.disabled && second.disabled) findings.push(issue('semantics.new-disabled', `nodes.${id}`, 'review'));
    if (!first.hidden && second.hidden) findings.push(issue('semantics.new-hidden', `nodes.${id}`, 'review'));
  }
  for (const id of now.keys()) if (!old.has(id)) findings.push(issue('semantics.added', `nodes.${id}`, 'review'));
  return sortFindings(findings);
}
export function semanticSummary(snapshot: SemanticSnapshot): { nodes: number; controls: number; landmarks: number; focusStops: number; issues: number } {
  return {
    nodes: snapshot.nodes.length,
    controls: snapshot.nodes.filter(n => OPERABLE.has(n.role ?? '') || EMBEDDED.has(n.tag)).length,
    landmarks: snapshot.nodes.filter(n => STRUCTURAL.has(n.role ?? '')).length,
    focusStops: snapshot.focusOrder.length,
    issues: auditSemanticSnapshot(snapshot).length,
  };
}
