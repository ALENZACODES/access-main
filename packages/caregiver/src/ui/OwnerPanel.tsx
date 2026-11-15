import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { UserProfile } from "@access/shared";
import { formatDateTime, t, tDynamic, type Lang } from "../i18n/index.ts";
import type { CaregiverService, Result } from "../service.ts";
import { SNAPSHOT_FIELDS, type AuditEntry, type GrantRow, type ScopeInput, type SnapshotField } from "../types.ts";
import { describeField, describeScope, snapshotFields } from "./describe.ts";

type Kind = ScopeInput["kind"];

interface FormState {
  label: string;
  kind: Kind;
  journeyRef: string;
  journeyLabel: string;
  receiptRef: string;
  receiptLabel: string;
  receiptDate: string;
  fields: SnapshotField[];
  expires: string;
}

const EMPTY_FORM: FormState = {
  label: "",
  kind: "journey_reference",
  journeyRef: "",
  journeyLabel: "",
  receiptRef: "",
  receiptLabel: "",
  receiptDate: "",
  fields: [],
  expires: "",
};

/** A date typed by the owner becomes a local time. An unreadable value is passed on as typed so validation refuses it. */
function localIso(date: string, time: string): string {
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toISOString();
}

function failureText(lang: Lang, result: Extract<Result<unknown>, { ok: false }>): string {
  if (result.issues.some((issue) => issue.code === "looks_like_contact")) return t(lang, "error.looks_like_contact");
  return tDynamic(lang, `error.${result.code}`);
}

export interface OwnerPanelProps {
  service: CaregiverService;
  profile: UserProfile;
  lang: Lang;
}

