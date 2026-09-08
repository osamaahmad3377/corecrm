import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString("base64");

import { prisma } from "@/server/db/client";
import { ingestMessage } from "@/server/services/email-ingest";
import type { NormalizedMessage } from "@/server/providers/email/types";

const suffix = randomBytes(4).toString("hex");
let accountId: string;
let orgId: string;
let contactId: string;

function inbound(overrides: Partial<NormalizedMessage>): NormalizedMessage {
  return {
    providerMessageId: `m-${randomBytes(4).toString("hex")}`,
    providerThreadId: `t-${suffix}`,
    direction: "INBOUND",
    from: { address: `john-${suffix}@abc.test`, name: "John" },
    to: [{ address: `support-${suffix}@company.test` }],
    subject: "Internet is not working",
    bodyText: "The whole office has lost internet.",
    hasAttachments: false,
    ...overrides,
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `Threading Org ${suffix}` },
  });
  orgId = org.id;
  const contact = await prisma.contact.create({
    data: {
      organizationId: orgId,
      firstName: "John",
      lastName: "Doe",
      email: `john-${suffix}@abc.test`,
    },
  });
  contactId = contact.id;
  const account = await prisma.emailAccount.create({
    data: {
      address: `support-${suffix}@company.test`,
      displayName: "Support",
      provider: "MICROSOFT",
      status: "CONNECTED",
    },
  });
  accountId = account.id;
});

afterAll(async () => {
  await prisma.emailMessage.deleteMany({ where: { emailAccountId: accountId } });
  await prisma.emailThread.deleteMany({ where: { emailAccountId: accountId } });
  await prisma.ticket.deleteMany({ where: { organizationId: orgId } });
  await prisma.emailAccount.deleteMany({ where: { id: accountId } });
  await prisma.contact.deleteMany({ where: { id: contactId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("email ingestion", () => {
  it("is idempotent — the same provider message is stored once", async () => {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    const msg = inbound({});
    const first = await ingestMessage(account, msg);
    const second = await ingestMessage(account, msg);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.emailMessageId).toBe(first.emailMessageId);

    const count = await prisma.emailMessage.count({
      where: {
        emailAccountId: accountId,
        providerMessageId: msg.providerMessageId,
      },
    });
    expect(count).toBe(1);
  });

  it("resolves the sender to a contact + organization", async () => {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    const res = await ingestMessage(account, inbound({}));
    const stored = await prisma.emailMessage.findUniqueOrThrow({
      where: { id: res.emailMessageId },
    });
    expect(stored.contactId).toBe(contactId);
    expect(stored.organizationId).toBe(orgId);
  });

  it("associates a reply that quotes the ticket number in its subject", async () => {
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: orgId },
    });
    // Create a ticket to reference.
    const statuses = await prisma.ticketStatus.findFirst({ where: { key: "NEW" } });
    const priority = await prisma.ticketPriority.findFirst({
      where: { key: "MEDIUM" },
    });
    if (!statuses || !priority) return; // requires seed
    const t =
      ticket ??
      (await prisma.ticket.create({
        data: {
          ticketNumber: `TKT-2099-${suffix.slice(0, 6).padStart(6, "0").replace(/[^0-9]/g, "0")}`,
          organizationId: orgId,
          requesterContactId: contactId,
          subject: "Ref ticket",
          description: "<p>x</p>",
          statusId: statuses.id,
          priorityId: priority.id,
          source: "EMAIL",
        },
      }));

    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    const res = await ingestMessage(
      account,
      inbound({
        providerMessageId: `reply-${randomBytes(4).toString("hex")}`,
        providerThreadId: `t2-${suffix}`,
        subject: `RE: [${t.ticketNumber}] Ref ticket`,
      }),
    );
    const stored = await prisma.emailMessage.findUniqueOrThrow({
      where: { id: res.emailMessageId },
    });
    expect(stored.ticketId).toBe(t.id);

    const mirrored = await prisma.ticketMessage.findFirst({
      where: { emailMessageId: stored.id },
    });
    expect(mirrored?.messageType).toBe("PUBLIC_REPLY");
    expect(mirrored?.authorType).toBe("CLIENT");
  });
});
