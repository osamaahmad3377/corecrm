import {
  LayoutDashboard,
  Ticket,
  Building2,
  Contact,
  Mail,
  HardDrive,
  BarChart3,
  Users,
  Settings,
  Plus,
  Bell,
  User,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  children?: { label: string; href: string }[];
}

export const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
  {
    label: "Tickets",
    href: "/admin/tickets",
    icon: Ticket,
    children: [
      { label: "All tickets", href: "/admin/tickets" },
      { label: "My tickets", href: "/admin/tickets?view=my" },
      { label: "Unassigned", href: "/admin/tickets?view=unassigned" },
      { label: "Critical", href: "/admin/tickets?view=critical" },
      { label: "SLA breached", href: "/admin/tickets?view=sla-breached" },
    ],
  },
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "Contacts", href: "/admin/contacts", icon: Contact },
  {
    label: "Email Center",
    href: "/admin/emails",
    icon: Mail,
    children: [
      { label: "Inbox", href: "/admin/emails/inbox" },
      { label: "Accounts", href: "/admin/emails/accounts" },
    ],
  },
  { label: "Assets", href: "/admin/assets", icon: HardDrive },
  { label: "Reports", href: "/admin/reports", icon: BarChart3 },
  { label: "Team", href: "/admin/team", icon: Users },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
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
  { label: "Dashboard", href: "/portal", icon: LayoutDashboard, exact: true },
  { label: "My tickets", href: "/portal/tickets", icon: Ticket },
  { label: "Create ticket", href: "/portal/tickets/new", icon: Plus },
  { label: "Organization", href: "/portal/organization", icon: Building2 },
  { label: "Users", href: "/portal/users", icon: Users },
  { label: "Notifications", href: "/portal/notifications", icon: Bell },
  { label: "Profile", href: "/portal/profile", icon: User },
];
