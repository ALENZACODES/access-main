// A short report of the writes of markup: how many there are, how each is built, and what the list says about them.

import type { Sink, SinkKind, SinkValue } from "./dgSink";
import type { SinkProblem, SinkRow } from "./dgSinkRegister";
import { formatSinkProblem } from "./dgSinkRegister";

export interface SinkReportInput {
  files: number;
  sinks: readonly Sink[];
  rows: readonly SinkRow[];
  problems: readonly SinkProblem[];
}

export function tally<T extends string>(items: readonly T[]): Array<[T, number]> {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

export function renderSinkReport(input: SinkReportInput): string {
  const { files, sinks, rows, problems } = input;
  const out: string[] = ["# Writes of markup", "", `Files read: ${files}`, `Writes found: ${sinks.length}`, `Files with a write: ${new Set(sinks.map((s) => s.path)).size}`, `Rows on the list: ${rows.length}`, ""];
  const kinds = tally<SinkKind>(sinks.map((s) => s.kind));
  out.push("## By kind", "", ...(kinds.length === 0 ? ["none"] : kinds.map(([k, n]) => `- ${k}: ${n}`)), "");
  const values = tally<SinkValue>(sinks.filter((s) => s.kind === "assign" || s.kind === "append").map((s) => s.value));
  out.push("## What an assignment writes", "", ...(values.length === 0 ? ["none"] : values.map(([v, n]) => `- ${v}: ${n}`)), "");
  const callees = tally(sinks.filter((s) => s.callee !== "").map((s) => s.callee));
  out.push("## Functions that build the markup", "", ...(callees.length === 0 ? ["none"] : callees.map(([c, n]) => `- ${c}: ${n}`)), "");
  out.push("## Problems", "", ...(problems.length === 0 ? ["none"] : problems.map((p) => `- ${formatSinkProblem(p)}`)), "");
  return out.join("\n");
}
