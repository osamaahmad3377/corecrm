import { describe, expect, it } from "vitest";
import {
  can,
  hasInternalRank,
  type AuthContext,
} from "@/server/auth/rbac";

function internal(role: AuthContext["internalRole"]): AuthContext {
  return {
    userId: "u1",
    email: "a@b.c",
    name: "Test",
    isInternal: true,
    internalRole: role,
    organization: null,
    timezone: "UTC",
  };
}

function client(role: "CLIENT_ADMIN" | "CLIENT_USER"): AuthContext {
  return {
    userId: "u2",
    email: "c@d.e",
    name: "Client",
    isInternal: false,
    internalRole: null,
    organization: { id: "org1", role },
    timezone: "UTC",
  };
}

describe("RBAC can()", () => {
  it("super admin can do everything", () => {
    expect(can(internal("SUPER_ADMIN"), "internal.settings.manage")).toBe(true);
    expect(can(internal("SUPER_ADMIN"), "email.account.manage")).toBe(true);
    expect(can(internal("SUPER_ADMIN"), "ticket.viewInternal")).toBe(true);
  });

  it("support agent cannot manage email accounts or org", () => {
    expect(can(internal("SUPPORT_AGENT"), "email.account.manage")).toBe(false);
    expect(can(internal("SUPPORT_AGENT"), "org.create")).toBe(false);
    expect(can(internal("SUPPORT_AGENT"), "internal.audit.view")).toBe(false);
  });

  it("support agent can work tickets and use the inbox", () => {
    expect(can(internal("SUPPORT_AGENT"), "ticket.publicReply")).toBe(true);
    expect(can(internal("SUPPORT_AGENT"), "ticket.internalNote")).toBe(true);
    expect(can(internal("SUPPORT_AGENT"), "email.inbox.view")).toBe(true);
  });

  it("support manager can assign and configure but not manage users", () => {
    expect(can(internal("SUPPORT_MANAGER"), "ticket.assign")).toBe(true);
    expect(can(internal("SUPPORT_MANAGER"), "ticketConfig.manage")).toBe(true);
    expect(can(internal("SUPPORT_MANAGER"), "internal.users.manage")).toBe(false);
  });

  it("clients cannot see internal notes or other-org data", () => {
    expect(can(client("CLIENT_ADMIN"), "ticket.viewInternal")).toBe(false);
    expect(can(client("CLIENT_ADMIN"), "ticket.internalNote")).toBe(false);
    expect(can(client("CLIENT_USER"), "ticket.viewAll")).toBe(false);
    expect(can(client("CLIENT_USER"), "org.viewAll")).toBe(false);
  });

  it("client admin can manage their own org users, client user cannot", () => {
    expect(can(client("CLIENT_ADMIN"), "portal.users.manage")).toBe(true);
    expect(can(client("CLIENT_USER"), "portal.users.manage")).toBe(false);
  });

  it("both client roles can create and reply on tickets", () => {
    for (const role of ["CLIENT_ADMIN", "CLIENT_USER"] as const) {
      expect(can(client(role), "ticket.create")).toBe(true);
      expect(can(client(role), "ticket.publicReply")).toBe(true);
    }
  });
});

describe("hasInternalRank", () => {
  it("respects the rank ladder", () => {
    expect(hasInternalRank(internal("ADMIN"), "SUPPORT_MANAGER")).toBe(true);
    expect(hasInternalRank(internal("SUPPORT_AGENT"), "SUPPORT_MANAGER")).toBe(false);
    expect(hasInternalRank(client("CLIENT_ADMIN"), "SUPPORT_AGENT")).toBe(false);
  });
});
