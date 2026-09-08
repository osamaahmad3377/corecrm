import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Button asChild className="mt-5">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
