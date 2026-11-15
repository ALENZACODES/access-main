import { formatDate, t, tDynamic, type Lang } from "../i18n/index.ts";
import type { EquipmentSnapshot, Scope, SnapshotField } from "../types.ts";

export function describeField(lang: Lang, field: SnapshotField): string {
  return tDynamic(lang, `field.${field}`);
}

export function describeValue(lang: Lang, field: SnapshotField, value: EquipmentSnapshot[SnapshotField]): string {
  if (value === null || value === undefined) return t(lang, "value.unknown");
  if (typeof value === "boolean") return t(lang, value ? "value.yes" : "value.no");
  if (typeof value === "number") return t(lang, "value.mm", { n: value });
  return tDynamic(lang, field === "transfer_side_preference" ? `transfer.${value}` : `equipment.${value}`);
}

export function snapshotFields(scope: Scope): SnapshotField[] {
  return scope.kind === "equipment_snapshot" ? (Object.keys(scope.snapshot) as SnapshotField[]) : [];
}

/** One line for the owner: the kind, then what is in it. */
export function describeScope(lang: Lang, scope: Scope): string {
  const kind = tDynamic(lang, `scope.${scope.kind}`);
  const detail =
    scope.kind === "equipment_snapshot"
      ? snapshotFields(scope).map((field) => describeField(lang, field)).join(", ")
      : scope.label;
  return t(lang, "scope.summary", { kind, detail });
}

export function describeDate(lang: Lang, iso: string): string {
  return formatDate(lang, iso);
}
