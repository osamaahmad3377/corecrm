import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth/context";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Ticket" };

export default async function PortalTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const ctx = await requireAuth();
  const { ticketId } = await params;

  try {
    return <TicketDetail ctx={ctx} ticketId={ticketId} mode="portal" />;
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN"))
      notFound();
    throw e;
  }
}
