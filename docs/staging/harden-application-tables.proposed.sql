-- REVIEW COPY ONLY. Not executed; not yet registered as a Prisma migration.
-- Intended target: staging project nfdecdylxcmuypxodppe ONLY.
-- Run after existing migrations, with Data API disabled throughout setup.
-- Preserve historical migrations; add this as a new migration after approval.
BEGIN;

-- Prisma's server-side database owner can still access these tables.
-- Browser Data API roles receive neither grants nor RLS policies.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Spider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Enclosure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FeedingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MistingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MoltEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ObservationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BodyConditionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EnclosureMaintenanceEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Photo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Reminder" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public."User", public."Spider", public."Enclosure", public."FeedingEvent",
  public."MistingEvent", public."MoltEvent", public."ObservationEvent",
  public."BodyConditionEvent", public."EnclosureMaintenanceEvent",
  public."Photo", public."Reminder"
FROM PUBLIC, anon, authenticated;

COMMIT;
