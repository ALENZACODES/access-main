import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { FieldIssue } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { CheckField } from "../design/fields.tsx";
import { emptyDraft, profileFromDraft, type ProfileDraft } from "../profile/draft.ts";
import { labelFor, EQUIPMENT_OPTIONS, ROUTING_OPTIONS } from "../profile/options.ts";
import { PreferenceFields } from "../profile/PreferenceFields.tsx";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

const STEPS = ["welcome", "language", "mobility", "display", "review"] as const;

export function OnboardingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { profile, save, setLanguage } = useProfileState();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>(() => emptyDraft(i18n.language.startsWith("fr") ? "fr" : "en"));
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useDocumentTitle(t("onboarding.title"));

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const language = i18n.language.startsWith("fr") ? "fr" : "en";
    setDraft((current) => ({ ...current, language_preference: language }));
  }, [i18n.language]);

  const current = STEPS[step] ?? "welcome";

  const onChange = (next: ProfileDraft) => {
    if (next.language_preference !== draft.language_preference) void setLanguage(next.language_preference);
    setDraft(next);
  };

  const saveAndLeave = async () => {
    const built = profileFromDraft(draft, profile, new Date().toISOString());
    if (!built.profile) {
      setIssues(built.issues);
      const mobility = built.issues.some((issue) => issue.field.startsWith("chair") || issue.field === "region_preference");
      setStep(mobility ? 2 : STEPS.length - 1);
      return;
    }
    await save(built.profile);
    void navigate("/");
  };

  return (
    <div className="stack">
      <h1>{t("onboarding.title")}</h1>
      <p>{t("onboarding.step", { current: step + 1, total: STEPS.length })}</p>
      <p>
        <Button variant="quiet" onPress={() => void navigate("/")}>{t("onboarding.skip")}</Button>
      </p>
      <h2 ref={headingRef} tabIndex={-1}>
        {t(`onboarding.${current}Title`)}
      </h2>
      {current === "welcome" ? <p>{t("onboarding.welcomeBody")}</p> : null}
      {current === "review" ? (
        <div className="stack">
          <p>{t("onboarding.reviewLead")}</p>
          <dl className="review-list">
            <div>
              <dt>{t("profile.equipment")}</dt>
              <dd>{draft.equipment_type_general ? labelFor(t, EQUIPMENT_OPTIONS, draft.equipment_type_general) : t("onboarding.notSet")}</dd>
            </div>
            <div>
              <dt>{t("profile.routing")}</dt>
              <dd>{draft.routing_preference ? labelFor(t, ROUTING_OPTIONS, draft.routing_preference) : t("onboarding.notSet")}</dd>
            </div>
          </dl>
          <p>{t("profile.privacy")}</p>
          <CheckField
            label={t("profile.consent")}
            description={t("profile.consentHelp")}
            isSelected={draft.consent_granted}
            onChange={(value) => onChange({ ...draft, consent_granted: value })}
            error={issues.some((issue) => issue.field === "consent") ? t("errors.consent_required") : undefined}
          />
        </div>
      ) : null}
      {current === "language" || current === "mobility" || current === "display" ? (
        <PreferenceFields
          draft={draft}
          onChange={onChange}
          issues={issues}
          sections={[current]}
          showHeadings={false}
        />
      ) : null}
      {issues.length > 0 ? <p role="alert">{t("errors.summary")}</p> : null}
      <div className="button-row">
        {step > 0 ? <Button variant="secondary" onPress={() => setStep((value) => value - 1)}>{t("onboarding.back")}</Button> : null}
        {current !== "review" ? (
          <Button onPress={() => setStep((value) => Math.min(value + 1, STEPS.length - 1))}>{t("onboarding.next")}</Button>
        ) : (
          <Button onPress={() => void saveAndLeave()}>{t("onboarding.save")}</Button>
        )}
      </div>
    </div>
  );
}
