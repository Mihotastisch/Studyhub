import { describe, it, expect } from "vitest";
import { IcsCalendarProvider } from "../src/providers/ics";
import { berlin } from "../src/lib/time";
const provider = new IcsCalendarProvider();
const wrap = (s: string) =>
  `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Test//DE\n${s}\nEND:VCALENDAR`;
const base = `BEGIN:VEVENT\nUID:lecture\nDTSTART;TZID=Europe/Berlin:20261019T100000\nDTEND;TZID=Europe/Berlin:20261019T113000\nRRULE:FREQ=WEEKLY;COUNT=4\nEXDATE;TZID=Europe/Berlin:20261102T100000\nSUMMARY:Vorlesung\nEND:VEVENT`;
const from = new Date("2026-10-01"),
  to = new Date("2026-12-01");
describe("ICS-Kalender", () => {
  it("verwendet mitgelieferte VTIMEZONE-Definitionen", () => {
    const zone =
      "BEGIN:VTIMEZONE\nTZID:Test/Fixed\nBEGIN:STANDARD\nDTSTART:19700101T000000\nTZOFFSETFROM:+0300\nTZOFFSETTO:+0300\nEND:STANDARD\nEND:VTIMEZONE";
    const event =
      "BEGIN:VEVENT\nUID:zone\nDTSTART;TZID=Test/Fixed:20261020T100000\nDTEND;TZID=Test/Fixed:20261020T110000\nEND:VEVENT";
    expect(
      provider
        .parse(wrap(zone + "\n" + event), from, to)[0]
        .start.toISOString(),
    ).toBe("2026-10-20T07:00:00.000Z");
  });
  it("berücksichtigt in das Importfenster verschobene Ausnahmen", () => {
    const exception =
      "BEGIN:VEVENT\nUID:lecture\nRECURRENCE-ID;TZID=Europe/Berlin:20261019T100000\nDTSTART;TZID=Europe/Berlin:20261115T120000\nDTEND;TZID=Europe/Berlin:20261115T133000\nEND:VEVENT";
    const entries = provider.parse(
      wrap(base + "\n" + exception),
      new Date("2026-11-14"),
      to,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].start.toISOString()).toBe("2026-11-15T11:00:00.000Z");
  });
  it("weist unvollständige und widersprüchliche Serien ab", () => {
    expect(() => provider.parse(wrap(base + "\n" + base), from, to)).toThrow(
      "UID",
    );
    const exception =
      "BEGIN:VEVENT\nUID:missing\nRECURRENCE-ID:20261020T100000Z\nDTSTART:20261020T120000Z\nDTEND:20261020T130000Z\nEND:VEVENT";
    expect(() => provider.parse(wrap(exception), from, to)).toThrow(
      "Haupttermin",
    );
  });
  it("weist mehrdeutige manuelle Berliner Uhrzeiten ab", () => {
    expect(() => berlin("2026-10-25T02:30")).toThrow("mehrdeutig");
  });
  it("expandiert Serien und EXDATE über die Zeitumstellung korrekt", () => {
    const items = provider.parse(wrap(base), from, to);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.start.toISOString())).toEqual([
      "2026-10-19T08:00:00.000Z",
      "2026-10-26T09:00:00.000Z",
      "2026-11-09T09:00:00.000Z",
    ]);
  });
  it("verschiebt Einzelvorkommen mit stabiler Wiederholungskennung", () => {
    const exception = `BEGIN:VEVENT\nUID:lecture\nRECURRENCE-ID;TZID=Europe/Berlin:20261026T100000\nDTSTART;TZID=Europe/Berlin:20261027T120000\nDTEND;TZID=Europe/Berlin:20261027T133000\nSUMMARY:Verschoben\nEND:VEVENT`;
    const items = provider.parse(wrap(base + "\n" + exception), from, to);
    expect(items).toHaveLength(3);
    expect(items[1].start.toISOString()).toBe("2026-10-27T11:00:00.000Z");
    expect(items[1].externalId).toContain("2026-10-26");
    expect(items[1].title).toBe("Verschoben");
  });
  it("lässt abgesagte Einzelvorkommen weg", () => {
    const exception = `BEGIN:VEVENT\nUID:lecture\nRECURRENCE-ID;TZID=Europe/Berlin:20261026T100000\nDTSTART;TZID=Europe/Berlin:20261026T100000\nDTEND;TZID=Europe/Berlin:20261026T113000\nSTATUS:CANCELLED\nEND:VEVENT`;
    expect(
      provider.parse(wrap(base + "\n" + exception), from, to),
    ).toHaveLength(2);
  });
  it("verarbeitet UTC, RDATE und ganztägige Termine", () => {
    const content = `BEGIN:VEVENT\nUID:date\nDTSTART;VALUE=DATE:20261020\nDTEND;VALUE=DATE:20261022\nSUMMARY:Block\nEND:VEVENT\nBEGIN:VEVENT\nUID:utc\nDTSTART:20261020T080000Z\nDTEND:20261020T090000Z\nRDATE:20261022T080000Z\nEND:VEVENT`;
    const items = provider.parse(wrap(content), from, to);
    expect(items).toHaveLength(3);
    expect(items[0].allDay).toBe(true);
    expect(items[1].start.toISOString()).toBe("2026-10-20T08:00:00.000Z");
  });
  it("interpretiert floating times in Berlin", () => {
    const items = provider.parse(
      wrap(
        "BEGIN:VEVENT\nUID:float\nDTSTART:20261020T100000\nDTEND:20261020T110000\nEND:VEVENT",
      ),
      from,
      to,
    );
    expect(items[0].start.toISOString()).toBe("2026-10-20T08:00:00.000Z");
  });
  it("weist ungültige Dateien und unbekannte Zeitzonen ab", () => {
    expect(() => provider.parse("kaputt", from, to)).toThrow();
    expect(() =>
      provider.parse(
        wrap(base.replaceAll("Europe/Berlin", "Unknown/Zone")),
        from,
        to,
      ),
    ).toThrow("Zeitzone");
    expect(() => provider.parse("a".repeat(2_000_001), from, to)).toThrow(
      "2 MB",
    );
  });
  it("weist nicht existierende Berliner Eingabezeiten ab", () => {
    expect(() => berlin("2026-03-29T02:30")).toThrow("Zeitumstellung");
  });
});
