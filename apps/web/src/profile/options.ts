export const EQUIPMENT_OPTIONS = [
  ["", "options.noAnswer"],
  ["power_chair", "options.powerChair"],
  ["manual_chair", "options.manualChair"],
  ["scooter", "options.scooter"],
  ["walker", "options.walker"],
  ["walking_with_chair_in_car", "options.walkingWithChair"],
  ["other", "options.other"],
  ["prefer_not_to_say", "options.preferNot"],
] as const;

export const TRANSFER_OPTIONS = [
  ["", "options.noAnswer"],
  ["left", "options.left"],
  ["right", "options.right"],
  ["both", "options.both"],
  ["front", "options.front"],
  ["prefer_not_to_say", "options.preferNot"],
] as const;

export const ROUTING_OPTIONS = [
  ["", "options.noAnswer"],
  ["low_slope", "options.lowSlope"],
  ["shortest_distance", "options.shortest"],
  ["charging_aware", "options.charging"],
  ["balanced", "options.balanced"],
] as const;

export const YES_NO = [
  ["", "options.noAnswer"],
  ["yes", "options.yes"],
  ["no", "options.no"],
] as const;

export const ON_OFF = [
  ["", "options.noAnswer"],
  ["yes", "options.on"],
  ["no", "options.off"],
] as const;

export const TEXT_OPTIONS = [
  ["system", "options.textSystem"],
  ["large", "options.textLarge"],
  ["extra_large", "options.textExtra"],
] as const;

export const MOTION_OPTIONS = [
  ["", "options.motionSystem"],
  ["reduce", "options.motionReduce"],
  ["allow", "options.motionAllow"],
] as const;

export function labelFor(t: (key: string) => string, options: ReadonlyArray<readonly [string, string]>, value: string): string {
  const match = options.find((option) => option[0] === value);
  return match ? t(match[1]) : t("onboarding.notSet");
}
