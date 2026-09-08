/**
 * Database seed — development data.
 *
 * Creates ticket configuration (statuses, priorities, categories, SLA),
 * one client organization (ABC Manufacturing) with contacts and assets,
 * internal staff and client users, and a handful of sample tickets with
 * conversations.
 *
 * Dev passwords are printed at the end. NEVER run this against production data
 * you care about — it upserts config but also creates demo accounts.
 *
 * No fake OAuth credentials / email accounts are created.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEV_PASSWORD = "Passw0rd!2026";

async function hash() {
  return bcrypt.hash(DEV_PASSWORD, 12);
}

async function main() {
  const pw = await hash();

  // --- Statuses ---
  const statuses = [
    { key: "NEW", label: "New", colorToken: "status.new", order: 1, isDefault: true },
    { key: "OPEN", label: "Open", colorToken: "status.open", order: 2 },
    { key: "IN_PROGRESS", label: "In Progress", colorToken: "status.progress", order: 3 },
    { key: "WAITING_FOR_CLIENT", label: "Waiting for Client", colorToken: "status.waitClient", order: 4 },
    { key: "WAITING_FOR_INTERNAL", label: "Waiting for Internal Team", colorToken: "status.waitInternal", order: 5 },
    { key: "RESOLVED", label: "Resolved", colorToken: "status.resolved", order: 6, isTerminal: true },
    { key: "CLOSED", label: "Closed", colorToken: "status.closed", order: 7, isTerminal: true },
    { key: "CANCELLED", label: "Cancelled", colorToken: "status.cancelled", order: 8, isTerminal: true },
  ];
  for (const s of statuses) {
    await prisma.ticketStatus.upsert({
      where: { key: s.key },
      create: s,
      update: { label: s.label, order: s.order, colorToken: s.colorToken, isTerminal: s.isTerminal ?? false, isDefault: s.isDefault ?? false },
    });
  }

  // --- Priorities ---
  const priorities = [
    { key: "LOW", label: "Low", colorToken: "priority.low", order: 1 },
    { key: "MEDIUM", label: "Medium", colorToken: "priority.medium", order: 2, isDefault: true },
    { key: "HIGH", label: "High", colorToken: "priority.high", order: 3 },
    { key: "CRITICAL", label: "Critical", colorToken: "priority.critical", order: 4 },
  ];
  for (const p of priorities) {
    await prisma.ticketPriority.upsert({
      where: { key: p.key },
      create: p,
      update: { label: p.label, order: p.order, colorToken: p.colorToken, isDefault: p.isDefault ?? false },
    });
  }
  const prio = Object.fromEntries(
    (await prisma.ticketPriority.findMany()).map((p) => [p.key, p]),
  );

  // --- Categories ---
  const catTree: Record<string, string[]> = {
    Hardware: ["Laptop", "Desktop", "Printer", "Peripherals"],
    Software: ["Microsoft 365", "Operating System", "Line-of-business app"],
    Network: ["Wi-Fi", "VPN", "Internet outage", "Firewall"],
    Accounts: ["Password reset", "New starter", "Leaver", "Permissions"],
    Email: ["Delivery issue", "Spam / phishing", "Mailbox setup"],
    Security: ["Suspected compromise", "Malware", "Policy question"],
  };
  for (const [parent, children] of Object.entries(catTree)) {
    const p = await prisma.ticketCategory.upsert({
      where: { parentId_name: { parentId: null as never, name: parent } },
      create: { name: parent },
      update: {},
    }).catch(async () => {
      const existing = await prisma.ticketCategory.findFirst({
        where: { name: parent, parentId: null },
      });
      return existing ?? prisma.ticketCategory.create({ data: { name: parent } });
    });
    for (const child of children) {
      const exists = await prisma.ticketCategory.findFirst({
        where: { name: child, parentId: p.id },
      });
      if (!exists) {
        await prisma.ticketCategory.create({
          data: { name: child, parentId: p.id },
        });
      }
    }
  }

  // --- SLA policy (global default) ---
  let sla = await prisma.slaPolicy.findFirst({
    where: { organizationId: null, isDefault: true },
  });
  if (!sla) {
    sla = await prisma.slaPolicy.create({
      data: { name: "Standard SLA", isDefault: true },
    });
  }
  const slaTargets = [
    { key: "CRITICAL", response: 30, resolution: 4 * 60 },
    { key: "HIGH", response: 2 * 60, resolution: 8 * 60 },
    { key: "MEDIUM", response: 8 * 60, resolution: 3 * 24 * 60 },
    { key: "LOW", response: 24 * 60, resolution: 5 * 24 * 60 },
  ];
  for (const t of slaTargets) {
    await prisma.slaTarget.upsert({
      where: {
        slaPolicyId_priorityId: {
          slaPolicyId: sla.id,
          priorityId: prio[t.key].id,
        },
      },
      create: {
        slaPolicyId: sla.id,
        priorityId: prio[t.key].id,
        responseMinutes: t.response,
        resolutionMinutes: t.resolution,
      },
      update: { responseMinutes: t.response, resolutionMinutes: t.resolution },
    });
  }

  // --- Tags ---
  for (const name of ["billing", "onboarding", "urgent-callback", "known-issue"]) {
    await prisma.tag.upsert({ where: { name }, create: { name }, update: {} });
  }

  // --- Internal users ---
  const internal = [
    { email: "superadmin@corecrm.dev", name: "Alex Super", role: "SUPER_ADMIN" as const },
    { email: "admin@corecrm.dev", name: "Morgan Admin", role: "ADMIN" as const },
    { email: "manager@corecrm.dev", name: "Sam Manager", role: "SUPPORT_MANAGER" as const },
    { email: "agent@corecrm.dev", name: "Riley Agent", role: "SUPPORT_AGENT" as const },
    { email: "agent2@corecrm.dev", name: "Jordan Tech", role: "SUPPORT_AGENT" as const },
  ];
  const staff: Record<string, { id: string }> = {};
  for (const u of internal) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        hashedPassword: pw,
        isInternal: true,
        internalRole: u.role,
        status: "ACTIVE",
        emailVerified: new Date(),
        timezone: "Australia/Sydney",
      },
      update: { hashedPassword: pw, internalRole: u.role, status: "ACTIVE" },
    });
    staff[u.role === "SUPPORT_AGENT" ? u.email : u.role] = user;
  }

  // --- Team ---
  let team = await prisma.team.findFirst({ where: { name: "Service Desk" } });
  if (!team) team = await prisma.team.create({ data: { name: "Service Desk", description: "First-line support" } });
  for (const email of ["agent@corecrm.dev", "agent2@corecrm.dev"]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      const m = await prisma.teamMember.findFirst({
        where: { teamId: team.id, userId: u.id },
      });
      if (!m) await prisma.teamMember.create({ data: { teamId: team.id, userId: u.id } });
    }
  }

  // --- Organization: ABC Manufacturing ---
  let org = await prisma.organization.findFirst({
    where: { name: "ABC Manufacturing Pty Ltd" },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "ABC Manufacturing Pty Ltd",
        legalName: "ABC Manufacturing Proprietary Limited",
        website: "https://abc-manufacturing.example.com",
        industry: "Manufacturing",
        addressLine1: "12 Industrial Way",
        city: "Newcastle",
        state: "NSW",
        country: "Australia",
        postalCode: "2300",
        mainPhone: "+61 2 4900 0000",
        mainEmail: "it@abc-manufacturing.example.com",
        accountManagerId: staff["SUPPORT_MANAGER"].id,
        notes: "Priority client. On-site visits by arrangement.",
      },
    });
  }

  // A second org to prove isolation.
  let org2 = await prisma.organization.findFirst({
    where: { name: "XYZ Construction Group" },
  });
  if (!org2) {
    org2 = await prisma.organization.create({
      data: {
        name: "XYZ Construction Group",
        industry: "Construction",
        city: "Perth",
        country: "Australia",
        mainEmail: "support@xyz-construction.example.com",
      },
    });
  }

  // --- Contacts ---
  const contactData = [
    { first: "John", last: "Smith", email: "john@abc-manufacturing.example.com", position: "IT Coordinator", primary: true },
    { first: "Sarah", last: "Jones", email: "sarah@abc-manufacturing.example.com", position: "Operations Manager" },
    { first: "David", last: "Brown", email: "david@abc-manufacturing.example.com", position: "Plant Supervisor" },
  ];
  const contacts: Record<string, { id: string }> = {};
  for (const c of contactData) {
    const contact = await prisma.contact.upsert({
      where: { organizationId_email: { organizationId: org.id, email: c.email } },
      create: {
        organizationId: org.id,
        firstName: c.first,
        lastName: c.last,
        email: c.email,
        position: c.position,
        isPrimary: c.primary ?? false,
        phone: "+61 2 4900 0001",
      },
      update: {},
    });
    contacts[c.first] = contact;
  }

  // --- Client users ---
  const clientUsers = [
    { email: "john@abc-manufacturing.example.com", name: "John Smith", role: "CLIENT_ADMIN" as const },
    { email: "sarah@abc-manufacturing.example.com", name: "Sarah Jones", role: "CLIENT_USER" as const },
  ];
  const clients: Record<string, { id: string }> = {};
  for (const cu of clientUsers) {
    const user = await prisma.user.upsert({
      where: { email: cu.email },
      create: {
        email: cu.email,
        name: cu.name,
        hashedPassword: pw,
        isInternal: false,
        status: "ACTIVE",
        emailVerified: new Date(),
        timezone: "Australia/Sydney",
      },
      update: { hashedPassword: pw, status: "ACTIVE" },
    });
    clients[cu.name] = user;
    await prisma.organizationUser.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
      create: { userId: user.id, organizationId: org.id, role: cu.role },
      update: { role: cu.role },
    });
  }

  // --- Assets ---
  const assetData = [
    { name: "JSMITH-LT01", assetType: "LAPTOP" as const, manufacturer: "Dell", model: "Latitude 7440", serialNumber: "DL7440-0001", hostname: "jsmith-lt01" },
    { name: "Plant Floor PC", assetType: "DESKTOP" as const, manufacturer: "HP", model: "ProDesk 400", serialNumber: "HP400-0002" },
    { name: "Main Firewall", assetType: "FIREWALL" as const, manufacturer: "Fortinet", model: "FortiGate 60F", ipAddress: "10.0.0.1" },
    { name: "abc-manufacturing.example.com", assetType: "DOMAIN" as const },
  ];
  const assets: { id: string }[] = [];
  for (const a of assetData) {
    let asset = await prisma.asset.findFirst({
      where: { organizationId: org.id, name: a.name },
    });
    if (!asset) {
      asset = await prisma.asset.create({
        data: { ...a, organizationId: org.id },
      });
    }
    assets.push(asset);
  }

  // --- Sample tickets ---
  const existingTickets = await prisma.ticket.count({ where: { organizationId: org.id } });
  if (existingTickets === 0) {
    const statusMap = Object.fromEntries(
      (await prisma.ticketStatus.findMany()).map((s) => [s.key, s]),
    );

    const year = new Date().getUTCFullYear();
    let seq = 0;
    const num = () => {
      seq += 1;
      return `TKT-${year}-${String(seq).padStart(6, "0")}`;
    };
    await prisma.counter.upsert({
      where: { id: `ticket:${year}` },
      create: { id: `ticket:${year}`, value: 6 },
      update: { value: 6 },
    });

    const samples = [
      {
        subject: "Laptop cannot connect to Wi-Fi",
        description: "My laptop (JSMITH-LT01) won't connect to the office Wi-Fi since this morning. Other devices work fine.",
        contact: "John",
        status: "IN_PROGRESS",
        priority: "HIGH",
        agent: "agent@corecrm.dev",
        asset: 0,
        messages: [
          { from: "AGENT", body: "Hi John, thanks for reaching out. Can you please restart the laptop and try forgetting the Wi-Fi network, then reconnecting?" },
          { from: "CLIENT", body: "Done that, still no luck. It says 'can't connect to this network'." },
          { from: "NOTE", body: "Checked Entra sign-in logs — device has a stale primary refresh token. Will schedule a re-join." },
          { from: "AGENT", body: "Thanks for trying. We'll need to re-join the device to the domain — I'll call you shortly to arrange a time." },
        ],
      },
      {
        subject: "New starter account for Monday",
        description: "We have a new operator starting Monday — please set up an account, email, and access to the production dashboard.",
        contact: "Sarah",
        status: "WAITING_FOR_CLIENT",
        priority: "MEDIUM",
        agent: "agent2@corecrm.dev",
        messages: [
          { from: "AGENT", body: "Happy to help. Could you confirm the new starter's full name, job title and which manager they report to?" },
        ],
      },
      {
        subject: "Internet outage at the plant",
        description: "The whole site has lost internet access. Production reporting is down.",
        contact: "David",
        status: "RESOLVED",
        priority: "CRITICAL",
        agent: "agent@corecrm.dev",
        asset: 2,
        messages: [
          { from: "AGENT", body: "We can see the primary link is down at the carrier. Failover to the 4G backup should kick in within a few minutes." },
          { from: "CLIENT", body: "We're back online now, thank you." },
          { from: "AGENT", body: "Great. The carrier has confirmed a fault on their side with an ETA for full restoration this afternoon. Marking as resolved — reply here if anything changes." },
        ],
      },
      {
        subject: "Outlook keeps asking for password",
        description: "Outlook on the plant floor PC prompts for a password every few minutes and never accepts it.",
        contact: "David",
        status: "OPEN",
        priority: "MEDIUM",
        asset: 1,
        messages: [],
      },
      {
        subject: "Suspicious email reported",
        description: "One of the team received an email claiming to be from the CEO asking for gift cards. Forwarding for review.",
        contact: "John",
        status: "NEW",
        priority: "HIGH",
        messages: [],
      },
      {
        subject: "Request: quarterly access review",
        description: "Please send the current list of users and their access levels for our quarterly review.",
        contact: "Sarah",
        status: "CLOSED",
        priority: "LOW",
        agent: "agent2@corecrm.dev",
        messages: [
          { from: "AGENT", body: "Attached is the current access report. Let us know if you'd like any changes." },
          { from: "CLIENT", body: "All looks correct, thanks. Please close." },
        ],
      },
    ];

    for (const s of samples) {
      const createdAt = new Date(Date.now() - (samples.indexOf(s) + 1) * 36 * 3600_000);
      const contact = contacts[s.contact];
      const clientUser =
        s.contact === "John"
          ? clients["John Smith"]
          : s.contact === "Sarah"
            ? clients["Sarah Jones"]
            : null;
      const agent = s.agent
        ? await prisma.user.findUnique({ where: { email: s.agent } })
        : null;

      const target = slaTargets.find((t) => t.key === s.priority)!;
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: num(),
          organizationId: org.id,
          requesterContactId: contact.id,
          requesterUserId: clientUser?.id ?? null,
          subject: s.subject,
          description: `<p>${s.description}</p>`,
          statusId: statusMap[s.status].id,
          priorityId: prio[s.priority].id,
          slaPolicyId: sla.id,
          assignedAgentId: agent?.id ?? null,
          assignedTeamId: agent ? team.id : null,
          source: "PORTAL",
          assetId: s.asset !== undefined ? assets[s.asset].id : null,
          responseDueAt: new Date(createdAt.getTime() + target.response * 60000),
          resolutionDueAt: new Date(createdAt.getTime() + target.resolution * 60000),
          firstResponseAt: s.messages.some((m) => m.from === "AGENT")
            ? new Date(createdAt.getTime() + 20 * 60000)
            : null,
          resolvedAt: ["RESOLVED", "CLOSED"].includes(s.status)
            ? new Date(createdAt.getTime() + 6 * 3600_000)
            : null,
          closedAt: s.status === "CLOSED" ? new Date(createdAt.getTime() + 8 * 3600_000) : null,
          createdAt,
          activities: {
            create: [{ type: "CREATED", toValue: "seed", actorUserId: clientUser?.id ?? null, createdAt }],
          },
        },
      });

      let offset = 30;
      for (const m of s.messages) {
        offset += 45;
        const when = new Date(createdAt.getTime() + offset * 60000);
        if (m.from === "NOTE") {
          await prisma.ticketMessage.create({
            data: {
              ticketId: ticket.id,
              authorUserId: agent?.id ?? null,
              authorType: "AGENT",
              messageType: "INTERNAL_NOTE",
              body: `<p>${m.body}</p>`,
              createdAt: when,
            },
          });
          await prisma.ticketActivity.create({
            data: { ticketId: ticket.id, type: "INTERNAL_NOTE", actorUserId: agent?.id ?? null, createdAt: when },
          });
        } else {
          const isAgent = m.from === "AGENT";
          await prisma.ticketMessage.create({
            data: {
              ticketId: ticket.id,
              authorUserId: isAgent ? agent?.id ?? null : null,
              authorContactId: isAgent ? null : contact.id,
              authorType: isAgent ? "AGENT" : "CLIENT",
              messageType: "PUBLIC_REPLY",
              body: `<p>${m.body}</p>`,
              createdAt: when,
            },
          });
          await prisma.ticketActivity.create({
            data: {
              ticketId: ticket.id,
              type: "PUBLIC_REPLY",
              actorUserId: isAgent ? agent?.id ?? null : null,
              createdAt: when,
            },
          });
        }
      }
    }
  }

  console.log("\n✅ Seed complete\n");
  console.log("Internal users (all password: " + DEV_PASSWORD + ")");
  internal.forEach((u) => console.log(`  ${u.role.padEnd(16)} ${u.email}`));
  console.log("\nClient users (all password: " + DEV_PASSWORD + ")");
  clientUsers.forEach((u) => console.log(`  ${u.role.padEnd(16)} ${u.email}`));
  console.log("\nOrganizations: ABC Manufacturing Pty Ltd, XYZ Construction Group");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
