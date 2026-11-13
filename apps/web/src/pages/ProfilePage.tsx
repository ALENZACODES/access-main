import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FieldIssue } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { ConfirmDialog } from "../design/ConfirmDialog.tsx";
import { draftFromProfile, emptyDraft, profileFromDraft, type ProfileDraft } from "../profile/draft.ts";
import { PreferenceFields } from "../profile/PreferenceFields.tsx";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { exportProfileJson } from "../storage/repository.ts";
import { StorageError } from "../storage/repository.ts";

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { profile, ready, save, remove, setLanguage } = useProfileState();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [status, setStatus] = useState<"idle" | "saved" | "deleted" | "error">("idle");
  const [confirming, setConfirming] = useState(false);
  const loaded = useRef(false);
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

  const onExport = () => {
    if (!profile) return;
    const blob = new Blob([exportProfileJson(profile)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "the-app-preferences.json";
    link.click();
    URL.revokeObjectURL(url);
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
      {status === "deleted" ? <p role="status">{t("profile.deleted")}</p> : null}
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
          sections={["language", "mobility", "timing", "display", "offline"]}
        />
        <div className="button-row">
          <Button type="submit">{t("profile.save")}</Button>
        </div>
      </form>
      <section className="stack" aria-labelledby="data-actions">
        <h2 id="data-actions">{t("profile.sectionData")}</h2>
        <h3>{t("profile.savedPlaces")}</h3>
        <p>{t("profile.savedPlacesBody")}</p>
        <div className="button-row">
          <Button variant="secondary" onPress={onExport} isDisabled={!profile}>{t("profile.export")}</Button>
          <Button variant="secondary" onPress={() => setConfirming(true)} isDisabled={!profile}>{t("profile.delete")}</Button>
        </div>
      </section>
      {confirming ? (
        <ConfirmDialog
          title={t("profile.deleteTitle")}
          body={t("profile.deleteBody")}
          confirmLabel={t("profile.deleteConfirm")}
          cancelLabel={t("profile.deleteCancel")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void remove().then(() => {
              setConfirming(false);
              setStatus("deleted");
              setDraft(emptyDraft(i18n.language.startsWith("fr") ? "fr" : "en"));
            });
          }}
        />
      ) : null}
    </div>
  );
}
