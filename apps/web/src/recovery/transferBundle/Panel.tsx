import { useEffect, useId, useRef, useState } from "react";
import { saveBlobFile } from "../../states/downloadFile";
import {
  appendMembers, BUNDLE_LIMITS, encodeBundle, inspectMember, openBundle,
  type BundleMember, type BundleProblem,
} from "./model";
import {
  bundleCopy, draftLimits, fileAction, fileCount, fileSize, fileSlot, recordCount,
  type BundleLocale,
} from "./copy";
import { PackingListCheck, PackingListExport } from "./PackingListPanel";
import "./panel.css";
import { MultipartTransferPanel } from "./multipart/Panel";

type Notice =
  | { type: "initial" | "cleared" | "closed" | "cancelled" | "checking" | "savedBundle" | "saveFailed" }
  | { type: "problem"; problem: BundleProblem }
  | { type: "adding"; index: number; total: number }
  | { type: "ready"; count: number; source: "draft" | "bundle" }
  | { type: "removed" | "saved"; slot: number };

function noticeText(locale: BundleLocale, notice: Notice): string {
  const copy = bundleCopy[locale];
  const fr = locale === "fr";
  switch (notice.type) {
    case "initial":
      return "";
    case "problem": {
      const { slot, code } = notice.problem;
      const position = slot === undefined ? "" : fileSlot(locale, slot) + ". ";
      return position + copy.problems[code];
    }
    case "ready": {
      const count = fileCount(locale, notice.count);
      if (notice.source === "draft") return fr ? `Sélection\u00a0: ${count}.` : `Selection: ${count}.`;
      return fr ? `Lot ouvert\u00a0: ${count}.` : `Bundle opened: ${count}.`;
    }
    case "adding":
      return fr ? `Contrôle du fichier ${notice.index} sur ${notice.total}…` : `Checking file ${notice.index} of ${notice.total}…`;
    case "removed":
      return fr ? `Fichier ${notice.slot} retiré.` : `File ${notice.slot} removed.`;
    case "saved":
      return fr ? `Le fichier ${notice.slot} est prêt à télécharger.` : `File ${notice.slot} ready to download.`;
    default:
      return copy[notice.type];
  }
}

type LocaleProps = { readonly locale: BundleLocale };

interface FileItemsProps extends LocaleProps {
  readonly members: readonly BundleMember[];
  readonly action: "remove" | "save";
  readonly onAction: (index: number) => void;
  readonly busy?: boolean;
  readonly idPrefix: string;
}

