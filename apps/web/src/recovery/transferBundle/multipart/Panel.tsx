import { useId, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { saveBlobFile } from "../../../states/downloadFile";
import { inspectMember, type BundleMember } from "../model";
import {
  createTransferSet, openTransferSet, transferSetReceipt, SET_LIMITS,
  type SetProblem, type SetProblemCode, type TransferSet,
} from "./model";
import {
  candidatesFromMembers, planTransferParts, type TransferPlan,
} from "./planner";
import {
  compareReceiptText, exportTransferReceipt, parseTransferReceipt,
  type ReceiptComparison,
} from "./receipt";
import {
  multipartCopy, multipartFileName, multipartMemberName, multipartNumber,
  type MultipartLocale,
} from "./copy";

interface Props {
  readonly locale: MultipartLocale;
}

type Status =
  | { readonly type: "idle" | "checking" | "creating" | "opening" | "created" | "opened" | "cleared" | "failed" }
  | { readonly type: "problem"; readonly problem: SetProblem }
  | { readonly type: "receipt-error"; readonly issue: string }
  | { readonly type: "receipt-result"; readonly comparison: ReceiptComparison };

const frame = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  marginBlock: 12, display: "grid", gap: 12,
  minWidth: 0, maxWidth: "100%", boxSizing: "border-box",
} as const;
const row = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 } as const;
const control = {
  minHeight: 44, minWidth: 44, maxWidth: "100%", boxSizing: "border-box",
  padding: "10px 12px", font: "inherit",
} as const;
const mono = { overflowWrap: "anywhere", wordBreak: "break-word" } as const;

function mapMemberProblem(code: import("../model").BundleProblemCode): SetProblemCode {
  if (code === "integrity") return "digest";
  if (code === "native-format") return "native-bundle";
  if (code === "bundle-size") return "part-size";
  return code;
}

function statusText(locale: MultipartLocale, status: Status): string {
  const copy = multipartCopy(locale);
  switch (status.type) {
    case "idle": return "";
    case "checking": return copy.checking;
    case "creating": return copy.saving;
    case "opening": return copy.checking;
    case "created": return copy.created;
    case "opened": return copy.opened;
    case "cleared": return copy.cleared;
    case "failed": return copy.failed;
    case "problem": return copy.issues[status.problem.code];
    case "receipt-error": return copy.receiptIssues[status.issue as keyof typeof copy.receiptIssues] ?? copy.receiptIssues.format;
    case "receipt-result": return status.comparison.matches ? copy.receiptMatches : copy.receiptDiffers;
  }
}

function save(blob: Blob, name: string): boolean {
  try {
    return saveBlobFile(blob, name);
  } catch {
    return false;
  }
}

function MemberList({
  members, locale, onSave,
}: {
  readonly members: readonly BundleMember[];
  readonly locale: MultipartLocale;
  readonly onSave: (member: BundleMember, index: number) => void;
}): ReactElement {
  const copy = multipartCopy(locale);
  return <ol aria-label={copy.members}>
    {members.map((member, index) => <li key={member.digest} style={{ ...frame, marginBlock: 8 }}>
      <strong>{copy.fileName} {multipartNumber(locale, index + 1)}</strong>
      <p>{copy.memberKind}: {member.kind}</p>
      <p>{copy.recordCount}: {multipartNumber(locale, member.recordCount)} · {multipartNumber(locale, member.byteLength)} {copy.bytes.toLocaleLowerCase()}</p>
      <details>
        <summary style={control}>SHA-256</summary>
        <code style={mono}>{member.digest}</code>
      </details>
      <button type="button" style={control} onClick={() => onSave(member, index)}>
        {copy.saveMember} {multipartNumber(locale, index + 1)}
      </button>
    </li>)}
  </ol>;
}

function SetDetails({
  set, locale, onSaveMember, onSavePart, onSaveReceipt,
}: {
  readonly set: TransferSet;
  readonly locale: MultipartLocale;
  readonly onSaveMember: (member: BundleMember, index: number) => void;
  readonly onSavePart: (part: TransferSet["parts"][number]) => void;
  readonly onSaveReceipt: () => void;
}): ReactElement {
  const copy = multipartCopy(locale);
  let memberOffset = 0;
  return <section aria-label={copy.open} style={frame}>
    <h3>{copy.openedHeading}</h3>
    <dl>
      <dt>{copy.setId}</dt><dd><code style={mono}>{set.setId}</code></dd>
      <dt>{copy.parts}</dt><dd>{multipartNumber(locale, set.parts.length)}</dd>
      <dt>{copy.members}</dt><dd>{multipartNumber(locale, set.memberCount)}</dd>
      <dt>{copy.bytes}</dt><dd>{multipartNumber(locale, set.byteLength)}</dd>
    </dl>
    <div style={row}>
      <button type="button" style={control} onClick={onSaveReceipt}>{copy.saveReceipt}</button>
    </div>
    {set.parts.map(part => {
      const start = memberOffset;
      memberOffset += part.members.length;
      return <section key={part.digest} style={frame} aria-label={`${copy.parts} ${part.index}`}>
        <h4>{copy.parts} {multipartNumber(locale, part.index)} / {multipartNumber(locale, part.count)}</h4>
        <p>{multipartNumber(locale, part.members.reduce((total, member) => total + member.byteLength, 0))} {copy.bytes.toLocaleLowerCase()}</p>
        <details>
          <summary style={control}>SHA-256</summary>
          <code style={mono}>{part.digest}</code>
        </details>
        <button type="button" style={control} onClick={() => onSavePart(part)}>
          {copy.savePart} {multipartNumber(locale, part.index)}
        </button>
        <MemberList members={part.members} locale={locale}
          onSave={(member, index) => onSaveMember(member, start + index)} />
      </section>;
    })}
  </section>;
}

