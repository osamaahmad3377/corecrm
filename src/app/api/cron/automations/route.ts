import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  evaluateTimeBasedRules,
  processDueAutomationJobs,
} from "@/server/services/automation";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const header = req.headers.get("authorization");
  return (
    header === `Bearer ${env.CRON_SECRET}` ||
    req.nextUrl.searchParams.get("secret") === env.CRON_SECRET
  );
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  // 1. Scan time-based rules and schedule any new jobs.
  const evaluated = await evaluateTimeBasedRules();

  // 2. Send everything that's now due (event-scheduled + time-based).
  const processed = await processDueAutomationJobs(150);

  logger.info("cron.automations", { evaluated, processed });
  return Response.json({ ok: true, evaluated, processed });
}

export const POST = GET;
