import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { IcsCalendarProvider } from "../providers/ics";
import {
  fetchCalendarUrl,
  validateCalendarUrl,
} from "../providers/calendar-url";
import {
  calendarUrlHash,
  decryptCalendarUrl,
  encryptCalendarUrl,
} from "./calendar-secrets";

export class SubscriptionError extends Error {}
type Download = (url: string) => Promise<string>;
export async function subscribeCalendar(
  db: PrismaClient,
  input: { url: string; from: Date; to: Date },
  download: Download = fetchCalendarUrl,
) {
  try {
    const url = validateCalendarUrl(input.url).href;
    // Fail before any network traffic when encryption is not configured.
    const hash = calendarUrlHash(url),
      encrypted = encryptCalendarUrl(url);
    const existing = await db.syncSource.findUnique({
      where: { subscriptionUrlHash: hash },
      select: { id: true },
    });
    const id = existing?.id ?? `subscription:${randomUUID()}`;
    return await applySubscription(
      db,
      { id, url, hash, encrypted, from: input.from, to: input.to },
      download,
    );
  } catch {
    throw new SubscriptionError(
      "Abonnement konnte nicht gespeichert werden. HTTPS-Hostfreigabe, Link, Zeitraum und lokalen Verschlüsselungsschlüssel prüfen. Bestehende Termine bleiben erhalten.",
    );
  }
}
export async function syncSubscription(
  db: PrismaClient,
  id: string,
  download: Download = fetchCalendarUrl,
) {
  try {
    const source = await db.syncSource.findUniqueOrThrow({
      where: { id, kind: "ICS_URL" },
    });
    if (
      !source.subscriptionUrlEncrypted ||
      !source.subscriptionUrlHash ||
      !source.subscriptionFrom ||
      !source.subscriptionTo
    )
      throw new Error();
    const url = decryptCalendarUrl(source.subscriptionUrlEncrypted);
    validateCalendarUrl(url);
    return await applySubscription(
      db,
      {
        id,
        url,
        hash: source.subscriptionUrlHash,
        encrypted: source.subscriptionUrlEncrypted,
        from: source.subscriptionFrom,
        to: source.subscriptionTo,
      },
      download,
    );
  } catch {
    throw new SubscriptionError(
      "Synchronisierung fehlgeschlagen. Hostfreigabe, Kalenderlink und Netzwerk prüfen. Bestehende Termine bleiben erhalten.",
    );
  }
}
async function applySubscription(
  db: PrismaClient,
  source: {
    id: string;
    url: string;
    hash: string;
    encrypted: string;
    from: Date;
    to: Date;
  },
  download: Download,
) {
  if (!(source.from < source.to) || +source.to - +source.from > 737 * 86400000)
    throw new Error();
  const content = await download(source.url);
  const entries = new IcsCalendarProvider().parse(
    content,
    source.from,
    source.to,
  );
  // Feed data is untrusted: do not persist the original subscription URL through reflected event text.
  const safe = (value: string) =>
    value.replaceAll(source.url, "[privater Kalenderlink]");
  await db.$transaction(
    async (tx) => {
      await tx.syncSource.upsert({
        where: { id: source.id },
        create: {
          id: source.id,
          name: "cmlife · Kalenderabonnement",
          kind: "ICS_URL",
          subscriptionUrlHash: source.hash,
          subscriptionUrlEncrypted: source.encrypted,
          subscriptionFrom: source.from,
          subscriptionTo: source.to,
          lastSyncedAt: new Date(),
        },
        update: {
          subscriptionUrlHash: source.hash,
          subscriptionUrlEncrypted: source.encrypted,
          subscriptionFrom: source.from,
          subscriptionTo: source.to,
          lastSyncedAt: new Date(),
        },
      });
      // Absence is not proof of cancellation. Keep records and flag them for review instead of deleting.
      await tx.calendarEvent.updateMany({
        where: {
          sourceId: source.id,
          start: { lt: source.to },
          end: { gte: source.from },
        },
        data: { missingFromFeed: true },
      });
      for (const entry of entries) {
        // UIDs can themselves be URLs. Store a keyed identity rather than reflected secrets.
        const externalId = calendarUrlHash(`event\0${entry.externalId}`);
        const data = {
          ...entry,
          externalId,
          title: safe(entry.title),
          description: safe(entry.description),
          location: safe(entry.location),
          missingFromFeed: false,
        };
        await tx.calendarEvent.upsert({
          where: {
            sourceId_externalId: {
              sourceId: source.id,
              externalId,
            },
          },
          create: { ...data, sourceId: source.id },
          update: data,
        });
      }
    },
    { timeout: 30000 },
  );
  return entries.length;
}
