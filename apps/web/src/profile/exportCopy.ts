import type { UserProfile } from "@access/shared";
import { en, type Messages } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { exportProfileText, type ExportPhrases } from "../storage/repository.ts";
import {
  EQUIPMENT_OPTIONS,
  MOTION_OPTIONS,
  ON_OFF,
  ROUTING_OPTIONS,
  TEXT_OPTIONS,
  TRANSFER_OPTIONS,
} from "./options.ts";

function messageAt(messages: Messages, path: string): string {
  const [group, name] = path.split(".");
  if (!group || !name) return "";
  const table = messages[group as keyof Messages];
  if (!table || typeof table !== "object") return "";
  const value = (table as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

function optionNames(messages: Messages, rows: ReadonlyArray<readonly [string, string]>): Record<string, string> {
  const names: Record<string, string> = {};
  for (const [value, key] of rows) {
    if (!value) continue;
    const label = messageAt(messages, key);
    if (label) names[value] = label;
  }
  return names;
}

/** Labels and choice names for the plain-text export, in the UI language. */
export function exportPhrases(language: "en" | "fr"): ExportPhrases {
  const messages = language === "fr" ? fr : en;
  const motionReduce = MOTION_OPTIONS.find((row) => row[0] === "reduce");
  const motionAllow = MOTION_OPTIONS.find((row) => row[0] === "allow");
  const on = ON_OFF.find((row) => row[0] === "yes");
  const off = ON_OFF.find((row) => row[0] === "no");
  return {
    title: messages.profile.exportTitle,
    empty: messages.profile.exportEmpty,
    language: messages.profile.sectionLanguage,
    languageName: { en: messages.language.english, fr: messages.language.french },
    region: messages.profile.regionLabel,
    equipment: messages.profile.equipment,
    equipmentName: optionNames(messages, EQUIPMENT_OPTIONS),
    width: messages.profile.width,
    length: messages.profile.length,
    transfer: messages.profile.transfer,
    transferName: optionNames(messages, TRANSFER_OPTIONS),
    attendant: messages.profile.attendant,
    yes: messages.options.yes,
    no: messages.options.no,
    routing: messages.profile.routing,
    routingName: optionNames(messages, ROUTING_OPTIONS),
    textSize: messages.profile.textSize,
    textSizeName: optionNames(messages, TEXT_OPTIONS),
    motion: messages.profile.motion,
    motionReduce: motionReduce ? messageAt(messages, motionReduce[1]) : "",
    motionAllow: motionAllow ? messageAt(messages, motionAllow[1]) : "",
    contrast: messages.profile.contrast,
    on: on ? messageAt(messages, on[1]) : "",
    off: off ? messageAt(messages, off[1]) : "",
    screenReader: messages.profile.screenReader,
    switchOrVoice: messages.profile.switchUser,
    wifi: messages.profile.wifi,
    storage: messages.profile.storageLimit,
    consent: messages.profile.exportConsent,
    withdrawn: messages.profile.exportWithdrawn,
  };
}

export function exportProfileInLanguage(profile: UserProfile, language: "en" | "fr"): string {
  return exportProfileText(profile, exportPhrases(language));
}
