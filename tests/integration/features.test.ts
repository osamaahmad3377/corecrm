import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString("base64");

import { prisma } from "@/server/db/client";
import type { AuthContext } from "@/server/auth/rbac";
import {
  ensureSystemTemplates,
  renderTemplate,
  updateTemplate,
  resetTemplate,
} from "@/server/services/email-template";
import { createTeam, addTeamMember, deleteTeam } from "@/server/services/team";
import { setTicketDueDate } from "@/server/services/ticket";

const suffix = randomBytes(4).toString("hex");
let adminId: string;
let agentId: string;

const admin = (): AuthContext => ({
  userId: adminId,
  email: `admin-${suffix}@corecrm.test`,
  name: "Admin",
  isInternal: true,
  internalRole: "ADMIN",
  organization: null,
  timezone: "UTC",
});

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.user.create({
      data: {
        email: `admin-${suffix}@corecrm.test`,
        name: "Admin",
        isInternal: true,
        internalRole: "ADMIN",
        status: "ACTIVE",
      },
    }),
    prisma.user.create({
      data: {
        email: `agent-${suffix}@corecrm.test`,
        name: "Agent",
        isInternal: true,
        internalRole: "SUPPORT_AGENT",
        status: "ACTIVE",
      },
    }),
  ]);
  adminId = a.id;
  agentId = b.id;
});

afterAll(async () => {
  await prisma.team.deleteMany({ where: { name: { startsWith: `QA ${suffix}` } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, agentId] } } });
  await prisma.$disconnect();
});

describe("email templates", () => {
  it("renders a built-in template with variable substitution", async () => {
    await ensureSystemTemplates();
    const out = await renderTemplate("TICKET_ASSIGNED", {
      agentName: "Riley",
      ticketNumber: "TKT-2026-000123",
      subject: "Printer down",
      url: "https://example.test/t/1",
    });
    expect(out.subject).toContain("TKT-2026-000123");
    expect(out.html).toContain("Riley");
    expect(out.html).toContain("Printer down");
    expect(out.html).toContain("https://example.test/t/1");
  });

  it("uses the admin-edited subject/body, then resets to default", async () => {
    await ensureSystemTemplates();
    const row = await prisma.emailTemplate.findUniqueOrThrow({
      where: { key: "TICKET_RESOLVED" },
    });
    await updateTemplate(admin(), row.id, {
      name: row.name,
      description: row.description ?? "",
      subject: "CUSTOM {{ticketNumber}}",
      bodyHtml: "<p>custom body for {{recipientName}}</p>",
    });
    const edited = await renderTemplate("TICKET_RESOLVED", {
      ticketNumber: "TKT-1",
      recipientName: "Dana",
      subject: "x",
      url: "https://e.test",
    });
    expect(edited.subject).toBe("CUSTOM TKT-1");
    expect(edited.html).toContain("custom body for Dana");

    await resetTemplate(admin(), row.id);
    const back = await prisma.emailTemplate.findUniqueOrThrow({
      where: { key: "TICKET_RESOLVED" },
    });
    expect(back.subject).not.toBe("CUSTOM {{ticketNumber}}");
  });
});

describe("teams", () => {
  it("creates a team, adds a member, then deletes it", async () => {
    const team = await createTeam(admin(), {
      name: `QA ${suffix} Team`,
      description: "",
      status: "ACTIVE",
    });
    await addTeamMember(admin(), team.id, agentId);
    const withMembers = await prisma.team.findUniqueOrThrow({
      where: { id: team.id },
      include: { members: true },
    });
    expect(withMembers.members).toHaveLength(1);

    await deleteTeam(admin(), team.id);
    expect(await prisma.team.findUnique({ where: { id: team.id } })).toBeNull();
  });
});

describe("ticket deadlines", () => {
  it("sets and clears a manual due date", async () => {
    const statuses = await prisma.ticketStatus.findFirst({ where: { key: "NEW" } });
    const priority = await prisma.ticketPriority.findFirst({
      where: { key: "MEDIUM" },
    });
    const org = await prisma.organization.create({
      data: { name: `QA ${suffix} DueOrg` },
    });
    const contact = await prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: "Q",
        lastName: "A",
        email: `qa-${suffix}@x.test`,
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-2099-${suffix.replace(/[^0-9]/g, "0").padEnd(6, "0").slice(0, 6)}`,
        organizationId: org.id,
        requesterContactId: contact.id,
        subject: "Due date test",
        description: "<p>x</p>",
        statusId: statuses!.id,
        priorityId: priority!.id,
        source: "INTERNAL",
      },
    });

    const due = new Date(Date.now() + 3 * 24 * 3600_000);
    await setTicketDueDate(admin(), ticket.id, due.toISOString());
    let fresh = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(fresh.dueAt?.getTime()).toBe(due.getTime());

    await setTicketDueDate(admin(), ticket.id, null);
    fresh = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(fresh.dueAt).toBeNull();

    await prisma.ticket.delete({ where: { id: ticket.id } });
    await prisma.contact.delete({ where: { id: contact.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