function FileItems({ members, action, onAction, busy, locale, idPrefix }: FileItemsProps) {
  const copy = bundleCopy[locale];
  const label = action === "remove" ? copy.draftList : copy.openedList;
  return (
    <ol aria-label={label} className="transfer-file-list">
      {members.map((member, index) => {
        const slot = index + 1;
        const heading = fileSlot(locale, slot) + " — " + copy.kindLabels[member.kind];
        const digestLabel = locale === "fr" ? "Empreinte SHA-256" : "SHA-256 fingerprint";
        return (
          <li key={member.digest}>
            <strong>{heading}</strong>
            <p>{fileSize(locale, member.byteLength)} · {recordCount(locale, member.recordCount)}</p>
            <details>
              <summary aria-label={digestLabel + " — " + fileSlot(locale, slot)}>{digestLabel}</summary>
              <code>{member.digest}</code>
            </details>
            <button
              type="button"
              id={idPrefix + "-action-" + member.digest}
              disabled={busy}
              onClick={() => onAction(index)}
            >
              {fileAction(locale, action, slot)}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// Replacing a picker selection, cancelling, or leaving the page invalidates
// earlier work. In particular a delayed disk read must not repopulate a cleared list.
function useReadGeneration() {
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  return generation;
}

function startDownload(blob: Blob, name: string): boolean {
  try {
    return saveBlobFile(blob, name);
  } catch {
    return false;
  }
}

function CreateBundle({ locale }: LocaleProps) {
  const copy = bundleCopy[locale];
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const generation = useReadGeneration();
  const [members, setMembers] = useState<readonly BundleMember[]>([]);
  const [notice, setNotice] = useState<Notice>({ type: "initial" });
  const busy = notice.type === "adding";
  const bytes = members.reduce((sum, member) => sum + member.byteLength, 0);

  async function add(files: readonly File[]) {
    if (!files.length) return;
    const ticket = ++generation.current;
    if (members.length + files.length > BUNDLE_LIMITS.members) {
      setNotice({ type: "problem", problem: { code: "member-count" } });
      return;
    }
    if (bytes + files.reduce((sum, file) => sum + file.size, 0) > BUNDLE_LIMITS.totalBytes) {
      setNotice({ type: "problem", problem: { code: "total-size" } });
      return;
    }
    // A keyboard user can reach Cancel while a slow disk read is in progress.
    // Return focus before the control disappears at the end of that read.
    function finish(notice: Notice) {
      if (document.activeElement === cancelButton.current) input.current?.focus();
      setNotice(notice);
    }
    const additions: BundleMember[] = [];
    for (const [index, file] of files.entries()) {
      setNotice({ type: "adding", index: index + 1, total: files.length });
      const slot = members.length + index + 1;
      try {
        const result = await inspectMember(file);
        if (ticket !== generation.current) return;
        if (!result.ok) {
          finish({ type: "problem", problem: { code: result.problem.code, slot } });
          return;
        }
        additions.push(result.value);
      } catch {
        if (ticket === generation.current) finish({ type: "problem", problem: { code: "read", slot } });
        return;
      }
    }
    const updated = appendMembers(members, additions);
    if (!updated.ok) {
      finish({ type: "problem", problem: updated.problem });
      return;
    }
    setMembers(updated.value);
    finish({ type: "ready", count: updated.value.length, source: "draft" });
  }

  function remove(index: number) {
    const next = members[index + 1] ?? members[index - 1];
    if (next) {
      document.getElementById(id + "-action-" + next.digest)?.focus();
    } else {
      input.current?.focus();
    }
    setMembers(members.filter((_, position) => position !== index));
    setNotice({ type: "removed", slot: index + 1 });
  }

  function clear(cancelOnly: boolean) {
    generation.current++;
    if (!cancelOnly) setMembers([]);
    setNotice({ type: cancelOnly ? "cancelled" : "cleared" });
    input.current?.focus();
  }

  function save() {
    const result = encodeBundle(members);
    if (!result.ok) {
      setNotice({ type: "problem", problem: result.problem });
      return;
    }
    const saved = startDownload(result.value, "recovery-transfer-bundle.json");
    setNotice({ type: saved ? "savedBundle" : "saveFailed" });
  }

  return (
    <section aria-labelledby={id + "-title"}>
      <h3 id={id + "-title"}>{copy.compose}</h3>
      <p id={id + "-limits"}>{draftLimits(locale, BUNDLE_LIMITS.members, BUNDLE_LIMITS.totalBytes)}</p>
      <details>
        <summary>{copy.allowed}</summary>
        <ul>{Object.entries(copy.kindLabels).map(([kind, label]) => <li key={kind}>{label}</li>)}</ul>
      </details>
      <label htmlFor={id + "-add"}>{copy.chooseExports}</label>
      <input
        ref={input}
        id={id + "-add"}
        type="file"
        accept=".json,application/json"
        multiple
        aria-invalid={notice.type === "problem" || undefined}
        aria-describedby={id + "-limits " + id + "-status"}
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void add(files);
        }}
      />
      <p role="status" aria-atomic="true" id={id + "-status"}>{noticeText(locale, notice)}</p>
      {busy && <button type="button" ref={cancelButton} onClick={() => clear(true)}>{copy.cancelAdd}</button>}
      {members.length > 0 && (
        <>
          <p>{fileCount(locale, members.length)} · {fileSize(locale, bytes)}</p>
          <FileItems members={members} action="remove" onAction={remove} locale={locale} busy={busy} idPrefix={id} />
        </>
      )}
      <div className="transfer-actions">
        <button type="button" disabled={busy || !members.length} onClick={save}>{copy.saveBundle}</button>
        <button type="button" disabled={!busy && !members.length} onClick={() => clear(false)}>{copy.clearDraft}</button>
      </div>
      {members.length > 0 && !busy && (
        <PackingListExport key={members.map(member => member.digest).join("/")} members={members} locale={locale} />
      )}
    </section>
  );
}

function OpenBundle({ locale }: LocaleProps) {
  const copy = bundleCopy[locale];
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const generation = useReadGeneration();
  const [members, setMembers] = useState<readonly BundleMember[]>([]);
  const [notice, setNotice] = useState<Notice>({ type: "initial" });
  const busy = notice.type === "checking";

  async function open(file?: File) {
    if (!file) return;
    const ticket = ++generation.current;
    setMembers([]);
    setNotice({ type: "checking" });
    function finish(notice: Notice) {
      if (ticket !== generation.current) return;
      if (document.activeElement === cancelButton.current) input.current?.focus();
      setNotice(notice);
    }
    try {
      const result = await openBundle(file);
      if (ticket !== generation.current) return;
      if (!result.ok) {
        finish({ type: "problem", problem: result.problem });
        return;
      }
      setMembers(result.value);
      finish({ type: "ready", count: result.value.length, source: "bundle" });
    } catch {
      finish({ type: "problem", problem: { code: "read" } });
    }
  }

  function close() {
    generation.current++;
    setMembers([]);
    setNotice({ type: busy ? "cancelled" : "closed" });
    input.current?.focus();
  }

  function save(index: number) {
    const member = members[index];
    if (!member) return;
    const slot = index + 1;
    const name = "recovery-" + String(slot).padStart(2, "0") + "-" + member.kind + ".json";
    setNotice(startDownload(member.file, name) ? { type: "saved", slot } : { type: "saveFailed" });
  }

  return (
    <section aria-labelledby={id + "-title"}>
      <h3 id={id + "-title"}>{copy.inspect}</h3>
      <p id={id + "-help"}>{copy.openHelp}</p>
      <label htmlFor={id + "-open"}>{copy.chooseBundle}</label>
      <input
        ref={input}
        id={id + "-open"}
        type="file"
        accept=".json,application/json"
        aria-invalid={notice.type === "problem" || undefined}
        aria-describedby={id + "-help " + id + "-status"}
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void open(file);
        }}
      />
      <p role="status" aria-atomic="true" id={id + "-status"}>{noticeText(locale, notice)}</p>
      {members.length > 0 && (
        <>
          <FileItems members={members} action="save" onAction={save} locale={locale} idPrefix={id} />
          <PackingListCheck members={members} locale={locale} />
        </>
      )}
      {(busy || members.length > 0) && <button type="button" ref={cancelButton} onClick={close}>{busy ? copy.cancelOpen : copy.closeBundle}</button>}
    </section>
  );
}

export function RecoveryTransferBundlePanel({ locale }: LocaleProps) {
  const copy = bundleCopy[locale];
  const id = useId();
  return (
    <section className="recovery-transfer-bundle" aria-labelledby={id} lang={locale}>
      <h2 id={id}>{copy.title}</h2>
      <p>{copy.privacy}</p>
      <CreateBundle locale={locale} />
      <OpenBundle locale={locale} />
      <MultipartTransferPanel locale={locale} />
    </section>
  );
}
