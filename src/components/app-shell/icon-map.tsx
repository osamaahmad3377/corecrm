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
import type { NavIconKey } from "./nav-config";

export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  tickets: Ticket,
  organizations: Building2,
  contacts: Contact,
  email: Mail,
  assets: HardDrive,
  reports: BarChart3,
  team: Users,
  settings: Settings,
  create: Plus,
  notifications: Bell,
  profile: User,
};
