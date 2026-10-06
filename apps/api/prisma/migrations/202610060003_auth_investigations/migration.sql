BEGIN;
CREATE TYPE "UserRole" AS ENUM ('VIEWER','OPERATOR');
CREATE TYPE "InvestigationStatus" AS ENUM ('OPEN','IN_PROGRESS','RESOLVED');
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,"email" TEXT NOT NULL,"displayName" TEXT NOT NULL,"role" "UserRole" NOT NULL,
  "passwordHash" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Session" (
  "tokenHash" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "LoginThrottle" ("key" TEXT PRIMARY KEY,"count" INTEGER NOT NULL,"resetsAt" TIMESTAMP(3) NOT NULL);
ALTER TABLE "ImportBatch" ADD COLUMN "requestedById" TEXT, ADD COLUMN "requestedByLabel" TEXT;
CREATE TABLE "Investigation" (
  "id" TEXT PRIMARY KEY,"transactionRef" TEXT NOT NULL,"status" "InvestigationStatus" NOT NULL DEFAULT 'OPEN',
  "assigneeId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,"version" INTEGER NOT NULL DEFAULT 1,
  "latestRunId" TEXT NOT NULL REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Investigation_transactionRef_key" ON "Investigation"("transactionRef");
CREATE INDEX "Investigation_status_updatedAt_idx" ON "Investigation"("status","updatedAt");
CREATE TABLE "InvestigationNote" (
  "id" TEXT PRIMARY KEY,"investigationId" TEXT NOT NULL REFERENCES "Investigation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,"body" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InvestigationNote_investigationId_createdAt_idx" ON "InvestigationNote"("investigationId","createdAt");
CREATE TABLE "AuditEvent" (
  "id" TEXT PRIMARY KEY,"actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "actorLabel" TEXT NOT NULL,"action" TEXT NOT NULL,"entityType" TEXT NOT NULL,"entityId" TEXT NOT NULL,
  "details" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_entityId_createdAt_idx" ON "AuditEvent"("entityId","createdAt");
-- Backfill only the most recent financial snapshot. No historical financial result is changed.
INSERT INTO "Investigation" ("id","transactionRef","latestRunId")
SELECT 'backfill-' || md5(i."transactionRef"),i."transactionRef",i."runId"
FROM "ReconciliationItem" i
WHERE i."runId"=(SELECT "id" FROM "ReconciliationRun" ORDER BY "createdAt" DESC,"id" DESC LIMIT 1)
AND i."status"='EXCEPTION';
INSERT INTO "AuditEvent" ("id","actorLabel","action","entityType","entityId","details")
SELECT 'backfill-audit-' || md5("id"),'Migration','INVESTIGATION_OPENED','INVESTIGATION',"id",
jsonb_build_object('transactionRef',"transactionRef",'runId',"latestRunId",'source','Milestone 3 snapshot backfill') FROM "Investigation";
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
UPDATE "SystemMetadata" SET "value"='4' WHERE "key"='milestone';
COMMIT;
