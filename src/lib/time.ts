import { DateTime } from "luxon";
export const ZONE = "Europe/Berlin";
export function berlin(value: string) {
  const date = DateTime.fromISO(value, { zone: ZONE });
  if (!date.isValid) throw new Error("Ungültiges Datum.");
  if (date.getPossibleOffsets().length > 1)
    throw new Error(
      "Diese Uhrzeit ist wegen der Zeitumstellung mehrdeutig. Bitte eine andere Uhrzeit wählen oder per ICS mit UTC importieren.",
    );
  if (date.toFormat("yyyy-MM-dd'T'HH:mm") !== value)
    throw new Error("Diese Uhrzeit existiert wegen der Zeitumstellung nicht.");
  return date.toJSDate();
}
export function format(value: Date, pattern = "dd.MM. · HH:mm") {
  return DateTime.fromJSDate(value, { zone: ZONE })
    .setLocale("de")
    .toFormat(pattern);
}
export function currentWeek(offset = 0) {
  return DateTime.now().setZone(ZONE).startOf("week").plus({ weeks: offset });
}
