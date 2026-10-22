import ICAL from "ical.js";
import { DateTime } from "luxon";
import { CalendarProvider, CalendarEntry } from "./contracts";
const berlinZone = `BEGIN:VTIMEZONE\nTZID:Europe/Berlin\nBEGIN:DAYLIGHT\nDTSTART:19960331T020000\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\nEND:DAYLIGHT\nBEGIN:STANDARD\nDTSTART:19961027T030000\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\nEND:STANDARD\nEND:VTIMEZONE`;
function date(t: ICAL.Time) {
  return t.zone.tzid === "floating" || t.isDate
    ? DateTime.fromObject(
        {
          year: t.year,
          month: t.month,
          day: t.day,
          hour: t.hour,
          minute: t.minute,
          second: t.second,
        },
        { zone: "Europe/Berlin" },
      ).toJSDate()
    : t.toJSDate();
}
export class IcsCalendarProvider implements CalendarProvider {
  parse(content: string, from: Date, to: Date): CalendarEntry[] {
    if (Buffer.byteLength(content) > 2_000_000)
      throw new Error("Die ICS-Datei darf maximal 2 MB groß sein.");
    if (!(from < to) || to.getTime() - from.getTime() > 737 * 86400000)
      throw new Error("Importzeitraum: maximal zwei Jahre.");
    const root = new ICAL.Component(ICAL.parse(content));
    if (root.name !== "vcalendar")
      throw new Error("Keine gültige Kalenderdatei.");
    ICAL.TimezoneService.reset();
    ICAL.TimezoneService.register(
      new ICAL.Timezone(new ICAL.Component(ICAL.parse(berlinZone))),
    );
    for (const zone of root.getAllSubcomponents("vtimezone"))
      ICAL.TimezoneService.register(new ICAL.Timezone(zone));
    for (const component of root.getAllSubcomponents("vevent"))
      for (const prop of component.getAllProperties()) {
        const tz = prop.getParameter("tzid");
        if (tz && !ICAL.TimezoneService.has(String(tz)))
          throw new Error(`Unbekannte Zeitzone: ${tz}. VTIMEZONE fehlt.`);
        if (prop.name === "recurrence-id" && prop.getParameter("range"))
          throw new Error(
            "RANGE-Ausnahmen werden in Version 0.1 nicht unterstützt.",
          );
      }
    const events = root
      .getAllSubcomponents("vevent")
      .map((c) => new ICAL.Event(c));
    const masters = events.filter((e) => !e.isRecurrenceException());
    if (new Set(masters.map((e) => e.uid)).size !== masters.length)
      throw new Error(
        "Mehrere Haupttermine mit derselben UID. Bitte einen vollständigen Kalenderexport verwenden.",
      );
    if (
      events.some(
        (e) =>
          e.isRecurrenceException() && !masters.some((m) => m.uid === e.uid),
      )
    )
      throw new Error(
        "Einzelne Serienausnahme ohne Haupttermin. Bitte die vollständige Serie exportieren.",
      );
    const result = new Map<string, CalendarEntry>();
    let steps = 0;
    const add = (
      event: ICAL.Event,
      id: ICAL.Time | string,
      start: ICAL.Time,
      end: ICAL.Time,
    ) => {
      if (event.component.getFirstPropertyValue("status") === "CANCELLED")
        return;
      const a = date(start),
        b = date(end);
      if (!Number.isFinite(+a) || !Number.isFinite(+b) || b < a)
        throw new Error("Ungültige Termindauer.");
      if (a >= to || b < from) return;
      const externalId = `${event.uid}::${id.toString()}`;
      result.set(externalId, {
        externalId,
        title: event.summary || "Ohne Titel",
        description: event.description || "",
        location: event.location || "",
        start: a,
        end: b,
        allDay: start.isDate,
      });
      if (result.size > 10000)
        throw new Error("Maximal 10.000 Vorkommen pro Import.");
    };
    for (const event of events.filter((e) => !e.isRecurrenceException())) {
      if (!event.uid || !event.component.hasProperty("dtstart"))
        throw new Error("UID oder DTSTART fehlt.");
      if (event.component.getFirstPropertyValue("status") === "CANCELLED")
        continue;
      if (!event.isRecurring() && !event.component.hasProperty("rdate")) {
        // A non-recurring event keeps its identity even when DTSTART changes.
        add(event, "single", event.startDate, event.endDate);
        continue;
      }
      // ICAL's RDATE-only expansion does not emit DTSTART automatically.
      if (!event.component.hasProperty("rrule")) {
        const excluded = event.component
          .getAllProperties("exdate")
          .flatMap((p) => p.getValues())
          .some((t) => String(t) === event.startDate.toString());
        if (!excluded) {
          const detail = event.getOccurrenceDetails(event.startDate);
          add(detail.item, event.startDate, detail.startDate, detail.endDate);
        }
      }
      const iterator = event.iterator();
      let occurrence;
      while ((occurrence = iterator.next())) {
        if (++steps > 100000)
          throw new Error(
            "Kalenderserie zu komplex oder zu alt (100.000 Iterationen).",
          );
        if (date(occurrence) >= to) break;
        const detail = event.getOccurrenceDetails(occurrence);
        add(detail.item, occurrence, detail.startDate, detail.endDate);
      }
      // Auch in den Zeitraum verschobene Ausnahmen mit ursprünglichem Datum außerhalb berücksichtigen.
      for (const exception of events.filter(
        (e) => e.uid === event.uid && e.isRecurrenceException(),
      ))
        add(
          exception,
          exception.recurrenceId,
          exception.startDate,
          exception.endDate,
        );
    }
    return [...result.values()].sort((a, b) => +a.start - +b.start);
  }
}
