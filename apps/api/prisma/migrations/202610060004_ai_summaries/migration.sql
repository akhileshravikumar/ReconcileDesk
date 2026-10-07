BEGIN;
CREATE TABLE "AiBudget" (
 "id" TEXT PRIMARY KEY, "limitMicros" INTEGER NOT NULL DEFAULT 1000000,
 "spentMicros" INTEGER NOT NULL DEFAULT 0,"reservedMicros" INTEGER NOT NULL DEFAULT 0,
 CHECK ("limitMicros" BETWEEN 0 AND 1000000),
 CHECK ("spentMicros">=0 AND "reservedMicros">=0 AND "spentMicros"+"reservedMicros"<="limitMicros")
);
INSERT INTO "AiBudget" ("id") VALUES ('project');
CREATE TABLE "AiRequest" (
 "id" TEXT PRIMARY KEY,"investigationId" TEXT NOT NULL REFERENCES "Investigation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" TEXT NOT NULL,"sourceHash" TEXT NOT NULL,"context" JSONB NOT NULL,"model" TEXT NOT NULL,
 "promptVersion" TEXT NOT NULL,"priceVersion" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'PENDING',
 "reservedMicros" INTEGER NOT NULL,"chargedMicros" INTEGER NOT NULL DEFAULT 0,
 "inputTokens" INTEGER,"outputTokens" INTEGER,"durationMs" INTEGER,"output" JSONB,"error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),
 CHECK ("status" IN ('PENDING','SUCCEEDED','REJECTED','UNKNOWN'))
);
CREATE INDEX "AiRequest_investigationId_createdAt_idx" ON "AiRequest"("investigationId","createdAt");
CREATE INDEX "AiRequest_investigationId_sourceHash_status_idx" ON "AiRequest"("investigationId","sourceHash","status");
UPDATE "SystemMetadata" SET "value"='5' WHERE "key"='milestone';
COMMIT;
