"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { berlin } from "@/lib/time";
import { subscribeCalendar, syncSubscription } from "@/lib/subscriptions";
import {
  deleteCourse,
  importCalendar,
  localSource,
  saveCourse,
  saveItem,
} from "@/lib/service";
const text = (f: FormData, key: string) => String(f.get(key) || "");
export async function mutate(f: FormData) {
  let message = "Gespeichert.";
  const subscriptionAction = ["subscribe", "syncSubscription"].includes(
    text(f, "action"),
  );
  try {
    const action = text(f, "action"),
      id = text(f, "id");
    if (action === "course")
      await saveCourse(
        db,
        {
          title: text(f, "title"),
          code: text(f, "code"),
          color: text(f, "color"),
        },
        id || undefined,
      );
    else if (action === "deleteCourse") await deleteCourse(db, id);
    else if (action === "item")
      await saveItem(
        db,
        text(f, "kind") === "exam" ? "exam" : "task",
        {
          title: text(f, "title"),
          description: text(f, "description"),
          dueAt: berlin(text(f, "dueAt")),
          courseId: text(f, "courseId") || null,
          reminderMinutes: text(f, "reminderMinutes")
            ? Number(text(f, "reminderMinutes"))
            : null,
        },
        id || undefined,
      );
    else if (action === "done")
      await db.task.update({
        where: { id },
        data: { done: text(f, "done") === "true" },
      });
    else if (action === "deleteItem") {
      if (text(f, "kind") === "exam") await db.exam.delete({ where: { id } });
      else await db.task.delete({ where: { id } });
    } else if (action === "event") {
      const start = berlin(text(f, "start")),
        end = berlin(text(f, "end")),
        title = text(f, "title").trim();
      if (!title || title.length > 200 || end <= start)
        throw new Error("Titel und eine gültige Zeitspanne sind erforderlich.");
      await localSource(db);
      const data = {
        title,
        start,
        end,
        location: text(f, "location").slice(0, 300),
        courseId: text(f, "courseId") || null,
      };
      if (id) await db.calendarEvent.update({ where: { id }, data });
      else
        await db.calendarEvent.create({
          data: { ...data, sourceId: "local", externalId: randomUUID() },
        });
    } else if (action === "deleteEvent")
      await db.calendarEvent.delete({ where: { id, sourceId: "local" } });
    else if (action === "import") {
      const file = f.get("file");
      if (!(file instanceof File) || !file.size || file.size > 2_000_000)
        throw new Error("Bitte eine ICS-Datei bis 2 MB wählen.");
      const from = berlin(`${text(f, "from")}T00:00`),
        to = berlin(`${text(f, "to")}T00:00`);
      const count = await importCalendar(
        db,
        text(f, "source"),
        text(f, "source"),
        await file.text(),
        from,
        to,
        text(f, "courseId") || null,
      );
      message = `${count} Termine importiert. Quelle vollständig aktualisiert.`;
    } else if (action === "subscribe") {
      const count = await subscribeCalendar(db, {
        url: text(f, "url"),
        from: berlin(`${text(f, "from")}T00:00`),
        to: berlin(`${text(f, "to")}T00:00`),
      });
      message = `Kalender abonniert: ${count} Termine übernommen. Bestehende Termine bleiben erhalten.`;
    } else if (action === "syncSubscription") {
      const count = await syncSubscription(db, id);
      message = `Kalender synchronisiert: ${count} Termine aktualisiert. Nicht mehr gelieferte Termine sind zur Prüfung markiert.`;
    } else throw new Error("Unbekannte Aktion.");
  } catch (error) {
    if (subscriptionAction) {
      // Neither the exception nor FormData may be logged or reflected for secret URL operations.
      message =
        "Kalenderabonnement fehlgeschlagen. Bitte HTTPS-Link, Hostfreigabe, Zeitraum, Netzwerk und lokalen Schlüssel prüfen. Bestehende Termine bleiben erhalten.";
    } else {
      console.error(
        "StudyHub operation failed:",
        error instanceof Error ? error.message : "unknown",
      );
      message =
        error instanceof Error && !error.message.includes("prisma")
          ? error.message
          : "Die Daten konnten nicht gespeichert werden. Bitte Zuordnungen prüfen.";
    }
  }
  revalidatePath("/");
  redirect(`/?message=${encodeURIComponent(message.slice(0, 600))}`);
}
