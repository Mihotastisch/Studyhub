import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  saveCourse,
  deleteCourse,
  saveItem,
  importCalendar,
} from "../src/lib/service";
import { subscribeCalendar, syncSubscription } from "../src/lib/subscriptions";
import { localSource } from "../src/lib/service";
let db: PrismaClient;
let directory: string;
const from = new Date("2026-01-01"),
  to = new Date("2027-01-01");
const ics = (title = "Original") =>
  `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:test\nDTSTART:20261022T080000Z\nDTEND:20261022T100000Z\nSUMMARY:${title}\nEND:VEVENT\nEND:VCALENDAR`;
beforeAll(async () => {
  vi.stubEnv("CALENDAR_URL_KEY", Buffer.alloc(32, 3).toString("base64"));
  vi.stubEnv("CALENDAR_ALLOWED_HOSTS", "my.uni-bayreuth.de");
  directory = await mkdtemp(join(tmpdir(), "studyhub-test-"));
  db = new PrismaClient({
    datasources: {
      db: { url: `file:${join(directory, "test.db").replaceAll("\\", "/")}` },
    },
  });
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  for (const folder of (
    await readdir("prisma/migrations", { withFileTypes: true })
  )
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = await readFile(
      `prisma/migrations/${folder.name}/migration.sql`,
      "utf8",
    );
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await db.$executeRawUnsafe(statement);
  }
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe("SQLite-Datenoperationen", () => {
  it("validiert, erstellt und bearbeitet Module", async () => {
    await expect(
      saveCourse(db, { title: "", code: "X", color: "#123456" }),
    ).rejects.toThrow();
    const course = await saveCourse(db, {
      title: "Mathematik",
      code: "MAT",
      color: "#123456",
    });
    const updated = await saveCourse(
      db,
      { title: "Mathematik I", code: "MAT", color: "#123456" },
      course.id,
    );
    expect(updated.title).toBe("Mathematik I");
  });
  it("speichert Aufgaben/Klausuren, sortiert Fälligkeiten und erhält Daten beim Modul-Löschen", async () => {
    const course = await saveCourse(db, {
      title: "Testmodul",
      code: "T",
      color: "#123456",
    });
    const data = {
      title: "Abgabe",
      description: "Test",
      dueAt: new Date("2026-11-01"),
      courseId: course.id,
      reminderMinutes: 1440,
    };
    const task = await saveItem(db, "task", data);
    await saveItem(db, "task", {
      ...data,
      title: "Früher",
      dueAt: new Date("2026-10-01"),
    });
    await saveItem(db, "exam", { ...data, title: "Klausur" });
    await db.task.update({ where: { id: task.id }, data: { done: true } });
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: task.id } })).done,
    ).toBe(true);
    expect(
      (await db.task.findMany({ orderBy: { dueAt: "asc" } }))[0].title,
    ).toBe("Früher");
    await deleteCourse(db, course.id);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: task.id } })).courseId,
    ).toBeNull();
    expect(await db.exam.count()).toBe(1);
  });
  it("importiert ohne Duplikate, aktualisiert und entfernt alte Vorkommen", async () => {
    await importCalendar(db, "test", "Testquelle", ics(), from, to);
    await importCalendar(
      db,
      "test",
      "Testquelle",
      ics("Aktualisiert"),
      from,
      to,
    );
    expect(await db.calendarEvent.count()).toBe(1);
    expect((await db.calendarEvent.findFirstOrThrow()).title).toBe(
      "Aktualisiert",
    );
    expect((await db.calendarEvent.findFirstOrThrow()).sourceId).toBe(
      "ics:test",
    );
    await expect(
      importCalendar(db, "test", "Testquelle", "kaputt", from, to),
    ).rejects.toThrow();
    expect(await db.calendarEvent.count()).toBe(1);
    await importCalendar(
      db,
      "test",
      "Testquelle",
      "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR",
      from,
      to,
    );
    expect(await db.calendarEvent.count()).toBe(0);
  });
  it("rollt den Import bei ungültiger Modulreferenz vollständig zurück", async () => {
    await importCalendar(db, "atomic", "Atomic", ics(), from, to);
    await expect(
      importCalendar(db, "atomic", "Atomic", ics("Neu"), from, to, "missing"),
    ).rejects.toThrow();
    expect(
      (
        await db.calendarEvent.findFirstOrThrow({
          where: { sourceId: "ics:atomic" },
        })
      ).title,
    ).toBe("Original");
  });
  it("erhält manuelle Termine und fremde Dateiimporte beim Datei-Reimport", async () => {
    await localSource(db);
    const manual = await db.calendarEvent.create({
      data: {
        title: "Manueller Termin",
        externalId: "test",
        sourceId: "local",
        start: new Date("2026-10-22T08:00Z"),
        end: new Date("2026-10-22T10:00Z"),
      },
    });
    await importCalendar(
      db,
      "preserved",
      "Andere Datei",
      ics("Andere Datei"),
      from,
      to,
    );
    await importCalendar(db, "isolation", "Dateiquelle", ics(), from, to);
    await importCalendar(
      db,
      "isolation",
      "Dateiquelle",
      ics("Änderung"),
      from,
      to,
    );
    expect(
      await db.calendarEvent.findUnique({ where: { id: manual.id } }),
    ).toEqual(manual);
    expect(
      (
        await db.calendarEvent.findFirstOrThrow({
          where: { sourceId: "ics:preserved" },
        })
      ).title,
    ).toBe("Andere Datei");
    expect(
      await db.calendarEvent.count({ where: { sourceId: "ics:isolation" } }),
    ).toBe(1);
  });
  it("abonniert denselben Link ohne Duplikate und aktualisiert auch verschobene Einzeltermine", async () => {
    const url =
      "https://my.uni-bayreuth.de/calendar.ics?token=TEST_ONLY_SUBSCRIPTION";
    const download = vi.fn(async () => ics());
    await subscribeCalendar(db, { url, from, to }, download);
    const source = await db.syncSource.findFirstOrThrow({
      where: { kind: "ICS_URL" },
    });
    const original = await db.calendarEvent.findFirstOrThrow({
      where: { sourceId: source.id },
    });
    expect(source.rawIcs).toBeNull();
    expect(JSON.stringify(source)).not.toContain(url);
    expect(source.subscriptionUrlEncrypted).toMatch(/^v1\./);
    download.mockResolvedValue(
      ics("Geändert")
        .replace("20261022T080000Z", "20261023T100000Z")
        .replace("20261022T100000Z", "20261023T120000Z"),
    );
    await subscribeCalendar(db, { url, from, to }, download);
    await syncSubscription(db, source.id, download);
    expect(await db.syncSource.count({ where: { kind: "ICS_URL" } })).toBe(1);
    expect(
      await db.calendarEvent.count({ where: { sourceId: source.id } }),
    ).toBe(1);
    const changed = await db.calendarEvent.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(changed.title).toBe("Geändert");
    expect(changed.start.toISOString()).toBe("2026-10-23T10:00:00.000Z");
  });
  it("behält fehlende Vorkommen, markiert sie und verändert keine fremden Termine", async () => {
    const source = await db.syncSource.findFirstOrThrow({
      where: { kind: "ICS_URL" },
    });
    const others = await db.calendarEvent.findMany({
      where: { sourceId: { not: source.id } },
      orderBy: { id: "asc" },
    });
    const before = await db.calendarEvent.findMany({
      where: { sourceId: source.id },
    });
    await syncSubscription(
      db,
      source.id,
      async () => "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR",
    );
    const after = await db.calendarEvent.findMany({
      where: { sourceId: source.id },
    });
    expect(after).toHaveLength(before.length);
    expect(after.every((e) => e.missingFromFeed)).toBe(true);
    expect(
      await db.calendarEvent.findMany({
        where: { sourceId: { not: source.id } },
        orderBy: { id: "asc" },
      }),
    ).toEqual(others);
    await syncSubscription(db, source.id, async () => ics("Wieder da"));
    expect(
      (
        await db.calendarEvent.findFirstOrThrow({
          where: { sourceId: source.id },
        })
      ).missingFromFeed,
    ).toBe(false);
  });
  it("übernimmt Serienänderungen mit EXDATE und RECURRENCE-ID ohne Duplikate", async () => {
    const url =
      "https://my.uni-bayreuth.de/recurring.ics?token=TEST_ONLY_SERIES";
    const master =
      "BEGIN:VEVENT\nUID:series\nDTSTART;TZID=Europe/Berlin:20261019T100000\nDTEND;TZID=Europe/Berlin:20261019T110000\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Serie\nEND:VEVENT";
    const wrap = (s: string) =>
      `BEGIN:VCALENDAR\nVERSION:2.0\n${s}\nEND:VCALENDAR`;
    await subscribeCalendar(db, { url, from, to }, async () => wrap(master));
    const original = await db.calendarEvent.findFirstOrThrow({
      where: { title: "Serie", start: new Date("2026-10-26T09:00Z") },
    });
    const exception =
      "BEGIN:VEVENT\nUID:series\nRECURRENCE-ID;TZID=Europe/Berlin:20261026T100000\nDTSTART;TZID=Europe/Berlin:20261027T120000\nDTEND;TZID=Europe/Berlin:20261027T130000\nSUMMARY:Verschoben\nEND:VEVENT";
    const changed = wrap(
      master.replace(
        "RRULE:",
        "EXDATE;TZID=Europe/Berlin:20261102T100000\nRRULE:",
      ) +
        "\n" +
        exception,
    );
    await syncSubscription(db, original.sourceId, async () => changed);
    await syncSubscription(db, original.sourceId, async () => changed);
    expect(
      await db.calendarEvent.count({ where: { sourceId: original.sourceId } }),
    ).toBe(3);
    const moved = await db.calendarEvent.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(moved.start.toISOString()).toBe("2026-10-27T11:00:00.000Z");
    expect(moved.title).toBe("Verschoben");
    expect(
      await db.calendarEvent.count({
        where: { sourceId: original.sourceId, missingFromFeed: true },
      }),
    ).toBe(1);
  });
  it("behält bei Netzwerk- und Parserfehlern alle Termine und den letzten Erfolgszeitpunkt", async () => {
    const source = await db.syncSource.findFirstOrThrow({
      where: { kind: "ICS_URL" },
    });
    const entries = await db.calendarEvent.findMany({
      where: { sourceId: source.id },
      orderBy: { id: "asc" },
    });
    const secret = "https://my.uni-bayreuth.de/private?token=NEVER_LOG";
    await expect(
      syncSubscription(db, source.id, async () => {
        throw new Error(secret);
      }),
    ).rejects.not.toThrow("NEVER_LOG");
    await expect(
      syncSubscription(db, source.id, async () => "kaputt"),
    ).rejects.toThrow("Bestehende Termine");
    expect(
      await db.calendarEvent.findMany({
        where: { sourceId: source.id },
        orderBy: { id: "asc" },
      }),
    ).toEqual(entries);
    expect(
      (await db.syncSource.findUniqueOrThrow({ where: { id: source.id } }))
        .lastSyncedAt,
    ).toEqual(source.lastSyncedAt);
  });
  it("speichert keinen reflektierten Abonnementlink in Ereignistext oder UID", async () => {
    const url =
      "https://my.uni-bayreuth.de/reflection.ics?token=TEST_ONLY_REFLECTION";
    await subscribeCalendar(db, { url, from, to }, async () =>
      ics(url).replace("UID:test", `UID:${url}`),
    );
    const entry = await db.calendarEvent.findFirstOrThrow({
      where: { title: "[privater Kalenderlink]" },
    });
    expect(JSON.stringify(entry)).not.toContain("TEST_ONLY_REFLECTION");
  });
  it("speichert kein Abonnement bei abgewiesenem Host oder fehlgeschlagenem Erstimport", async () => {
    const count = await db.syncSource.count();
    const download = vi.fn(async () => ics());
    await expect(
      subscribeCalendar(
        db,
        { url: "https://evil.test/calendar", from, to },
        download,
      ),
    ).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
    await expect(
      subscribeCalendar(
        db,
        { url: "https://my.uni-bayreuth.de/bad", from, to },
        async () => "kaputt",
      ),
    ).rejects.toThrow();
    expect(await db.syncSource.count()).toBe(count);
  });
});
