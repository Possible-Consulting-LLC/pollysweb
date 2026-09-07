-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "dateFormat" TEXT NOT NULL DEFAULT 'MMM d, yyyy',
    "measurement" TEXT NOT NULL DEFAULT 'imperial',
    "theme" TEXT NOT NULL DEFAULT 'cosmic',
    "feedDefaultDays" INTEGER NOT NULL DEFAULT 3,
    "mistDefaultDays" INTEGER NOT NULL DEFAULT 1,
    "cleanDefaultDays" INTEGER NOT NULL DEFAULT 14,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spider" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "commonName" TEXT,
    "sex" TEXT NOT NULL DEFAULT 'Unknown',
    "instar" TEXT,
    "hatchDate" TIMESTAMP(3),
    "acquisitionDate" TIMESTAMP(3),
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Normal',
    "profilePhoto" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Spider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enclosure" (
    "id" TEXT NOT NULL,
    "spiderId" TEXT NOT NULL,
    "name" TEXT,
    "dimensions" TEXT,
    "setupDate" TIMESTAMP(3),
    "type" TEXT,
    "notes" TEXT,
    "photo" TEXT,
    "lastCleaned" TIMESTAMP(3),
    "lastRehoused" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedingEvent" (
    "id" TEXT NOT NULL,
    "spiderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preyType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "preySize" TEXT,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MistingEvent" (
    "id" TEXT NOT NULL,
    "spiderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mistedEnclosure" BOOLEAN NOT NULL DEFAULT true,
    "waterDroplet" BOOLEAN NOT NULL DEFAULT false,
    "methods" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MistingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoltEvent" (
    "id" TEXT NOT NULL,
    "spiderId" TEXT NOT NULL,
    "moltDate" TIMESTAMP(3) NOT NULL,
    "approximate" BOOLEAN NOT NULL DEFAULT false,
    "previousInstar" TEXT,
    "newInstar" TEXT,
    "moltPhoto" TEXT,
    "postMoltPhoto" TEXT,
    "notes" TEXT,
    "successful" BOOLEAN NOT NULL DEFAULT true,
    "daysSincePriorMolt" INTEGER,
    "fastingDaysBefore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoltEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservationEvent" (
    "id" TEXT NOT NULL,
    "spiderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyConditionEvent" (
    "id" TEXT NOT NULL,
    "spiderId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "condition" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyConditionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnclosureMaintenanceEvent" (
    "id" TEXT NOT NULL,
    "enclosureId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnclosureMaintenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "spiderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spiderId" TEXT,
    "kind" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "Spider" ADD CONSTRAINT "Spider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enclosure" ADD CONSTRAINT "Enclosure_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEvent" ADD CONSTRAINT "FeedingEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MistingEvent" ADD CONSTRAINT "MistingEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoltEvent" ADD CONSTRAINT "MoltEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationEvent" ADD CONSTRAINT "ObservationEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyConditionEvent" ADD CONSTRAINT "BodyConditionEvent_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnclosureMaintenanceEvent" ADD CONSTRAINT "EnclosureMaintenanceEvent_enclosureId_fkey" FOREIGN KEY ("enclosureId") REFERENCES "Enclosure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_spiderId_fkey" FOREIGN KEY ("spiderId") REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- App uses Prisma with the database role (not Supabase Auth RLS policies).
ALTER TABLE "User" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Spider" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Enclosure" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedingEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "MistingEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "MoltEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ObservationEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "BodyConditionEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "EnclosureMaintenanceEvent" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Photo" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" DISABLE ROW LEVEL SECURITY;