export function MultipartTransferPanel({ locale }: Props): ReactElement {
  const copy = multipartCopy(locale);
  const heading = useId();
  const createHeading = useId();
  const openHeading = useId();
  const receiptHeading = useId();
  const createInput = useRef<HTMLInputElement | null>(null);
  const openInput = useRef<HTMLInputElement | null>(null);
  const receiptInput = useRef<HTMLInputElement | null>(null);
  const generation = useRef(0);
  const [members, setMembers] = useState<readonly BundleMember[]>([]);
  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const [created, setCreated] = useState<TransferSet | null>(null);
  const [opened, setOpened] = useState<TransferSet | null>(null);
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [receiptText, setReceiptText] = useState("");

  async function addFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const run = ++generation.current;
    setMembers([]);
    setPlan(null);
    setCreated(null);
    setStatus({ type: "checking" });
    if (selected.length < 2) {
      setStatus({ type: "problem", problem: { code: "part-count" } });
      return;
    }
    if (selected.length > SET_LIMITS.members) {
      setStatus({ type: "problem", problem: { code: "member-count" } });
      return;
    }
    const inspected: BundleMember[] = [];
    for (const [index, file] of selected.entries()) {
      if (run !== generation.current) return;
      const result = await inspectMember(file);
      if (run !== generation.current) return;
      if (!result.ok) {
        setStatus({ type: "problem", problem: { code: mapMemberProblem(result.problem.code), part: index + 1 } });
        return;
      }
      inspected.push(result.value);
    }
    const planned = planTransferParts(candidatesFromMembers(inspected));
    if (!planned.ok) {
      setStatus({ type: "problem", problem: planned.slot === undefined
        ? { code: planned.issue }
        : { code: planned.issue, part: planned.slot } });
      return;
    }
    setMembers(inspected);
    setPlan(planned.value);
    setStatus({ type: "idle" });
  }

  async function makeSet(): Promise<void> {
    if (members.length === 0 || !plan) {
      setStatus({ type: "problem", problem: { code: "empty" } });
      return;
    }
    const run = ++generation.current;
    setStatus({ type: "creating" });
    const result = await createTransferSet(members);
    if (run !== generation.current) return;
    if (!result.ok) {
      setStatus({ type: "problem", problem: result.problem });
      return;
    }
    const checked = await openTransferSet(result.value);
    if (run !== generation.current) return;
    if (!checked.ok) {
      setStatus({ type: "problem", problem: checked.problem });
      return;
    }
    setCreated(checked.value);
    if (!save(result.value, "recovery-transfer-set.rxs")) {
      setStatus({ type: "failed" });
      return;
    }
    setStatus({ type: "created" });
  }

  async function openSet(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    const run = ++generation.current;
    setOpened(null);
    setStatus({ type: "opening" });
    if (!file) {
      setStatus({ type: "problem", problem: { code: "empty" } });
      return;
    }
    const result = await openTransferSet(file);
    if (run !== generation.current) return;
    if (!result.ok) {
      setStatus({ type: "problem", problem: result.problem });
      return;
    }
    setOpened(result.value);
    setReceiptText(transferSetReceipt(result.value));
    setStatus({ type: "opened" });
  }

  function clear(): void {
    generation.current++;
    setMembers([]);
    setPlan(null);
    setCreated(null);
    setOpened(null);
    setReceiptText("");
    setStatus({ type: "cleared" });
    createInput.current?.focus();
  }

  function saveMember(member: BundleMember, index: number): void {
    if (!save(member.file, multipartMemberName(index + 1, member.digest))) setStatus({ type: "failed" });
  }

  function savePart(part: TransferSet["parts"][number]): void {
    if (!save(part.file, multipartFileName(part.index, part.digest))) setStatus({ type: "failed" });
  }

  function saveReceipt(): void {
    if (!opened) return;
    const receipt = exportTransferReceipt(opened);
    if (!save(new Blob([receipt], { type: "application/json" }), "recovery-transfer-set-receipt.json")) {
      setStatus({ type: "failed" });
    }
  }

  async function compareReceipt(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !opened) return;
    const run = ++generation.current;
    if (file.size > 32_768) {
      setStatus({ type: "receipt-error", issue: "size" });
      return;
    }
    try {
      const text = await file.text();
      if (run !== generation.current) return;
      const parsed = parseTransferReceipt(text);
      if (!parsed.ok) {
        setStatus({ type: "receipt-error", issue: parsed.issue });
        return;
      }
      const comparison = compareReceiptText(text, opened);
      if (!comparison.ok) {
        setStatus({ type: "receipt-error", issue: comparison.issue });
        return;
      }
      if (run !== generation.current) return;
      setStatus({ type: "receipt-result", comparison: comparison.value });
    } catch {
      if (run === generation.current) setStatus({ type: "failed" });
    }
  }

  const shown = opened ?? created;
  return <section lang={locale} aria-labelledby={heading} style={frame}>
    <h2 id={heading}>{copy.title}</h2>
    <p>{copy.description}</p>
    <p>{copy.caution}</p>
    <p id="multipart-create-status" role="status" aria-live="polite" aria-atomic="true">{statusText(locale, status)}</p>
    <section aria-labelledby={createHeading} style={frame}>
      <h3 id={createHeading}>{copy.addFiles}</h3>
      <p>{copy.planSummary}</p>
      <label htmlFor={createInput.current?.id ?? "multipart-create-files"}>{copy.chooseFiles}</label>
      <input ref={createInput} id="multipart-create-files" type="file" multiple
        accept=".json,application/json" style={control} aria-invalid={status.type === "problem" || undefined}
        aria-describedby="multipart-create-status" onChange={event => { void addFiles(event); }} />
      {plan && <div>
        <p>{copy.planning}: {multipartNumber(locale, plan.partCount)} {copy.parts.toLocaleLowerCase()}, {multipartNumber(locale, plan.memberCount)} {copy.members.toLocaleLowerCase()}, {multipartNumber(locale, plan.byteLength)} {copy.bytes.toLocaleLowerCase()}</p>
        <ol aria-label={copy.planning}>
          {plan.parts.map(part => <li key={part.index}>
            {multipartNumber(locale, part.index)} / {multipartNumber(locale, plan.partCount)} — {multipartNumber(locale, part.memberCount)} {copy.members.toLocaleLowerCase()} — {multipartNumber(locale, part.byteLength)} {copy.bytes.toLocaleLowerCase()}
          </li>)}
        </ol>
      </div>}
      <div style={row}>
        <button type="button" style={control} disabled={!plan || status.type === "creating"} onClick={() => { void makeSet(); }}>{copy.create}</button>
        <button type="button" style={control} disabled={members.length === 0 && status.type !== "checking" && status.type !== "creating" && status.type !== "opening"} onClick={clear}>{status.type === "checking" || status.type === "creating" ? copy.cancel : copy.clear}</button>
      </div>
      {members.length > 0 && <MemberList members={members} locale={locale} onSave={saveMember} />}
    </section>
    <section aria-labelledby={openHeading} style={frame}>
      <h3 id={openHeading}>{copy.open}</h3>
      <label htmlFor={openInput.current?.id ?? "multipart-open-file"}>{copy.selectFirst}</label>
      <input ref={openInput} id="multipart-open-file" type="file" accept=".rxs,application/json"
        style={control} onChange={event => { void openSet(event); }} />
      {opened && <>
        <SetDetails set={opened} locale={locale} onSaveMember={saveMember}
          onSavePart={savePart} onSaveReceipt={saveReceipt} />
        <section aria-labelledby={receiptHeading} style={frame}>
          <h3 id={receiptHeading}>{copy.receipt}</h3>
          <label htmlFor={receiptInput.current?.id ?? "multipart-receipt-file"}>{copy.chooseReceipt}</label>
          <input ref={receiptInput} id="multipart-receipt-file" type="file" accept=".json,application/json"
            style={control} onChange={event => { void compareReceipt(event); }} />
          {receiptText && <details>
            <summary style={control}>{copy.receipt}</summary>
            <pre style={mono}>{receiptText}</pre>
          </details>}
        </section>
      </>}
    </section>
    {created && <SetDetails set={created} locale={locale} onSaveMember={saveMember}
      onSavePart={savePart} onSaveReceipt={() => {
        const receipt = exportTransferReceipt(created);
        if (!save(new Blob([receipt], { type: "application/json" }), "recovery-transfer-set-receipt.json")) setStatus({ type: "failed" });
      }} />}
    {shown && <button type="button" style={control} onClick={clear}>{copy.clear}</button>}
  </section>;
}
