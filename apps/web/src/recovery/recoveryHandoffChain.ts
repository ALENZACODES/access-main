/** Offline-only, manually edited chain of recovery handoffs. A handoff never changes installed pack readiness. */
export type ChainLocale = "en" | "fr";
export type ChainState = "UNKNOWN" | "observed" | "interrupted" | "missing" | "disputed";
export type ChainTier = "UNKNOWN" | "self-reported" | "documented" | "reviewed";
export type ChainPhase = "draft" | "review" | "closed";
export type ChainRole = "origin" | "intermediate" | "recipient";
export type ChainAction = "noted" | "acknowledged" | "disputed" | "review-requested" | "closed" | "reopened";
export type ChainIssue = "schema" | "limit" | "identity" | "source" | "date" | "timestamp" | "text" | "duplicate" | "reference" | "phase" | "conflict" | "cycle" | "sequence";
export const CHAIN_STATES: readonly ChainState[] = ["UNKNOWN", "observed", "interrupted", "missing", "disputed"];
export const CHAIN_TIERS: readonly ChainTier[] = ["UNKNOWN", "self-reported", "documented", "reviewed"];
export const CHAIN_PHASES: readonly ChainPhase[] = ["draft", "review", "closed"];
export const CHAIN_ROLES: readonly ChainRole[] = ["origin", "intermediate", "recipient"];
export const CHAIN_ACTIONS: readonly ChainAction[] = ["noted", "acknowledged", "disputed", "review-requested", "closed", "reopened"];
export const CHAIN_LIMITS = Object.freeze({ bytes: 640_000, nodes: 600, links: 1200, events: 2800, text: 600, id: 96, references: 800 });

export interface ChainSource {
  readonly name: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: ChainTier;
  readonly reference: string;
}
export interface ChainNode {
  readonly id: string;
  readonly packId: string;
  readonly role: ChainRole;
  readonly title: string;
  readonly state: ChainState;
  readonly phase: ChainPhase;
  readonly recordedAt: string;
  readonly note: string;
  readonly source: ChainSource;
}
export interface ChainLink {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly state: ChainState;
  readonly note: string;
  readonly recordedAt: string;
  readonly source: ChainSource;
}
export interface ChainEvent {
  readonly id: string;
  readonly nodeId: string;
  readonly action: ChainAction;
  readonly at: string;
  readonly note: string;
  readonly source: ChainSource;
}
export interface ChainDocument {
  readonly schema: "the-app.recovery-handoff-chain.v1";
  readonly nodes: readonly ChainNode[];
  readonly links: readonly ChainLink[];
  readonly events: readonly ChainEvent[];
}
export type ChainResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: ChainIssue };
export interface ChainSummary {
  readonly nodes: number;
  readonly links: number;
  readonly events: number;
  readonly packs: number;
  readonly unknown: number;
  readonly disputed: number;
  readonly unresolved: number;
  readonly orphanNodes: number;
  readonly contentReady: false;
}
export interface ChainMergePreview {
  readonly nodesAdded: number;
  readonly linksAdded: number;
  readonly eventsAdded: number;
  readonly nodeConflicts: number;
  readonly linkConflicts: number;
  readonly eventConflicts: number;
  readonly contentReady: false;
}
export interface ChainQuery {
  readonly packId?: string;
  readonly role?: ChainRole;
  readonly state?: ChainState;
  readonly phase?: ChainPhase;
  readonly text?: string;
}

const success = <T>(value: T): ChainResult<T> => ({ ok: true, value });
const failure = <T>(issue: ChainIssue): ChainResult<T> => ({ ok: false, issue });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isChoice = <T extends string>(v: unknown, choices: readonly T[]): v is T => typeof v === "string" && choices.includes(v as T);
const legalId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= CHAIN_LIMITS.id && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(v);
const illegalText = (v: string): boolean => [...v].some((c) => {
  const code = c.charCodeAt(0);
  return code < 32 && code !== 9 && code !== 10 && code !== 13;
});
const legalText = (v: unknown, limit: number = CHAIN_LIMITS.text): v is string => typeof v === "string" && v.length <= limit && !illegalText(v);
const legalDay = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(v)) return false;
  const date = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === v;
};
const legalInstant = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(v)) return false;
  const date = new Date(v);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(v.replace(/Z$/u, ""));
};
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && Object.keys(value).every((k) => keys.includes(k));
const SOURCE_KEYS = ["name", "licence", "retrievedOn", "tier", "reference"];
const NODE_KEYS = ["id", "packId", "role", "title", "state", "phase", "recordedAt", "note", "source"];
const LINK_KEYS = ["id", "fromId", "toId", "state", "note", "recordedAt", "source"];
const EVENT_KEYS = ["id", "nodeId", "action", "at", "note", "source"];

