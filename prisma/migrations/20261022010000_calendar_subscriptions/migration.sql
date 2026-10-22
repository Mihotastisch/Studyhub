ALTER TABLE "SyncSource" ADD COLUMN "subscriptionUrlEncrypted" TEXT;
ALTER TABLE "SyncSource" ADD COLUMN "subscriptionUrlHash" TEXT;
ALTER TABLE "SyncSource" ADD COLUMN "subscriptionFrom" DATETIME;
ALTER TABLE "SyncSource" ADD COLUMN "subscriptionTo" DATETIME;
ALTER TABLE "CalendarEvent" ADD COLUMN "missingFromFeed" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "SyncSource_subscriptionUrlHash_key" ON "SyncSource"("subscriptionUrlHash");
