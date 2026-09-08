"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function MarkAllReadButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/notifications", { method: "POST" });
          router.refresh();
        })
      }
    >
      <Check className="size-4" /> Mark all read
    </Button>
  );
}
