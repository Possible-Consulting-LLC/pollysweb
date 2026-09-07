-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "dateFormat" TEXT NOT NULL DEFAULT 'MMM d, yyyy',
    "measurement" TEXT NOT NULL DEFAULT 'imperial',
    "theme" TEXT NOT NULL DEFAULT 'cosmic',
    "feedDefaultDays" INTEGER NOT NULL DEFAULT 3,
    "mistDefaultDays" INTEGER NOT NULL DEFAULT 1,
    "cleanDefaultDays" INTEGER NOT NULL DEFAULT 14,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Spider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "commonName" TEXT,
    "sex" TEXT NOT NULL DEFAULT 'Unknown',
    "instar" TEXT,
    "hatchDate" DATETIME,
    "acquisitionDate" DATETIME,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Normal',
    "profilePhoto" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Spider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Enclosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spiderId" TEXT NOT NULL,
    "name" TEXT,
    "dimensions" TEXT,
    "setupDate" DATETIME,
    "type" TEXT,
    "notes" TEXT,
    "photo" TEXT,
    "lastCleaned" DATETIME,
    "lastRehoused" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Enclosure_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spiderId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preyType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "preySize" TEXT,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedingEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MistingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spiderId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mistedEnclosure" BOOLEAN NOT NULL DEFAULT true,
    "waterDroplet" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MistingEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MoltEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spiderId" TEXT NOT NULL,
    "moltDate" DATETIME NOT NULL,
    "approximate" BOOLEAN NOT NULL DEFAULT false,
    "previousInstar" TEXT,
    "newInstar" TEXT,
    "moltPhoto" TEXT,
    "postMoltPhoto" TEXT,
    "notes" TEXT,
    "successful" BOOLEAN NOT NULL DEFAULT true,
    "daysSincePriorMolt" INTEGER,
    "fastingDaysBefore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MoltEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ObservationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spiderId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObservationEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BodyConditionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spiderId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "condition" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BodyConditionEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnclosureMaintenanceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enclosureId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnclosureMaintenanceEvent_enclosureId_fkey" FOREIGN KEY ("enclosureId") REFERENCES "Enclosure" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spiderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Photo_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "spiderId" TEXT,
    "kind" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reminder_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Spider_userId_idx" ON "Spider"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Enclosure_spiderId_key" ON "Enclosure"("spiderId");

-- CreateIndex
CREATE INDEX "FeedingEvent_spiderId_date_idx" ON "FeedingEvent"("spiderId", "date");

-- CreateIndex
CREATE INDEX "MistingEvent_spiderId_date_idx" ON "MistingEvent"("spiderId", "date");

-- CreateIndex
CREATE INDEX "MoltEvent_spiderId_moltDate_idx" ON "MoltEvent"("spiderId", "moltDate");

-- CreateIndex
CREATE INDEX "ObservationEvent_spiderId_date_idx" ON "ObservationEvent"("spiderId", "date");

-- CreateIndex
CREATE INDEX "BodyConditionEvent_spiderId_date_idx" ON "BodyConditionEvent"("spiderId", "date");

-- CreateIndex
CREATE INDEX "EnclosureMaintenanceEvent_enclosureId_date_idx" ON "EnclosureMaintenanceEvent"("enclosureId", "date");

-- CreateIndex
CREATE INDEX "Photo_spiderId_takenAt_idx" ON "Photo"("spiderId", "takenAt");

-- CreateIndex
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");
