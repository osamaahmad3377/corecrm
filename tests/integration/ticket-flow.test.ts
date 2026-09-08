import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString("base64");

import { prisma } from "@/server/db/client";
import type { AuthContext } from "@/server/auth/rbac";
import {
  addMessage,
  createTicket,
  getTicketForContext,
  listTickets,
} from "@/server/services/ticket";

/**
 * End-to-end service flow against the local database:
 * client raises a ticket → agent replies + adds an internal note → the client
 * sees the reply but NOT the note → a user from another org is refused.
 */

const suffix = randomBytes(4).toString("hex");
let orgA: string;
let orgB: string;
let contactA: string;
let contactB: string;
let agentId: string;
let clientAId: string;
let clientBId: string;

const agentCtx = (): AuthContext => ({
  userId: agentId,
  email: `agent-${suffix}@corecrm.test`,
  name: "Test Agent",
  isInternal: true,
  internalRole: "SUPPORT_AGENT",
  organization: null,
  timezone: "UTC",
});

const clientACtx = (): AuthContext => ({
  userId: clientAId,
  email: `alice-${suffix}@a.test`,
  name: "Alice A",
  isInternal: false,
  internalRole: null,
  organization: { id: orgA, role: "CLIENT_USER" },
  timezone: "UTC",
});

const clientBCtx = (): AuthContext => ({
  userId: clientBId,
  email: `bob-${suffix}@b.test`,
  name: "Bob B",
  isInternal: false,
  internalRole: null,
  organization: { id: orgB, role: "CLIENT_USER" },
  timezone: "UTC",
});

beforeAll(async () => {
  // Ensure ticket config exists (seeded); create it minimally if not.
  const statusCount = await prisma.ticketStatus.count();
  if (statusCount === 0) {
    throw new Error("Run `npm run db:seed` before the integration tests.");
  }

  const a = await prisma.organization.create({
    data: { name: `Org A ${suffix}` },
  });
  const b = await prisma.organization.create({
    data: { name: `Org B ${suffix}` },
  });
  orgA = a.id;
  orgB = b.id;

  const ca = await prisma.contact.create({
    data: {
      organizationId: orgA,
      firstName: "Alice",
      lastName: "A",
      email: `alice-${suffix}@a.test`,
    },
  });
  const cb = await prisma.contact.create({
    data: {
      organizationId: orgB,
      firstName: "Bob",
      lastName: "B",
      email: `bob-${suffix}@b.test`,
    },
  });
  contactA = ca.id;
  contactB = cb.id;

  const agent = await prisma.user.create({
    data: {
      email: `agent-${suffix}@corecrm.test`,
      name: "Test Agent",
      isInternal: true,
      internalRole: "SUPPORT_AGENT",
      status: "ACTIVE",
    },
  });
  agentId = agent.id;

  const [ua, ub] = await Promise.all([
    prisma.user.create({
      data: {
        email: `alice-${suffix}@a.test`,
        name: "Alice A",
        status: "ACTIVE",
        organizationLinks: { create: { organizationId: orgA, role: "CLIENT_USER" } },
      },
    }),
    prisma.user.create({
      data: {
        email: `bob-${suffix}@b.test`,
        name: "Bob B",
        status: "ACTIVE",
        organizationLinks: { create: { organizationId: orgB, role: "CLIENT_USER" } },
      },
    }),
  ]);
  clientAId = ua.id;
  clientBId = ub.id;
});

afterAll(async () => {
  await prisma.ticket.deleteMany({
    where: { organizationId: { in: [orgA, orgB] } },
  });
  await prisma.contact.deleteMany({ where: { id: { in: [contactA, contactB] } } });
  await prisma.organizationUser.deleteMany({
    where: { userId: { in: [clientAId, clientBId] } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({
    where: { id: { in: [agentId, clientAId, clientBId] } },
  });
  await prisma.$disconnect();
});

describe("ticket lifecycle + organization isolation", () => {
  let ticketId: string;

  it("creates a ticket with a formatted number", async () => {
    const t = await createTicket({
      ctx: clientACtx(),
      organizationId: orgA,
      requesterContactId: contactA,
      requesterUserId: null,
      source: "PORTAL",
      input: {
        subject: "Cannot print",
        description: "The plant printer is offline since this morning.",
        priorityKey: "HIGH",
        categoryId: "",
        subcategoryId: "",
        service: "",
        assetId: "",
        location: "",
        contactPhone: "",
        preferredContactMethod: "",
        impact: "",
        urgency: "",
        attachments: [],
      },
      notifyClient: false,
    });
    ticketId = t.id;
    expect(t.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
  });

  it("agent reply + internal note; client sees only the public reply", async () => {
    await addMessage(agentCtx(), ticketId, {
      body: "Hi Alice, can you power-cycle the printer?",
      messageType: "PUBLIC_REPLY",
      attachments: [],
    });
    await addMessage(agentCtx(), ticketId, {
      body: "Spare toner ordered — internal only.",
      messageType: "INTERNAL_NOTE",
      attachments: [],
    });

    const asAgent = await getTicketForContext(agentCtx(), ticketId);
    expect(asAgent.messages).toHaveLength(2);
    expect(asAgent.canViewInternal).toBe(true);

    const asClient = await getTicketForContext(clientACtx(), ticketId);
    expect(asClient.messages).toHaveLength(1);
    expect(asClient.messages[0].messageType).toBe("PUBLIC_REPLY");
    expect(
      asClient.messages.some((m) => m.messageType === "INTERNAL_NOTE"),
    ).toBe(false);
  });

  it("client reply flips status to Waiting for Internal Team", async () => {
    // Move to waiting-for-client first.
    const { changeStatus } = await import("@/server/services/ticket");
    await changeStatus(agentCtx(), ticketId, "WAITING_FOR_CLIENT");
    await addMessage(clientACtx(), ticketId, {
      body: "Tried that, still offline.",
      messageType: "PUBLIC_REPLY",
      attachments: [],
    });
    const t = await getTicketForContext(agentCtx(), ticketId);
    expect(t.status.key).toBe("WAITING_FOR_INTERNAL");
  });

  it("a user from another organization cannot read the ticket", async () => {
    await expect(
      getTicketForContext(clientBCtx(), ticketId),
    ).rejects.toThrow();
  });

  it("client B cannot add an internal note", async () => {
    await expect(
      addMessage(clientBCtx(), ticketId, {
        body: "sneaky",
        messageType: "INTERNAL_NOTE",
        attachments: [],
      }),
    ).rejects.toThrow();
  });

  it("listTickets is organization-scoped for clients", async () => {
    const listA = await listTickets(clientACtx(), {
      page: 1,
      pageSize: 25,
      sort: "newest",
    } as never);
    expect(listA.items.every((t) => t.organizationId === orgA)).toBe(true);

    const listB = await listTickets(clientBCtx(), {
      page: 1,
      pageSize: 25,
      sort: "newest",
    } as never);
    expect(listB.items.some((t) => t.id === ticketId)).toBe(false);
  });
});
