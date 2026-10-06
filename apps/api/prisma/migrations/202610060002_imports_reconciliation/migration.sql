BEGIN;
CREATE TYPE "RecordKind" AS ENUM ('PAYMENT', 'SETTLEMENT', 'REFUND');
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "RowOutcome" AS ENUM ('ACCEPTED', 'DUPLICATE', 'REJECTED', 'QUARANTINED');

CREATE TABLE "ImportBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" "RecordKind" NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "rawCsv" TEXT NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
  "total" INTEGER NOT NULL DEFAULT 0,
  "accepted" INTEGER NOT NULL DEFAULT 0,
  "duplicate" INTEGER NOT NULL DEFAULT 0,
  "rejected" INTEGER NOT NULL DEFAULT 0,
  "quarantined" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ImportBatch_kind_contentHash_key" ON "ImportBatch"("kind", "contentHash");
CREATE INDEX "ImportBatch_status_createdAt_idx" ON "ImportBatch"("status", "createdAt");

CREATE TABLE "ImportRow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "outcome" "RowOutcome" NOT NULL,
  "reference" TEXT,
  "transactionRef" TEXT,
  "existingTransactionRef" TEXT,
  "reason" TEXT,
  "raw" JSONB NOT NULL,
  CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ImportRow_batchId_rowNumber_key" ON "ImportRow"("batchId", "rowNumber");
CREATE INDEX "ImportRow_outcome_idx" ON "ImportRow"("outcome");

CREATE TABLE "LedgerRecord" (
  "kind" "RecordKind" NOT NULL,
  "reference" TEXT NOT NULL,
  "transactionRef" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "feePaise" BIGINT NOT NULL DEFAULT 0,
  "netPaise" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  CONSTRAINT "LedgerRecord_pkey" PRIMARY KEY ("kind", "reference"),
  CONSTRAINT "LedgerRecord_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LedgerRecord_amount_check" CHECK ("amountPaise" > 0 AND "feePaise" >= 0 AND "netPaise" >= 0 AND "currency" = 'INR')
);
CREATE INDEX "LedgerRecord_transactionRef_idx" ON "LedgerRecord"("transactionRef");

CREATE TABLE "ReconciliationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ruleVersion" TEXT NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentCount" INTEGER NOT NULL,
  "matchedCount" INTEGER NOT NULL,
  "exceptionCount" INTEGER NOT NULL,
  "groupCount" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "sourceCounts" JSONB NOT NULL
);
CREATE UNIQUE INDEX "ReconciliationRun_ruleVersion_snapshotHash_key" ON "ReconciliationRun"("ruleVersion", "snapshotHash");
CREATE TABLE "ReconciliationItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "transactionRef" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "codes" TEXT[] NOT NULL,
  "details" JSONB NOT NULL,
  CONSTRAINT "ReconciliationItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReconciliationItem_runId_transactionRef_key" ON "ReconciliationItem"("runId", "transactionRef");
CREATE INDEX "ReconciliationItem_runId_status_idx" ON "ReconciliationItem"("runId", "status");
UPDATE "SystemMetadata" SET "value" = '3' WHERE "key" = 'milestone';
COMMIT;
