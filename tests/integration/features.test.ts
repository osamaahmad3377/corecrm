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
import {
  setTicketDueDate,
  sweepDeadlineAlerts,
  deadlineAlerts,
} from "@/server/services/ticket";

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

describe("deadline alerts", () => {
  it("flags approaching and passed deadlines once, and lists them", async () => {
    const status = await prisma.ticketStatus.findFirstOrThrow({
      where: { key: "NEW" },
    });
    const priority = await prisma.ticketPriority.findFirstOrThrow({
      where: { key: "HIGH" },
    });
    const org = await prisma.organization.create({
      data: { name: `QA ${suffix} Deadlines` },
    });
    const contact = await prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: "D",
        lastName: "L",
        email: `dl-${suffix}@x.test`,
      },
    });

    const mk = (num: string, dueOffsetMs: number) =>
      prisma.ticket.create({
        data: {
          ticketNumber: num,
          organizationId: org.id,
          requesterContactId: contact.id,
          subject: `deadline ${num}`,
          description: "<p>x</p>",
          statusId: status.id,
          priorityId: priority.id,
          source: "INTERNAL",
          assignedAgentId: agentId,
          dueAt: new Date(Date.now() + dueOffsetMs),
        },
      });

    const soon = await mk(`TKT-2098-${suffix.slice(0, 4)}01`, 2 * 3600_000); // +2h
    const past = await mk(`TKT-2098-${suffix.slice(0, 4)}02`, -3 * 3600_000); // -3h
    const far = await mk(`TKT-2098-${suffix.slice(0, 4)}03`, 10 * 24 * 3600_000); // far off

    const swept = await sweepDeadlineAlerts(4);
    expect(swept.dueSoon.map((t) => t.id)).toContain(soon.id);
    expect(swept.duePassed.map((t) => t.id)).toContain(past.id);
    expect(swept.dueSoon.map((t) => t.id)).not.toContain(far.id);

    // Idempotent — second sweep returns nothing for the same tickets.
    const again = await sweepDeadlineAlerts(4);
    expect(again.dueSoon.map((t) => t.id)).not.toContain(soon.id);
    expect(again.duePassed.map((t) => t.id)).not.toContain(past.id);

    // Dashboard view: agent sees overdue + due-soon for their own tickets.
    const view = await deadlineAlerts(
      {
        userId: agentId,
        email: "x@y.z",
        name: "A",
        isInternal: true,
        internalRole: "SUPPORT_AGENT",
        organization: null,
        timezone: "UTC",
      },
      { warnHours: 24 },
    );
    expect(view.dueSoon.some((t) => t.id === soon.id)).toBe(true);
    expect(view.overdue.some((t) => t.id === past.id)).toBe(true);

    await prisma.ticket.deleteMany({
      where: { id: { in: [soon.id, past.id, far.id] } },
    });
    await prisma.contact.delete({ where: { id: contact.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
