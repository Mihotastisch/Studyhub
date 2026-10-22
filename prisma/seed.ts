import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";
const db = new PrismaClient();
async function main() {
  const week = DateTime.now().setZone("Europe/Berlin").startOf("week");
  await db.$transaction(async (tx) => {
    await tx.syncSource.upsert({
      where: { id: "demo" },
      create: { id: "demo", name: "Demo · frei erfunden", kind: "DEMO" },
      update: {},
    });
    const courses = [
      ["demo-info", "Einführung in die Informatik", "INF 101", "#43846e"],
      ["demo-math", "Mathematik I", "MAT 101", "#9b89bb"],
      ["demo-bwl", "Grundlagen der BWL", "BWL 101", "#bd975a"],
    ];
    for (const [id, title, code, color] of courses)
      await tx.course.upsert({
        where: { id },
        create: { id, title, code, color, sourceId: "demo" },
        update: {},
      });
    for (let i = 0; i < 10; i++) {
      const start = week.plus({ days: i % 5, hours: i < 5 ? 10 : 14 });
      const externalId = `demo-event-${i}`;
      const data = {
        title: `${courses[i % 3][1]}${i < 5 ? " · Vorlesung" : " · Übung"}`,
        start: start.toJSDate(),
        end: start.plus({ minutes: 90 }).toJSDate(),
        location: ["H 15 · NW I", "S 72 · RW", "H 18 · NW II"][i % 3],
        courseId: courses[i % 3][0],
      };
      await tx.calendarEvent.upsert({
        where: { sourceId_externalId: { sourceId: "demo", externalId } },
        create: { ...data, externalId, sourceId: "demo" },
        update: {},
      });
    }
    for (const [i, title] of [
      "Übungsblatt 03 abgeben",
      "Lerngruppe vorbereiten",
    ].entries())
      await tx.task.upsert({
        where: {
          sourceId_externalId: { sourceId: "demo", externalId: `task-${i}` },
        },
        create: {
          externalId: `task-${i}`,
          sourceId: "demo",
          title,
          description: "DEMO: Frei erfundene Aufgabe zum Testen.",
          dueAt: week.plus({ days: 4 + i, hours: 18 }).toJSDate(),
          courseId: courses[i][0],
          reminderMinutes: 1440,
        },
        update: {},
      });
    await tx.exam.upsert({
      where: {
        sourceId_externalId: { sourceId: "demo", externalId: "exam-1" },
      },
      create: {
        externalId: "exam-1",
        sourceId: "demo",
        title: "Mathematik I · Probeklausur",
        description: "DEMO: Kein offizieller Prüfungstermin.",
        dueAt: week.plus({ weeks: 3, days: 2, hours: 9 }).toJSDate(),
        courseId: "demo-math",
        reminderMinutes: 10080,
      },
      update: {},
    });
  });
  console.log(
    "Demo-Daten angelegt. Erneutes Ausführen überschreibt keine Änderungen.",
  );
}
main().finally(() => db.$disconnect());
