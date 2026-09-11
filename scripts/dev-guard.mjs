/**
 * Guards against the single most disruptive local failure mode: two `next dev`
 * servers running against the same project.
 *
 * Next silently falls back to the next free port, so a second `npm run dev`
 * looks like it worked — but both processes compile into the same `.next`
 * directory and shred each other's webpack chunks. The symptoms are wildly
 * misleading: "Cannot find module './vendor-chunks/*.js'", stylesheets 404ing
 * so pages render unstyled, dashboards showing no data, and server actions
 * failing with a generic 500.
 *
 * So before every dev run: kill any other dev server belonging to this project,
 * and if we found one, throw away `.next` because it may already be corrupt.
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PORT = process.env.PORT ?? "3000";
const me = process.pid;

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    return "";
  }
}

/** PIDs of `next dev` / `next-server` processes whose working directory is this project. */
function stalePids() {
  const pids = new Set();

  for (const pid of sh(`pgrep -f "next dev|next-server"`).split("\n")) {
    const id = pid.trim();
    if (!id || Number(id) === me) continue;
    // lsof tells us each process's cwd; only ours matter.
    const cwd = sh(`lsof -a -p ${id} -d cwd -Fn`)
      .split("\n")
      .find((l) => l.startsWith("n"))
      ?.slice(1);
    if (cwd === ROOT) pids.add(id);
  }

  // Anything holding our port blocks the run regardless of who started it.
  for (const pid of sh(`lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t`).split("\n")) {
    const id = pid.trim();
    if (id && Number(id) !== me) pids.add(id);
  }

  return [...pids];
}

const stale = stalePids();

if (stale.length) {
  console.log(
    `[dev-guard] stopping ${stale.length} stale dev server(s): ${stale.join(", ")}`,
  );
  for (const pid of stale) sh(`kill -9 ${pid}`);

  // A collision may already have corrupted the build output.
  console.log("[dev-guard] clearing .next (may have been corrupted)");
  rmSync(join(ROOT, ".next"), { recursive: true, force: true });
  rmSync(join(ROOT, "node_modules/.cache"), { recursive: true, force: true });
}
