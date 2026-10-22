-- CreateTable
CREATE TABLE "SyncSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rawIcs" TEXT,
    "lastSyncedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0f766e',
    "sourceId" TEXT NOT NULL,
    CONSTRAINT "Course_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SyncSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "courseId" TEXT,
    "sourceId" TEXT NOT NULL,
    CONSTRAINT "CalendarEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SyncSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dueAt" DATETIME NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "reminderMinutes" INTEGER,
    "courseId" TEXT,
    "sourceId" TEXT NOT NULL,
    CONSTRAINT "Task_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SyncSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dueAt" DATETIME NOT NULL,
    "reminderMinutes" INTEGER,
    "courseId" TEXT,
    "sourceId" TEXT NOT NULL,
    CONSTRAINT "Exam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Exam_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SyncSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courseId" TEXT,
    "sourceId" TEXT NOT NULL,
    CONSTRAINT "LearningMaterial_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LearningMaterial_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SyncSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT NOT NULL,
    CONSTRAINT "Notification_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SyncSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CalendarEvent_start_idx" ON "CalendarEvent"("start");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_sourceId_externalId_key" ON "CalendarEvent"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_sourceId_externalId_key" ON "Task"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_sourceId_externalId_key" ON "Exam"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningMaterial_sourceId_externalId_key" ON "LearningMaterial"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_sourceId_externalId_key" ON "Notification"("sourceId", "externalId");