export const emptyChain = (): ChainDocument => ({ schema: "the-app.recovery-handoff-chain.v1", nodes: [], links: [], events: [] });

export function checkChainSource(value: unknown): ChainResult<ChainSource> {
  if (!isObject(value) || !hasExactKeys(value, SOURCE_KEYS)) return failure("source");
  if (!legalText(value.name, 200) || value.name.trim() === "") return failure("source");
  if (!legalText(value.licence, 200) || value.licence.trim() === "") return failure("source");
  if (!legalDay(value.retrievedOn)) return failure("date");
  if (!isChoice(value.tier, CHAIN_TIERS)) return failure("source");
  if (!legalText(value.reference, CHAIN_LIMITS.references) || value.reference.trim() === "") return failure("source");
  return success(value as unknown as ChainSource);
}
export function checkChainNode(value: unknown): ChainResult<ChainNode> {
  if (!isObject(value) || !hasExactKeys(value, NODE_KEYS)) return failure("schema");
  if (!legalId(value.id) || !legalId(value.packId)) return failure("identity");
  if (!isChoice(value.role, CHAIN_ROLES) || !isChoice(value.state, CHAIN_STATES) || !isChoice(value.phase, CHAIN_PHASES)) return failure("schema");
  if (!legalText(value.title, 200) || !value.title.trim() || !legalText(value.note)) return failure("text");
  if (!legalInstant(value.recordedAt)) return failure("timestamp");
  const source = checkChainSource(value.source);
  if (!source.ok) return failure(source.issue);
  if (source.value.retrievedOn > value.recordedAt.slice(0, 10)) return failure("date");
  return success(value as unknown as ChainNode);
}
export function checkChainLink(value: unknown): ChainResult<ChainLink> {
  if (!isObject(value) || !hasExactKeys(value, LINK_KEYS)) return failure("schema");
  if (!legalId(value.id) || !legalId(value.fromId) || !legalId(value.toId)) return failure("identity");
  if (value.fromId === value.toId) return failure("cycle");
  if (!isChoice(value.state, CHAIN_STATES) || !legalText(value.note)) return failure("text");
  if (!legalInstant(value.recordedAt)) return failure("timestamp");
  const source = checkChainSource(value.source);
  if (!source.ok) return failure(source.issue);
  if (source.value.retrievedOn > value.recordedAt.slice(0, 10)) return failure("date");
  return success(value as unknown as ChainLink);
}
export function checkChainEvent(value: unknown): ChainResult<ChainEvent> {
  if (!isObject(value) || !hasExactKeys(value, EVENT_KEYS)) return failure("schema");
  if (!legalId(value.id) || !legalId(value.nodeId)) return failure("identity");
  if (!isChoice(value.action, CHAIN_ACTIONS) || !legalText(value.note)) return failure("text");
  if (!legalInstant(value.at)) return failure("timestamp");
  const source = checkChainSource(value.source);
  if (!source.ok) return failure(source.issue);
  if (source.value.retrievedOn > value.at.slice(0, 10)) return failure("date");
  return success(value as unknown as ChainEvent);
}
export function chainHasCycle(nodes: readonly ChainNode[], links: readonly ChainLink[]): boolean {
  const adj = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const link of links) {
    const list = adj.get(link.fromId);
    if (list) list.push(link.toId);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const next of adj.get(nodeId) ?? []) if (visit(next)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }
  return nodes.some((n) => visit(n.id));
}
export function checkChainDocument(value: unknown): ChainResult<ChainDocument> {
  if (!isObject(value) || !hasExactKeys(value, ["schema", "nodes", "links", "events"])) return failure("schema");
  if (value.schema !== "the-app.recovery-handoff-chain.v1") return failure("schema");
  if (!Array.isArray(value.nodes) || !Array.isArray(value.links) || !Array.isArray(value.events)) return failure("schema");
  if (value.nodes.length > CHAIN_LIMITS.nodes || value.links.length > CHAIN_LIMITS.links || value.events.length > CHAIN_LIMITS.events) return failure("limit");
  const nodeIds = new Set<string>();
  const linkIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const item of value.nodes) {
    const checked = checkChainNode(item);
    if (!checked.ok) return failure(checked.issue);
    if (nodeIds.has(checked.value.id)) return failure("duplicate");
    nodeIds.add(checked.value.id);
  }
  const byNode = new Map((value.nodes as ChainNode[]).map((node) => [node.id, node]));
  for (const item of value.links) {
    const checked = checkChainLink(item);
    if (!checked.ok) return failure(checked.issue);
    if (linkIds.has(checked.value.id)) return failure("duplicate");
    linkIds.add(checked.value.id);
    const from = byNode.get(checked.value.fromId);
    const to = byNode.get(checked.value.toId);
    if (!from || !to || from.packId !== to.packId) return failure("reference");
    if (checked.value.recordedAt < from.recordedAt || checked.value.recordedAt < to.recordedAt) return failure("sequence");
  }
  for (const item of value.events) {
    const checked = checkChainEvent(item);
    if (!checked.ok) return failure(checked.issue);
    if (eventIds.has(checked.value.id)) return failure("duplicate");
    eventIds.add(checked.value.id);
    const node = byNode.get(checked.value.nodeId);
    if (!node) return failure("reference");
    if (checked.value.at < node.recordedAt) return failure("sequence");
  }
  if (chainHasCycle(value.nodes as ChainNode[], value.links as ChainLink[])) return failure("cycle");
  return success(value as unknown as ChainDocument);
}
export function nextChainId(document: ChainDocument, type: "node" | "link" | "event"): string {
  const all = type === "node" ? document.nodes : type === "link" ? document.links : document.events;
  const taken = new Set(all.map((item) => item.id));
  let counter = 1;
  while (taken.has(`${type}-${counter}`)) counter += 1;
  return `${type}-${counter}`;
}
export function appendChainNode(document: ChainDocument, node: ChainNode): ChainResult<ChainDocument> {
  const checked = checkChainNode(node);
  if (!checked.ok) return failure(checked.issue);
  return checkChainDocument({ ...document, nodes: [...document.nodes, node] });
}
export function appendChainLink(document: ChainDocument, link: ChainLink): ChainResult<ChainDocument> {
  const checked = checkChainLink(link);
  if (!checked.ok) return failure(checked.issue);
  return checkChainDocument({ ...document, links: [...document.links, link] });
}
export function appendChainEvent(document: ChainDocument, event: ChainEvent): ChainResult<ChainDocument> {
  const checked = checkChainEvent(event);
  if (!checked.ok) return failure(checked.issue);
  return checkChainDocument({ ...document, events: [...document.events, event] });
}
export function changeChainPhase(document: ChainDocument, nodeId: string, phase: ChainPhase): ChainResult<ChainDocument> {
  const node = document.nodes.find((item) => item.id === nodeId);
  if (!node) return failure("reference");
  if (node.phase === phase) return success(document);
  if (node.phase === "draft" && phase === "closed") return failure("phase");
  if (node.phase === "closed" && phase !== "review") return failure("phase");
  if (node.phase === "review" && phase === "draft") return failure("phase");
  return checkChainDocument({ ...document, nodes: document.nodes.map((item) => item.id === nodeId ? { ...item, phase } : item) });
}
export function filterChainNodes(document: ChainDocument, query: ChainQuery): readonly ChainNode[] {
  return document.nodes.filter((node) => {
    if (query.packId && node.packId !== query.packId) return false;
    if (query.role && node.role !== query.role) return false;
    if (query.state && node.state !== query.state) return false;
    if (query.phase && node.phase !== query.phase) return false;
    if (query.text && !`${node.title} ${node.note} ${node.id} ${node.packId}`.toLocaleLowerCase().includes(query.text.toLocaleLowerCase())) return false;
    return true;
  }).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
}
export function chainForPack(document: ChainDocument, packId: string): ChainDocument {
  const nodes = document.nodes.filter((node) => node.packId === packId);
  const ids = new Set(nodes.map((node) => node.id));
  return { ...document, nodes, links: document.links.filter((link) => ids.has(link.fromId) && ids.has(link.toId)), events: document.events.filter((event) => ids.has(event.nodeId)) };
}
export function chainSummary(document: ChainDocument): ChainSummary {
  const linked = new Set(document.links.flatMap((link) => [link.fromId, link.toId]));
  return {
    nodes: document.nodes.length,
    links: document.links.length,
    events: document.events.length,
    packs: new Set(document.nodes.map((node) => node.packId)).size,
    unknown: document.nodes.filter((node) => node.state === "UNKNOWN").length + document.links.filter((link) => link.state === "UNKNOWN").length,
    disputed: document.nodes.filter((node) => node.state === "disputed").length + document.links.filter((link) => link.state === "disputed").length,
    unresolved: document.nodes.filter((node) => node.phase !== "closed").length,
    orphanNodes: document.nodes.filter((node) => !linked.has(node.id)).length,
    contentReady: false,
  };
}
function collisions<T extends { id: string }>(left: readonly T[], right: readonly T[]): number {
  const existing = new Map(left.map((item) => [item.id, JSON.stringify(item)]));
  return right.filter((item) => existing.has(item.id) && existing.get(item.id) !== JSON.stringify(item)).length;
}
function additions<T extends { id: string }>(left: readonly T[], right: readonly T[]): number {
  const ids = new Set(left.map((item) => item.id));
  return right.filter((item) => !ids.has(item.id)).length;
}
export function previewChainMerge(current: ChainDocument, incoming: ChainDocument): ChainMergePreview {
  return {
    nodesAdded: additions(current.nodes, incoming.nodes),
    linksAdded: additions(current.links, incoming.links),
    eventsAdded: additions(current.events, incoming.events),
    nodeConflicts: collisions(current.nodes, incoming.nodes),
    linkConflicts: collisions(current.links, incoming.links),
    eventConflicts: collisions(current.events, incoming.events),
    contentReady: false,
  };
}
function union<T extends { id: string }>(left: readonly T[], right: readonly T[]): T[] {
  const known = new Set(left.map((item) => item.id));
  return [...left, ...right.filter((item) => !known.has(item.id))];
}
export function mergeChainDocuments(current: ChainDocument, incoming: ChainDocument): ChainResult<ChainDocument> {
  const left = checkChainDocument(current);
  if (!left.ok) return failure(left.issue);
  const right = checkChainDocument(incoming);
  if (!right.ok) return failure(right.issue);
  const diff = previewChainMerge(current, incoming);
  if (diff.nodeConflicts || diff.linkConflicts || diff.eventConflicts) return failure("conflict");
  return checkChainDocument({ ...current, nodes: union(current.nodes, incoming.nodes), links: union(current.links, incoming.links), events: union(current.events, incoming.events) });
}
export function serializeChain(document: ChainDocument): ChainResult<string> {
  const checked = checkChainDocument(document);
  if (!checked.ok) return failure(checked.issue);
  const payload = JSON.stringify(document, null, 2);
  if (new TextEncoder().encode(payload).byteLength > CHAIN_LIMITS.bytes) return failure("limit");
  return success(payload);
}
export function parseChain(input: string): ChainResult<ChainDocument> {
  if (new TextEncoder().encode(input).byteLength > CHAIN_LIMITS.bytes) return failure("limit");
  let value: unknown;
  try { value = JSON.parse(input) as unknown; } catch { return failure("schema"); }
  return checkChainDocument(value);
}
export function compareChainPacks(left: ChainDocument, right: ChainDocument, packId: string): { readonly added: readonly string[]; readonly removed: readonly string[]; readonly changed: readonly string[]; readonly contentReady: false } {
  const a = chainForPack(left, packId).nodes;
  const b = chainForPack(right, packId).nodes;
  const prior = new Map(a.map((node) => [node.id, JSON.stringify(node)]));
  const now = new Map(b.map((node) => [node.id, JSON.stringify(node)]));
  return {
    added: b.filter((n) => !prior.has(n.id)).map((n) => n.id).sort(),
    removed: a.filter((n) => !now.has(n.id)).map((n) => n.id).sort(),
    changed: b.filter((n) => prior.has(n.id) && prior.get(n.id) !== now.get(n.id)).map((n) => n.id).sort(),
    contentReady: false,
  };
}
