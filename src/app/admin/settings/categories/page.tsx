import { requireInternal } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToneBadge } from "@/components/badges";

export default async function CategoriesSettingsPage() {
  await requireInternal("SUPPORT_MANAGER");
  const categories = await prisma.ticketCategory.findMany({
    where: { parentId: null },
    orderBy: { order: "asc" },
    include: { children: { orderBy: { order: "asc" } } },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Ticket categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Categories and subcategories organise incoming tickets. The active set
          is seeded with the database and can be extended in{" "}
          <code className="rounded bg-muted px-1">prisma/seed.ts</code>.
        </p>
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {!c.isActive && <ToneBadge tone="neutral">Inactive</ToneBadge>}
              </div>
              {c.children.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.children.map((sub) => (
                    <span
                      key={sub.id}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {sub.name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
