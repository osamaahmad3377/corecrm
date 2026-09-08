/**
 * Navigation config. Icons are string keys (not components) so this object can
 * cross the server → client boundary as plain data. `icon-map.tsx` resolves the
 * key to a Lucide component on the client.
 */

export type NavIconKey =
  | "dashboard"
  | "tickets"
  | "organizations"
  | "contacts"
  | "email"
  | "assets"
  | "reports"
  | "team"
  | "settings"
  | "create"
  | "notifications"
  | "profile";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIconKey;
  exact?: boolean;
  children?: { label: string; href: string }[];
}

export const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard", exact: true },
  {
    label: "Tickets",
    href: "/admin/tickets",
    icon: "tickets",
    children: [
      { label: "All tickets", href: "/admin/tickets" },
      { label: "My tickets", href: "/admin/tickets?view=my" },
      { label: "Unassigned", href: "/admin/tickets?view=unassigned" },
      { label: "Critical", href: "/admin/tickets?view=critical" },
      { label: "SLA breached", href: "/admin/tickets?view=sla-breached" },
    ],
  },
  { label: "Organizations", href: "/admin/organizations", icon: "organizations" },
  { label: "Contacts", href: "/admin/contacts", icon: "contacts" },
  {
    label: "Email Center",
    href: "/admin/emails",
    icon: "email",
    children: [
      { label: "Inbox", href: "/admin/emails/inbox" },
      { label: "Accounts", href: "/admin/emails/accounts" },
    ],
  },
  { label: "Assets", href: "/admin/assets", icon: "assets" },
  { label: "Reports", href: "/admin/reports", icon: "reports" },
  { label: "Team", href: "/admin/team", icon: "team" },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: "settings",
    children: [
      { label: "General", href: "/admin/settings" },
      { label: "Categories", href: "/admin/settings/categories" },
      { label: "Priorities", href: "/admin/settings/priorities" },
      { label: "SLA", href: "/admin/settings/sla" },
      { label: "Security", href: "/admin/settings/security" },
    ],
  },
];

export const portalNav: NavItem[] = [
  { label: "Dashboard", href: "/portal", icon: "dashboard", exact: true },
  { label: "My tickets", href: "/portal/tickets", icon: "tickets" },
  { label: "Create ticket", href: "/portal/tickets/new", icon: "create" },
  { label: "Organization", href: "/portal/organization", icon: "organizations" },
  { label: "Users", href: "/portal/users", icon: "team" },
  { label: "Notifications", href: "/portal/notifications", icon: "notifications" },
  { label: "Profile", href: "/portal/profile", icon: "profile" },
];
