import type { FieldIssue } from "@access/shared";
import { useTranslation } from "react-i18next";
import { ChoiceGroup, TextInput, CheckField } from "../design/fields.tsx";
import {
  EQUIPMENT_OPTIONS,
  MOTION_OPTIONS,
  ON_OFF,
  ROUTING_OPTIONS,
  TEXT_OPTIONS,
  TRANSFER_OPTIONS,
  YES_NO,
} from "./options.ts";
import type { ProfileDraft } from "./draft.ts";

function choices(t: (key: string) => string, rows: ReadonlyArray<readonly [string, string]>) {
  return rows.map(([value, key]) => ({ value, label: t(key) }));
}

export function PreferenceFields({
  draft,
  onChange,
  issues,
  sections,
  showHeadings = true,
}: {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  issues: FieldIssue[];
  sections: Array<"language" | "mobility" | "display" | "offline">;
  showHeadings?: boolean;
}) {
  const { t } = useTranslation();
  const error = (field: string) => {
    const issue = issues.find((item) => item.field === field);
    if (!issue) return undefined;
    return t(`errors.${issue.code}`, { defaultValue: t("errors.generic") });
  };
  const patch = (partial: Partial<ProfileDraft>) => onChange({ ...draft, ...partial });

  return (
    <div className="stack">
      {sections.includes("language") ? (
        <section className="stack" aria-labelledby={showHeadings ? "section-language" : undefined}>
          {showHeadings ? <h2 id="section-language">{t("profile.sectionLanguage")}</h2> : null}
          <ChoiceGroup
            label={t("language.label")}
            value={draft.language_preference}
            onChange={(value) => patch({ language_preference: value === "fr" ? "fr" : "en" })}
            options={[
              { value: "en", label: t("language.english") },
              { value: "fr", label: t("language.french") },
            ]}
          />
        </section>
      ) : null}
      {sections.includes("mobility") ? (
        <section className="stack" aria-labelledby={showHeadings ? "section-mobility" : undefined}>
          {showHeadings ? <h2 id="section-mobility">{t("profile.sectionMobility")}</h2> : null}
          <p className="field-help">{t("profile.equipmentHelp")}</p>
          <ChoiceGroup
            label={t("profile.equipment")}
            value={draft.equipment_type_general}
            onChange={(value) => patch({ equipment_type_general: value })}
            options={choices(t, EQUIPMENT_OPTIONS)}
          />
          <ChoiceGroup
            label={t("profile.transfer")}
            value={draft.transfer_side_preference}
            onChange={(value) => patch({ transfer_side_preference: value })}
            options={choices(t, TRANSFER_OPTIONS)}
          />
          <ChoiceGroup
            label={t("profile.attendant")}
            description={t("profile.optionalHint")}
            value={draft.attendant_travels}
            onChange={(value) => patch({ attendant_travels: value })}
            options={choices(t, YES_NO)}
          />
          <TextInput
            label={t("profile.width")}
            description={t("profile.dimensionsHelp")}
            value={draft.chair_width_mm}
            onChange={(value) => patch({ chair_width_mm: value })}
            error={error("chair_width_mm")}
            inputMode="numeric"
          />
          <TextInput
            label={t("profile.length")}
            description={t("profile.blankOk")}
            value={draft.chair_length_mm}
            onChange={(value) => patch({ chair_length_mm: value })}
            error={error("chair_length_mm")}
            inputMode="numeric"
          />
          <TextInput
            label={t("profile.regionLabel")}
            description={t("profile.regionHelp")}
            value={draft.region_preference}
            onChange={(value) => patch({ region_preference: value })}
            error={error("region_preference")}
          />
          <ChoiceGroup
            label={t("profile.routing")}
            value={draft.routing_preference}
            onChange={(value) => patch({ routing_preference: value })}
            options={choices(t, ROUTING_OPTIONS)}
          />
        </section>
      ) : null}
      {sections.includes("display") ? (
        <section className="stack" aria-labelledby={showHeadings ? "section-display" : undefined}>
          {showHeadings ? <h2 id="section-display">{t("profile.sectionDisplay")}</h2> : null}
          <ChoiceGroup
            label={t("profile.textSize")}
            value={draft.text_size_preference}
            onChange={(value) => patch({ text_size_preference: value === "large" || value === "extra_large" ? value : "system" })}
            options={choices(t, TEXT_OPTIONS)}
          />
          <ChoiceGroup
            label={t("profile.motion")}
            value={draft.reduced_motion_preference}
            onChange={(value) => patch({ reduced_motion_preference: value })}
            options={choices(t, MOTION_OPTIONS)}
          />
          <ChoiceGroup
            label={t("profile.contrast")}
            value={draft.high_contrast_preference}
            onChange={(value) => patch({ high_contrast_preference: value })}
            options={choices(t, ON_OFF)}
          />
          <ChoiceGroup
            label={t("profile.screenReader")}
            description={t("profile.optionalHint")}
            value={draft.screen_reader_user}
            onChange={(value) => patch({ screen_reader_user: value })}
            options={choices(t, YES_NO)}
          />
          <ChoiceGroup
            label={t("profile.switchUser")}
            description={t("profile.optionalHint")}
            value={draft.switch_or_voice_user}
            onChange={(value) => patch({ switch_or_voice_user: value })}
            options={choices(t, YES_NO)}
          />
        </section>
      ) : null}
      {sections.includes("offline") ? (
        <section className="stack" aria-labelledby={showHeadings ? "section-offline" : undefined}>
          {showHeadings ? <h2 id="section-offline">{t("profile.sectionOffline")}</h2> : null}
          <CheckField
            label={t("profile.wifi")}
            isSelected={draft.wifi_only}
            onChange={(value) => patch({ wifi_only: value })}
          />
          <TextInput
            label={t("profile.storageLimit")}
            description={t("profile.storageHelp")}
            value={draft.storage_limit_mb}
            onChange={(value) => patch({ storage_limit_mb: value })}
            error={error("storage_limit_mb")}
            inputMode="numeric"
          />
        </section>
      ) : null}
    </div>
  );
}
