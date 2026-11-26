import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import type { BucketKey } from "./packFingerprint.ts";
import { MAX_DETAIL_ENTRIES, compareDetail, makeDetailCode, parseDetailCode } from "./packGroupDetail.ts";
import {
  DETAIL_LIST_KINDS, type DetailListKind, detailCodeLabel, detailCopied, detailCopyButton, detailCopyFailed, detailGroupsMismatch, detailIntro, detailLimit, detailListHeading,
  detailMore, detailOtherName, detailPasteLabel, detailPastePlaceholder, detailProblem, detailSummary, detailTooMany,
} from "./packGroupDetailCopy.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  /** The groups the device codes said differ. */
  groups: readonly BucketKey[];
  locale: Locale;
  copy: (text: string) => Promise<boolean>;
}

/** The most ids listed under one heading. The rest are counted. */
export const MAX_DETAIL_LISTED = 25;

/**
 * Narrow a difference from groups to places by swapping detail codes. Reading only: nothing is
 * changed on either device, and nothing is sent anywhere.
 */
export function PackGroupDetail({ places, groups, locale, copy }: Props) {
  const pasteId = useId();
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");
  const [shown, setShown] = useState<string | null>(null);

  const made = useMemo(() => makeDetailCode(places, groups), [places, groups]);
  const parsed = useMemo(() => (pasted.trim() === "" ? null : parseDetailCode(pasted)), [pasted]);
  const sameGroups = parsed !== null && parsed.ok && parsed.detail.groups.join("") === groups.join("");
  const comparison = useMemo(() => (parsed !== null && parsed.ok && sameGroups ? compareDetail(places, parsed.detail) : null), [parsed, sameGroups, places]);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p] as const)), [places]);

  const doCopy = async () => {
    if (!made.ok) return;
    const ok = await copy(made.code);
    setShown(ok ? null : made.code);
    setStatus(ok ? detailCopied(locale) : detailCopyFailed(locale));
  };

  const label = (kind: DetailListKind, id: string): string => {
    if (kind === "only-there") return `${id} (${detailOtherName(locale)})`;
    return `${byId.get(id)?.name ?? "UNKNOWN"} (${id})`;
  };

  return (
    <div data-group-detail>
      <p>{detailIntro(groups, locale)}</p>
      {made.ok ? (
        <Button variant="secondary" onPress={doCopy}>
          {detailCopyButton(made.entries, locale)}
        </Button>
      ) : (
        <p>{made.problem === "too-many" ? detailTooMany(made.entries, MAX_DETAIL_ENTRIES, locale) : ""}</p>
      )}
      {shown !== null ? <textarea readOnly aria-label={detailCodeLabel(locale)} rows={8} value={shown} onFocus={(e) => e.currentTarget.select()} /> : null}
      <label htmlFor={pasteId}>{detailPasteLabel(locale)}</label>
      <textarea id={pasteId} rows={6} value={pasted} placeholder={detailPastePlaceholder} onChange={(e) => setPasted(e.target.value)} />
      {parsed && !parsed.ok ? (
        <p data-detail-problem role="status">
          {detailProblem(parsed.problem, parsed.token, locale)}
        </p>
      ) : null}
      {parsed && parsed.ok && !sameGroups ? (
        <p data-detail-mismatch role="status">
          {detailGroupsMismatch(parsed.detail.groups, groups, locale)}
        </p>
      ) : null}
      {comparison ? (
        <div data-detail-result>
          <p role="status">{detailSummary(comparison, locale)}</p>
          {DETAIL_LIST_KINDS.map((kind) => {
            const ids = kind === "only-here" ? comparison.onlyHere : kind === "only-there" ? comparison.onlyThere : comparison.changed;
            if (ids.length === 0) return null;
            return (
              <div key={kind} data-detail-list={kind}>
                <p>{detailListHeading(kind, ids.length, locale)}</p>
                <ul>
                  {ids.slice(0, MAX_DETAIL_LISTED).map((id) => (
                    <li key={id}>{label(kind, id)}</li>
                  ))}
                  {ids.length > MAX_DETAIL_LISTED ? <li>{detailMore(ids.length - MAX_DETAIL_LISTED, locale)}</li> : null}
                </ul>
              </div>
            );
          })}
          <p>{detailLimit(locale)}</p>
        </div>
      ) : null}
      <p aria-live="polite" data-detail-status>
        {status}
      </p>
    </div>
  );
}
