-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('CLIENT_ONBOARDED', 'INVITATION_REMINDER', 'CLIENT_USER_ACTIVATED', 'TICKET_CREATED', 'TICKET_ASSIGNED', 'TICKET_AWAITING_CLIENT', 'TICKET_RESOLVED', 'TICKET_NO_CLIENT_REPLY', 'TICKET_STALE', 'WEEKLY_CLIENT_DIGEST', 'CLIENT_INACTIVE');

-- CreateEnum
CREATE TYPE "AutomationAudience" AS ENUM ('TICKET_REQUESTER', 'ORG_PRIMARY_CONTACT', 'ORG_CLIENT_ADMINS', 'ORG_CLIENT_USERS', 'ASSIGNED_AGENT', 'INVITED_PERSON');

-- CreateEnum
CREATE TYPE "AutomationJobStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "AutomationTrigger" NOT NULL,
    "emailTemplateId" TEXT NOT NULL,
    "audience" "AutomationAudience" NOT NULL DEFAULT 'TICKET_REQUESTER',
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "thresholdDays" INTEGER NOT NULL DEFAULT 3,
    "conditions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationJob" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "organizationId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "AutomationJobStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRule_trigger_isActive_idx" ON "AutomationRule"("trigger", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJob_dedupeKey_key" ON "AutomationJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "AutomationJob_status_scheduledFor_idx" ON "AutomationJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "AutomationJob_entityType_entityId_idx" ON "AutomationJob"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
