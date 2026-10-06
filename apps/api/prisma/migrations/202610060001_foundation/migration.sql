CREATE TABLE "SystemMetadata" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "SystemMetadata_pkey" PRIMARY KEY ("key")
);
INSERT INTO "SystemMetadata" ("key", "value") VALUES ('milestone', '2');
