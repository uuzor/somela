import type { LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { getSharedSql } from "../services/vector.server";

export const loader = async (_args: LoaderFunctionArgs) => {
  try {
    const sql = getSharedSql();
    const [, queueTable] = await Promise.all([
      prisma.$queryRawUnsafe("SELECT 1"),
      sql<{ queue_ready: boolean }[]>`
        SELECT to_regclass('public.shopify_sync_jobs') IS NOT NULL AS queue_ready
      `,
    ]);
    if (!queueTable[0]?.queue_ready) {
      throw new Error("Webhook queue table is missing");
    }
    return Response.json(
      { ok: true, database: "ready", queue: "ready" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[OCL_HEALTH] readiness_check_failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { ok: false, database: "unavailable" },
      { status: 503 }
    );
  }
};
