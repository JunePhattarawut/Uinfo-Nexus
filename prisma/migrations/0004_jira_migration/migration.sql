-- Extend WorkHub for Atlassian/Jira migration tracking.

ALTER TYPE "IssueLinkType" ADD VALUE IF NOT EXISTS 'CLONES';
ALTER TYPE "IssueLinkType" ADD VALUE IF NOT EXISTS 'DEPENDS_ON';
ALTER TYPE "IssueLinkType" ADD VALUE IF NOT EXISTS 'CAUSES';

CREATE TYPE "ImportSourceType" AS ENUM ('JIRA', 'CONFLUENCE', 'ATLASSIAN');
CREATE TYPE "ImportJobStatus" AS ENUM ('DRAFT', 'DRY_RUN', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "ImportSourceType" NOT NULL DEFAULT 'JIRA',
    "sourceUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'DRAFT',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_errors" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceKey" TEXT,
    "entity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_mappings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "ImportSourceType" NOT NULL DEFAULT 'JIRA',
    "entityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceKey" TEXT,
    "localType" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_jobs_workspaceId_createdAt_idx" ON "import_jobs"("workspaceId", "createdAt");
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");
CREATE INDEX "import_errors_jobId_idx" ON "import_errors"("jobId");
CREATE UNIQUE INDEX "external_mappings_workspaceId_source_entityType_sourceId_key" ON "external_mappings"("workspaceId", "source", "entityType", "sourceId");
CREATE INDEX "external_mappings_workspaceId_localType_localId_idx" ON "external_mappings"("workspaceId", "localType", "localId");
CREATE INDEX "external_mappings_sourceKey_idx" ON "external_mappings"("sourceKey");

ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_mappings" ADD CONSTRAINT "external_mappings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
