import { draftSchema, isPrivateChangeKey, type Change, type Draft } from "../../../../packages/contribute/src/schema";

type Changes = Draft["changes"];

export interface FieldEntry {
  field: string;
  value: string;
  unit: string;
  unknown: boolean;
}

export type FieldIssue = "keyFormat" | "privateKey" | "collision" | "capacity" | "emptyValue" | "longValue" | "longUnit";

export type FieldResult =
  | { ok: true; changes: Changes; key: string }
  | { ok: false; control: "field" | "value" | "unit"; issue: FieldIssue };

const changeRules = draftSchema.properties.changes;
const keyPattern = new RegExp(changeRules.propertyNames.pattern);
const valueLimit = changeRules.additionalProperties.properties.value.anyOf[0].maxLength;
const unitLimit = changeRules.additionalProperties.properties.unit.maxLength;

/** Only infer a decimal when writing it back will preserve the observation. */
function observedValue(text: string, original?: Change): Change["value"] {
  if (original && String(original.value) === text) return original.value;
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return text;
  const value = Number(text);
  if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) return text;
  // Widths like 85.50 can be numeric, while codes like 005 and rounded-off decimals stay text.
  const canonical = text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  return String(value) === canonical ? value : text;
}

export function entryForField(key: string, change: Change): FieldEntry {
  const unknown = change.value === "UNKNOWN";
  return { field: key, value: unknown ? "" : String(change.value), unit: change.unit ?? "", unknown };
}

export function recordField(changes: Changes, entry: FieldEntry, editingKey: string | null): FieldResult {
  const key = entry.field.trim().toLowerCase();
  if (!keyPattern.test(key)) return { ok: false, control: "field", issue: "keyFormat" };
  if (isPrivateChangeKey(key)) return { ok: false, control: "field", issue: "privateKey" };
  const alreadyRecorded = Object.hasOwn(changes, key);
  if (editingKey !== null && key !== editingKey && alreadyRecorded) {
    return { ok: false, control: "field", issue: "collision" };
  }
  const renaming = editingKey !== null && key !== editingKey && Object.hasOwn(changes, editingKey);
  if (!renaming && !alreadyRecorded && Object.keys(changes).length >= changeRules.maxProperties) {
    return { ok: false, control: "field", issue: "capacity" };
  }
  const sourceKey = editingKey ?? key;
  const original = Object.hasOwn(changes, sourceKey) ? changes[sourceKey] : undefined;
  const unchangedString = editingKey !== null && typeof original?.value === "string" && entry.value === original.value;
  const text = unchangedString ? entry.value : entry.value.trim();
  if (!entry.unknown && !unchangedString && text === "") return { ok: false, control: "value", issue: "emptyValue" };
  // JSON Schema counts Unicode code points. A supplementary character counts once.
  if (!entry.unknown && Array.from(text).length > valueLimit) {
    return { ok: false, control: "value", issue: "longValue" };
  }
  const unit = entry.unit.trim();
  if (Array.from(unit).length > unitLimit) return { ok: false, control: "unit", issue: "longUnit" };
  const change: Change = { value: entry.unknown ? "UNKNOWN" : observedValue(text, original) };
  if (unit) change.unit = unit;
  if (renaming) {
    // Keep the reviewed field in the same list position when its name changes.
    const renamed = Object.entries(changes).map(([name, previous]) =>
      name === editingKey ? [key, change] : [name, previous]
    );
    return { ok: true, changes: Object.fromEntries(renamed), key };
  }
  return { ok: true, changes: { ...changes, [key]: change }, key };
}

export const fieldCopy = {
  en: {
    keyFormat: "Start the field name with a letter. Use up to 80 letters a–z, numbers or underscores.",
    privateKey: "Use a field about the place. Personal and private information cannot be recorded here.",
    collision: "That field already exists. Choose another name or cancel and edit the other field.",
    capacity: "This draft has 100 fields. Edit or remove one before adding another.",
    emptyValue: "Enter what you observed or choose “I could not check”.",
    longValue: "Shorten the observed value to 1,000 characters.",
    longUnit: "Shorten the unit to 40 characters.",
    pending: "Apply or cancel this field before saving or exporting the draft.",
    editing: "Editing field",
    apply: "Apply field changes",
    cancel: "Cancel field edit",
    recorded: "Recorded field",
    removed: "Removed field",
  },
  fr: {
    keyFormat: "Commencez le nom par une lettre. Utilisez au plus 80 lettres de a à z, chiffres ou traits de soulignement.",
    privateKey: "Utilisez un champ qui décrit le lieu. Les renseignements personnels et privés sont exclus.",
    collision: "Ce champ existe déjà. Choisissez un autre nom ou annulez pour modifier l’autre champ.",
    capacity: "Ce brouillon contient 100 champs. Modifiez ou supprimez un champ avant d’en ajouter un autre.",
    emptyValue: "Entrez la valeur observée ou cochez « Je n’ai pas pu vérifier ».",
    longValue: "Limitez la valeur observée à 1 000 caractères.",
    longUnit: "Limitez l’unité à 40 caractères.",
    pending: "Appliquez ou annulez ce champ avant d’enregistrer ou d’exporter le brouillon.",
    editing: "Modification du champ",
    apply: "Appliquer les modifications au champ",
    cancel: "Annuler la modification du champ",
    recorded: "Champ enregistré",
    removed: "Champ supprimé",
  },
} as const;
