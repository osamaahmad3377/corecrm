import { Brand } from "@/components/brand";
import { APP_DESCRIPTION } from "@/lib/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Brand />
          <p className="text-sm text-muted-foreground">{APP_DESCRIPTION}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
