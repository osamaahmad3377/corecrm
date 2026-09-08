import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInternal } from "@/server/auth/context";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Task" };

export default async function EmployeeTaskPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const ctx = await requireInternal();
  const { ticketId } = await params;
  try {
    return <TicketDetail ctx={ctx} ticketId={ticketId} mode="employee" />;
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}
