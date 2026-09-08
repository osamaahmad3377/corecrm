import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

export function Brand({
  className,
  showName = true,
}: {
  className?: string;
  showName?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <LifeBuoy className="size-4" />
      </div>
      {showName && (
        <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
      )}
    </div>
  );
}
