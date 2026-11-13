import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FieldIssue } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { CheckField } from "../design/fields.tsx";
import { ConfirmDialog } from "../design/ConfirmDialog.tsx";
import { draftFromProfile, emptyDraft, profileFromDraft, type ProfileDraft } from "../profile/draft.ts";
import { exportPhrases } from "../profile/exportCopy.ts";
import { PreferenceFields } from "../profile/PreferenceFields.tsx";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { exportProfileJson, exportProfileText, StorageError } from "../storage/repository.ts";

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { profile, ready, save, remove, withdraw, setLanguage } = useProfileState();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [status, setStatus] = useState<"idle" | "saved" | "deleted" | "withdrawn" | "error">("idle");
  const [confirming, setConfirming] = useState<"withdraw" | "delete" | null>(null);
  const withdrawRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const loaded = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  useDocumentTitle(t("profile.title"));

  useEffect(() => {
    if (!ready || loaded.current) return;
    loaded.current = true;
    const language = i18n.language.startsWith("fr") ? "fr" : "en";
    setDraft(profile ? draftFromProfile(profile) : emptyDraft(language));
  }, [ready, profile, i18n.language]);

  useEffect(() => {
    const language = i18n.language.startsWith("fr") ? "fr" : "en";
    setDraft((current) => (current ? { ...current, language_preference: language } : current));
  }, [i18n.language]);

  useEffect(() => {
    if (status === "deleted" || status === "withdrawn") statusRef.current?.focus();
  }, [status]);

  if (!draft) return <p role="status">{t("home.checking")}</p>;

  const onChange = (next: ProfileDraft) => {
    setStatus("idle");
    setIssues([]);
    if (next.language_preference !== draft.language_preference) void setLanguage(next.language_preference);
    setDraft(next);
  };

  const onSave = async () => {
    const built = profileFromDraft(draft, profile, new Date().toISOString());
    if (!built.profile) {
      setIssues(built.issues);
      setStatus("error");
      return;
    }
    try {
      await save(built.profile);
      setIssues([]);
      setStatus("saved");
    } catch (error) {
      setIssues(error instanceof StorageError ? error.issues : [{ field: "form", code: "generic" }]);
      setStatus("error");
    }
  };

  const download = (filename: string, contents: string, type: string) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const consentError = issues.some((issue) => issue.field === "consent" || issue.field === "consent_records")
    ? t("errors.consent_required")
    : undefined;
  const activeConsent = Boolean(profile?.consent_records.some((record) => record.withdrawn_at === null));
  const language = i18n.language.startsWith("fr") ? "fr" : "en";

  const returnFocus = (action: "withdraw" | "delete") => {
    setConfirming(null);
    const target = action === "withdraw" ? withdrawRef.current : deleteRef.current;
    window.requestAnimationFrame(() => target?.focus());
  };

  return (
    <div className="stack">
      <h1>{t("profile.title")}</h1>
      <p className="lead">{t("profile.lead")}</p>
      <p className="callout">{t("profile.privacy")}</p>
      {issues.length > 0 ? (
        <div role="alert" className="callout">
          <p>{t("errors.summary")}</p>
        </div>
      ) : null}
      {status === "saved" ? <p role="status">{t("profile.saved")}</p> : null}
      {status === "deleted" ? (
        <p role="status" tabIndex={-1} ref={statusRef}>{t("profile.deleted")}</p>
      ) : null}
      {status === "withdrawn" ? (
        <p role="status" tabIndex={-1} ref={statusRef}>{t("profile.withdrawn")}</p>
      ) : null}
      {status === "error" && issues.length === 0 ? <p role="alert">{t("profile.couldNotSave")}</p> : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <PreferenceFields
          draft={draft}
          onChange={onChange}
          issues={issues}
          sections={["language", "mobility", "display", "offline"]}
        />
        <CheckField
          label={t("profile.consent")}
          description={t("profile.consentHelp")}
          isSelected={draft.consent_granted}
          onChange={(value) => onChange({ ...draft, consent_granted: value })}
          error={consentError}
        />
        <div className="button-row">
          <Button type="submit">{t("profile.save")}</Button>
        </div>
      </form>
      <section className="stack" aria-labelledby="data-actions">
        <h2 id="data-actions">{t("profile.sectionData")}</h2>
        <p>{t("profile.dataActionsHelp")}</p>
        <h3>{t("profile.savedPlaces")}</h3>
        <p>{t("profile.savedPlacesBody")}</p>
        <div className="button-row">
          <Button
            variant="secondary"
            onPress={() => profile && download("the-app-preferences.txt", exportProfileText(profile, exportPhrases(language)), "text/plain")}
            isDisabled={!profile}
          >
            {t("profile.export")}
          </Button>
          <Button variant="secondary" onPress={() => profile && download("the-app-preferences.json", exportProfileJson(profile), "application/json")} isDisabled={!profile}>
            {t("profile.exportJson")}
          </Button>
          <Button ref={withdrawRef} variant="secondary" onPress={() => setConfirming("withdraw")} isDisabled={!activeConsent}>
            {t("profile.withdraw")}
          </Button>
          <Button ref={deleteRef} variant="secondary" onPress={() => setConfirming("delete")} isDisabled={!profile}>{t("profile.delete")}</Button>
        </div>
      </section>
      {confirming === "withdraw" ? (
        <ConfirmDialog
          title={t("profile.withdrawTitle")}
          body={t("profile.withdrawBody")}
          confirmLabel={t("profile.withdrawConfirm")}
          cancelLabel={t("profile.withdrawCancel")}
          onCancel={() => returnFocus("withdraw")}
          onConfirm={() => {
            void withdraw().then((stored) => {
              if (!stored) {
                returnFocus("withdraw");
                return;
              }
              setConfirming(null);
              setStatus("withdrawn");
              setIssues([]);
              setDraft(draftFromProfile(stored));
            });
          }}
        />
      ) : null}
      {confirming === "delete" ? (
        <ConfirmDialog
          title={t("profile.deleteTitle")}
          body={t("profile.deleteBody")}
          confirmLabel={t("profile.deleteConfirm")}
          cancelLabel={t("profile.deleteCancel")}
          onCancel={() => returnFocus("delete")}
          onConfirm={() => {
            void remove().then(() => {
              setConfirming(null);
              setStatus("deleted");
              setDraft(emptyDraft(language));
            });
          }}
        />
      ) : null}
    </div>
  );
}
