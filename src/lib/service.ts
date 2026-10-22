import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { IcsCalendarProvider } from "../providers/ics";
export const courseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  code: z.string().trim().max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  dueAt: z.date(),
  courseId: z.string().nullable(),
  reminderMinutes: z.number().int().min(0).max(43200).nullable(),
});
export async function localSource(db: PrismaClient) {
  return db.syncSource.upsert({
    where: { id: "local" },
    create: { id: "local", name: "Manuell", kind: "LOCAL" },
    update: {},
  });
}
export async function saveCourse(db: PrismaClient, data: unknown, id?: string) {
  const value = courseSchema.parse(data);
  await localSource(db);
  return id
    ? db.course.update({ where: { id }, data: value })
    : db.course.create({ data: { ...value, sourceId: "local" } });
}
export async function deleteCourse(db: PrismaClient, id: string) {
  return db.course.delete({ where: { id } });
}
export async function saveItem(
  db: PrismaClient,
  kind: "task" | "exam",
  data: unknown,
  id?: string,
) {
  const value = itemSchema.parse(data);
  await localSource(db);
  if (kind === "task")
    return id
      ? db.task.update({ where: { id }, data: value })
      : db.task.create({ data: { ...value, sourceId: "local" } });
  return id
    ? db.exam.update({ where: { id }, data: value })
    : db.exam.create({ data: { ...value, sourceId: "local" } });
}
export async function importCalendar(
  db: PrismaClient,
  sourceId: string,
  name: string,
  content: string,
  from: Date,
  to: Date,
  courseId: string | null = null,
) {
  if (!/^[\p{L}\p{N} _.-]{1,80}$/u.test(sourceId))
    throw new Error(
      "Quellenkennung: 1–80 Buchstaben, Zahlen, Leerzeichen, Punkt oder Bindestrich.",
    );
  const entries = new IcsCalendarProvider().parse(content, from, to);
  const id = `ics:${sourceId}`;
  await db.$transaction(async (tx) => {
    await tx.syncSource.upsert({
      where: { id },
      create: {
        id,
        name,
        kind: "ICS",
        rawIcs: content,
        lastSyncedAt: new Date(),
      },
      update: { name, rawIcs: content, lastSyncedAt: new Date() },
    });
    await tx.calendarEvent.deleteMany({ where: { sourceId: id } });
    if (entries.length)
      await tx.calendarEvent.createMany({
        data: entries.map((e) => ({ ...e, sourceId: id, courseId })),
      });
  });
  return entries.length;
}
