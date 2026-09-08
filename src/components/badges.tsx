import { cn } from "@/lib/utils";
import {
  Tone,
  priorityTone,
  statusTone,
  toneBadgeClass,
  toneDotClass,
} from "@/lib/design-tokens";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function StatusBadge({
  statusKey,
  label,
  className,
}: {
  statusKey: string;
  label: string;
  className?: string;
}) {
  const tone = statusTone(statusKey);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneBadgeClass[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", toneDotClass[tone])} />
      {label}
    </span>
  );
}

export function PriorityBadge({
  priorityKey,
  label,
  className,
}: {
  priorityKey: string;
  label: string;
  className?: string;
}) {
  const tone = priorityTone(priorityKey);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium",
        toneBadgeClass[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", toneDotClass[tone])} />
      {label}
    </span>
  );
}

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneBadgeClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function UserAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-6", className)}>
      {image ? <AvatarImage src={image} alt={name} /> : null}
      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function OrganizationBadge({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {name}
    </span>
  );
}
