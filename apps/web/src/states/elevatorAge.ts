/**
 * How long ago a notice was last checked, counted in whole days from the UTC day of the check to a
 * `today` the caller supplies. The result is the same on every device for the same inputs. Even a
 * notice checked today is a saved copy: no band here ever says an elevator is working.
 */
import type { ElevatorNotice } from "./packElevators";
import { daysBetween, formatDate } from "./provenance";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

/** Upper bounds, in days, of the bands. The last band is everything older than the last bound. */
export const ELEVATOR_AGE_LIMITS = [0, 3, 7] as const;
export type ElevatorAgeBand = "same-day" | "within-3" | "within-week" | "older" | "future" | "unknown";

export const ELEVATOR_AGE_BANDS: readonly ElevatorAgeBand[] = ["same-day", "within-3", "within-week", "older", "future", "unknown"];

export function bandForDays(days: number): ElevatorAgeBand {
  if (!Number.isFinite(days)) return "unknown";
  if (days < 0) return "future";
  if (days <= ELEVATOR_AGE_LIMITS[0]) return "same-day";
  if (days <= ELEVATOR_AGE_LIMITS[1]) return "within-3";
  if (days <= ELEVATOR_AGE_LIMITS[2]) return "within-week";
  return "older";
}

export interface NoticeAge {
  /** Whole days from the check to today; null when the check time is not known. */
  readonly days: number | null;
  readonly band: ElevatorAgeBand;
}

export function noticeAge(notice: Pick<ElevatorNotice, "checkedDay">, today: string): NoticeAge {
  if (notice.checkedDay === null) return { days: null, band: "unknown" };
  const days = daysBetween(notice.checkedDay, today);
  return { days, band: bandForDays(days) };
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** "Last checked on 13 November 2026, 8 days before today. This is a saved copy." */
export function ageLine(notice: Pick<ElevatorNotice, "checkedDay">, age: NoticeAge, locale: Locale): string {
  if (notice.checkedDay === null || age.days === null) {
    return t(locale, "The time this notice was last checked is not recorded.", "L’heure du dernier contrôle de cet avis n’est pas indiquée.");
  }
  const date = formatDate(notice.checkedDay, locale);
  if (age.band === "future") {
    return t(
      locale,
      `The pack says this notice was checked on ${date}, which is after today. The date cannot be right.`,
      `Le lot indique que cet avis a été contrôlé le ${date}, soit après aujourd’hui. La date ne peut pas être juste.`,
    );
  }
  if (age.days === 0) {
    return t(locale, `Last checked on ${date}, today. This is a saved copy.`, `Dernier contrôle le ${date}, aujourd’hui. Ceci est une copie enregistrée.`);
  }
  const n = age.days;
  return t(
    locale,
    `Last checked on ${date}, ${n} ${plural(n, "day", "days")} before today. This is a saved copy.`,
    `Dernier contrôle le ${date}, ${n} ${plural(n, "jour", "jours")} avant aujourd’hui. Ceci est une copie enregistrée.`,
  );
}

export function bandName(band: ElevatorAgeBand, locale: Locale): string {
  switch (band) {
    case "same-day":
      return t(locale, "Checked today", "Contrôlé aujourd’hui");
    case "within-3":
      return t(locale, "Checked 1 to 3 days ago", "Contrôlé il y a 1 à 3 jours");
    case "within-week":
      return t(locale, "Checked 4 to 7 days ago", "Contrôlé il y a 4 à 7 jours");
    case "older":
      return t(locale, "Checked more than a week ago", "Contrôlé il y a plus d’une semaine");
    case "future":
      return t(locale, "Check date is after today", "Date de contrôle postérieure à aujourd’hui");
    case "unknown":
      return t(locale, "Check time not recorded", "Heure de contrôle non indiquée");
  }
}