export function OwnerPanel({ service, profile, lang }: OwnerPanelProps) {
  const [grants, setGrants] = useState<GrantRow[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const refresh = useCallback(async () => {
    try {
      const [rows, log] = await Promise.all([service.listGrants(), service.auditLog()]);
      setGrants(rows);
      setAudit(log);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const toggleField = (field: SnapshotField) =>
    update({ fields: form.fields.includes(field) ? form.fields.filter((item) => item !== field) : [...form.fields, field] });

  async function submit(event: FormEvent) {
    event.preventDefault();
    let scope: ScopeInput;
    if (form.kind === "journey_reference") {
      scope = { kind: "journey_reference", journey_ref: form.journeyRef.trim(), label: form.journeyLabel };
    } else if (form.kind === "check_in_receipt") {
      scope = {
        kind: "check_in_receipt",
        receipt_id: form.receiptRef.trim(),
        label: form.receiptLabel,
        recorded_at: form.receiptDate ? localIso(form.receiptDate, "00:00:00") : "",
      };
    } else {
      scope = { kind: "equipment_snapshot", fields: form.fields };
    }
    try {
      const result = await service.createGrant(
        { caregiver_label: form.label, scope, expires_at: form.expires ? localIso(form.expires, "23:59:59") : null },
        profile,
      );
      if (result.ok) {
        setMessage({ error: false, text: t(lang, "status.granted", { name: result.value.caregiver_label }) });
        setForm(EMPTY_FORM);
      } else {
        setMessage({ error: true, text: failureText(lang, result) });
      }
    } catch {
      setFailed(true);
    }
    await refresh();
  }

  async function revoke(row: GrantRow) {
    const result = await service.revokeGrant(row.grant_id);
    setMessage(
      result.ok
        ? { error: false, text: t(lang, "status.revokedFor", { name: row.caregiver_label }) }
        : { error: true, text: failureText(lang, result) },
    );
    await refresh();
  }

  async function stopSharing(row: GrantRow, field: SnapshotField) {
    const result = await service.narrowGrant(row.grant_id, { remove_fields: [field] });
    setMessage(
      result.ok
        ? { error: false, text: t(lang, "status.narrowed", { field: describeField(lang, field), name: row.caregiver_label }) }
        : { error: true, text: failureText(lang, result) },
    );
    await refresh();
  }

  if (failed) return <p role="alert">{t(lang, "app.loadError")}</p>;

  return (
    <section aria-labelledby="owner-heading">
      <h2 id="owner-heading">{t(lang, "owner.heading")}</h2>
      <p>{t(lang, "owner.intro")}</p>

      <div role={message?.error ? "alert" : "status"} className={message?.error ? "message error" : "message"}>
        {message?.text}
      </div>

      <form onSubmit={(event) => void submit(event)} aria-labelledby="grant-form-heading">
        <h3 id="grant-form-heading">{t(lang, "owner.form.heading")}</h3>

        <div className="field">
          <label htmlFor="caregiver-name">{t(lang, "owner.form.caregiver")}</label>
          <input id="caregiver-name" name="caregiver" type="text" autoComplete="off" maxLength={60} required aria-describedby="caregiver-hint" value={form.label} onChange={(e) => update({ label: e.target.value })} />
          <p id="caregiver-hint" className="hint">{t(lang, "owner.form.caregiverHint")}</p>
        </div>

        <fieldset>
          <legend>{t(lang, "owner.form.scope")}</legend>
          {(
            [
              ["journey_reference", "owner.form.scopeJourney"],
              ["check_in_receipt", "owner.form.scopeReceipt"],
              ["equipment_snapshot", "owner.form.scopeEquipment"],
            ] as const
          ).map(([kind, key]) => (
            <label key={kind} className="choice">
              <input type="radio" name="scope" value={kind} checked={form.kind === kind} onChange={() => update({ kind })} />
              <span>{t(lang, key)}</span>
            </label>
          ))}
        </fieldset>

        {form.kind === "journey_reference" && (
          <>
            <div className="field">
              <label htmlFor="journey-ref">{t(lang, "owner.form.journeyRef")}</label>
              <input id="journey-ref" type="text" autoComplete="off" maxLength={64} required aria-describedby="journey-hint" value={form.journeyRef} onChange={(e) => update({ journeyRef: e.target.value })} />
              <p id="journey-hint" className="hint">{t(lang, "owner.form.journeyRefHint")}</p>
            </div>
            <div className="field">
              <label htmlFor="journey-label">{t(lang, "owner.form.journeyLabel")}</label>
              <input id="journey-label" type="text" autoComplete="off" maxLength={80} required value={form.journeyLabel} onChange={(e) => update({ journeyLabel: e.target.value })} />
            </div>
          </>
        )}

        {form.kind === "check_in_receipt" && (
          <>
            <div className="field">
              <label htmlFor="receipt-ref">{t(lang, "owner.form.receiptRef")}</label>
              <input id="receipt-ref" type="text" autoComplete="off" maxLength={64} required value={form.receiptRef} onChange={(e) => update({ receiptRef: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="receipt-label">{t(lang, "owner.form.receiptLabel")}</label>
              <input id="receipt-label" type="text" autoComplete="off" maxLength={80} required value={form.receiptLabel} onChange={(e) => update({ receiptLabel: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="receipt-date">{t(lang, "owner.form.receiptDate")}</label>
              <input id="receipt-date" type="date" required value={form.receiptDate} onChange={(e) => update({ receiptDate: e.target.value })} />
            </div>
          </>
        )}

        {form.kind === "equipment_snapshot" && (
          <fieldset aria-describedby="fields-hint">
            <legend>{t(lang, "owner.form.fields")}</legend>
            <p id="fields-hint" className="hint">{t(lang, "owner.form.fieldsHint")}</p>
            {SNAPSHOT_FIELDS.map((field) => (
              <label key={field} className="choice">
                <input type="checkbox" checked={form.fields.includes(field)} onChange={() => toggleField(field)} />
                <span>{describeField(lang, field)}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="expires">{t(lang, "owner.form.expires")}</label>
          <input id="expires" type="date" aria-describedby="expires-hint" value={form.expires} onChange={(e) => update({ expires: e.target.value })} />
          <p id="expires-hint" className="hint">{t(lang, "owner.form.expiresHint")}</p>
        </div>

        <button type="submit" className="primary">{t(lang, "owner.form.submit")}</button>
      </form>

      <h3 id="grants-heading">{t(lang, "owner.grants.heading")}</h3>
      {grants === null ? (
        <p>{t(lang, "app.loading")}</p>
      ) : grants.length === 0 ? (
        <p>{t(lang, "owner.grants.none")}</p>
      ) : (
        <ul aria-labelledby="grants-heading" className="cards">
          {grants.map((row) => {
            const fields = snapshotFields(row.scope);
            const scopeText = describeScope(lang, row.scope);
            return (
              <li key={row.grant_id}>
                <p><strong>{t(lang, "owner.grants.caregiver", { name: row.caregiver_label })}</strong></p>
                <p>{t(lang, "owner.grants.shared", { scope: scopeText })}</p>
                <p>{t(lang, "owner.grants.status", { status: t(lang, `status.${row.status}`) })}</p>
                <p>{row.expires_at ? t(lang, "owner.grants.ends", { time: formatDateTime(lang, row.expires_at) }) : t(lang, "owner.grants.noEnd")}</p>
                {row.status === "active" && (
                  <div className="actions">
                    {fields.length > 1 &&
                      fields.map((field) => (
                        <button key={field} type="button" onClick={() => void stopSharing(row, field)} aria-label={t(lang, "owner.grants.stopFor", { field: describeField(lang, field), name: row.caregiver_label })}>
                          {t(lang, "owner.grants.stop", { field: describeField(lang, field) })}
                        </button>
                      ))}
                    <button type="button" className="danger" onClick={() => void revoke(row)} aria-label={t(lang, "owner.grants.revokeFor", { name: row.caregiver_label, scope: scopeText })}>
                      {t(lang, "owner.grants.revoke")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h3 id="audit-heading">{t(lang, "owner.audit.heading")}</h3>
      <p>{t(lang, "owner.audit.intro")}</p>
      {audit.length === 0 ? (
        <p>{t(lang, "owner.audit.none")}</p>
      ) : (
        <ol aria-labelledby="audit-heading" className="log">
          {audit.map((entry) => (
            <li key={entry.entry_id}>
              {[
                t(lang, "owner.audit.line", {
                  time: formatDateTime(lang, entry.at),
                  action: tDynamic(lang, `audit.action.${entry.action}`),
                  name: entry.caregiver_label,
                  scope: entry.scope_kind ? tDynamic(lang, `scope.${entry.scope_kind}`) : t(lang, "audit.scopeNone"),
                  outcome: tDynamic(lang, `audit.outcome.${entry.outcome}`),
                }),
                entry.reason ? t(lang, "owner.audit.reason", { reason: tDynamic(lang, `audit.reason.${entry.reason}`) }) : "",
                entry.fields_removed.length > 0
                  ? t(lang, "owner.audit.removed", { fields: entry.fields_removed.map((field) => describeField(lang, field)).join(", ") })
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
