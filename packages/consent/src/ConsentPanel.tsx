import { useCallback, useEffect, useMemo, useState } from "react";
import { translate, type MessageKey } from "./catalog/index.ts";
import { ConsentError, type ConsentEngine } from "./engine.ts";
import { LOCALES, type ConsentStatus, type Locale, type Purpose } from "./types.ts";

export interface ConsentPanelProps {
  engine: ConsentEngine;
  initialLocale?: Locale;
}

type ActionKind = "grant" | "refuse" | "revoke";

const STATE_KEYS = {
  not_asked: "state.not_asked",
  granted: "state.granted",
  refused: "state.refused",
  revoked: "state.revoked",
  outdated: "state.outdated",
} as const satisfies Record<ConsentStatus, MessageKey>;

const ANNOUNCE_KEYS = {
  grant: "announce.granted",
  refuse: "announce.refused",
  revoke: "announce.revoked",
} as const satisfies Record<ActionKind, MessageKey>;

const ACTION_KEYS = {
  grant: "action.grant",
  refuse: "action.refuse",
  revoke: "action.revoke",
} as const satisfies Record<ActionKind, MessageKey>;

const AUDIT_ACTION_KEYS = {
  grant: "audit.action.grant",
  refuse: "audit.action.refuse",
  revoke: "audit.action.revoke",
} as const satisfies Record<ActionKind, MessageKey>;

function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ConsentPanel({ engine, initialLocale = "en" }: ConsentPanelProps) {
  const purposes = useMemo(() => engine.listPurposes(), [engine]);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [announcement, setAnnouncement] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [states, setStates] = useState(() => purposes.map((p) => engine.currentState(p.id)));
  const [audit, setAudit] = useState(() => engine.auditLog());

  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "title");
  }, [locale]);

  useEffect(() => {
    if (focusId === null) return;
    document.getElementById(`state-${focusId}`)?.focus();
    setFocusId(null);
  }, [focusId]);

  const refresh = useCallback(() => {
    setStates(purposes.map((p) => engine.currentState(p.id)));
    setAudit(engine.auditLog());
  }, [engine, purposes]);

  function act(kind: ActionKind, purpose: Purpose) {
    try {
      if (kind === "grant") engine.grant(purpose.id, purpose.version);
      else if (kind === "refuse") engine.refuse(purpose.id);
      else engine.revoke(purpose.id);
      setAnnouncement(t(ANNOUNCE_KEYS[kind], { title: purpose.title[locale] }));
    } catch (error) {
      if (!(error instanceof ConsentError)) throw error;
      setAnnouncement(t("announce.error"));
    }
    refresh();
    setFocusId(purpose.id);
  }

  function changeLocale(next: Locale) {
    setLocale(next);
    setAnnouncement("");
  }

  const titles = new Map(purposes.map((p) => [p.id, p.title[locale]]));

  return (
    <main className="consent">
      <header className="consent__header">
        <h1>{t("title")}</h1>
        <div role="group" aria-label={t("lang.label")} className="consent__lang">
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              className={code === locale ? "" : "secondary"}
              aria-pressed={code === locale}
              onClick={() => changeLocale(code)}
            >
              {translate(code, `lang.${code}`)}
            </button>
          ))}
        </div>
      </header>
      <p>{t("intro.local")}</p>
      <p>{t("intro.law")}</p>
      {engine.persistent ? null : <p className="consent__notice">{t("storage.memory")}</p>}
      <p role="status" aria-live="polite" className="consent__status">
        {announcement}
      </p>
      <h2>{t("purposes.title")}</h2>
      <ul className="consent__list">
        {purposes.map((purpose, index) => {
          const state = states[index];
          if (!state) return null;
          const status = state.status;
          const canGrant = status !== "granted";
          const canRefuse = status !== "granted" && status !== "refused";
          const canRevoke = status === "granted" || status === "outdated";
          const headingId = `purpose-${purpose.id}`;
          const button = (kind: ActionKind, secondary: boolean) => (
            <button type="button" className={secondary ? "secondary" : ""} onClick={() => act(kind, purpose)}>
              {t(ACTION_KEYS[kind])}
              <span className="sr-only"> — {purpose.title[locale]}</span>
            </button>
          );
          return (
            <li key={purpose.id}>
              <section aria-labelledby={headingId} className="consent__purpose">
                <h3 id={headingId}>{purpose.title[locale]}</h3>
                <p className="consent__label">{t("purpose.fullText")}</p>
                <p className="consent__text">{purpose.description[locale]}</p>
                <p className="consent__label">{t("purpose.categories")}</p>
                <ul>
                  {purpose.data_categories.map((category) => (
                    <li key={category}>{t(`category.${category}`)}</li>
                  ))}
                </ul>
                <p className="consent__meta">{t("purpose.version", { version: purpose.version })}</p>
                <p id={`state-${purpose.id}`} tabIndex={-1} className="consent__state">
                  <strong>{t("state.label")}</strong>{" "}
                  {t(STATE_KEYS[status], { date: state.decidedAt ? formatDate(state.decidedAt, locale) : "" })}
                </p>
                <div className="consent__actions">
                  {canGrant ? button("grant", false) : null}
                  {canRefuse ? button("refuse", true) : null}
                  {canRevoke ? button("revoke", true) : null}
                </div>
              </section>
            </li>
          );
        })}
      </ul>
      <section aria-labelledby="audit-heading" className="consent__audit">
        <h2 id="audit-heading">{t("audit.title")}</h2>
        <p>{t("audit.intro")}</p>
        {audit.length === 0 ? (
          <p>{t("audit.empty")}</p>
        ) : (
          <ol reversed>
            {[...audit].reverse().map((entry) => (
              <li key={entry.seq}>
                {t("audit.entry", {
                  action: t(AUDIT_ACTION_KEYS[entry.action]),
                  title: titles.get(entry.purpose_id) ?? entry.purpose_id,
                  version: entry.purpose_version,
                  date: formatDate(entry.at, locale),
                })}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
