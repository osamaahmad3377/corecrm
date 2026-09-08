"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function RouteError({
  error,
  reset,
  homeHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
}) {
  useEffect(() => {
    // Client-side visibility; server already logged the detail.
    console.error(error);
  }, [error]);

  const forbidden = /access to this resource|FORBIDDEN|not have access/i.test(
    error.message,
  );

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <AlertTriangle className="size-6" />
      </div>
      <h1 className="text-lg font-semibold">
        {forbidden ? "You don't have access to this page" : "Something went wrong"}
      </h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {forbidden
          ? "Your role doesn't include this area. If you think this is a mistake, contact an administrator."
          : "We hit an unexpected error loading this page. Please try again."}
      </p>
      <div className="mt-5 flex gap-2">
        {!forbidden && (
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
        )}
        <Button asChild>
          <Link href={homeHref}>Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
