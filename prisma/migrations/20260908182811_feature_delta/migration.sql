-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EmailHandledStatus" AS ENUM ('INFO', 'IGNORED');

-- CreateEnum
CREATE TYPE "EmailTemplateChannel" AS ENUM ('TRANSACTIONAL');

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "handledById" TEXT,
ADD COLUMN     "handledStatus" "EmailHandledStatus";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "businessHours" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "onboardingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sharepointUrl" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "status" "TeamStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "dueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "channel" "EmailTemplateChannel" NOT NULL DEFAULT 'TRANSACTIONAL',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE INDEX "EmailMessage_handledStatus_idx" ON "EmailMessage"("handledStatus");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
