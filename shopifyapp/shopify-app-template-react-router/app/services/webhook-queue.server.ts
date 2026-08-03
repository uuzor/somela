import { handleProductWebhook, syncErrorMessage } from "./sync.server";
import { getSharedSql } from "./vector.server";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface ProductWebhookJob {
  id: string;
  webhook_id: string;
  job_key: string;
  shop: string;
  topic: string;
  product_id: string;
  payload: JsonValue;
  attempts: number;
  max_attempts: number;
}

interface ProductWebhookWorkerState {
  running: boolean;
  timer: NodeJS.Timeout | null;
  workerId: string;
  schemaChecked: boolean;
}

export interface ProductWebhookQueueStats {
  pending: number;
  processing: number;
  failed: number;
  lastCompletedAt: Date | null;
}

const workerGlobal = globalThis as typeof globalThis & {
  __oclProductWebhookWorker?: ProductWebhookWorkerState;
};

const worker =
  workerGlobal.__oclProductWebhookWorker ??
  (workerGlobal.__oclProductWebhookWorker = {
    running: false,
    timer: null,
    workerId:
      "shopify_worker_" +
      process.pid +
      "_" +
      Math.random().toString(36).slice(2, 8),
    schemaChecked: false,
  });

const POLL_INTERVAL_MS = 2_000;
const STALE_LOCK_MINUTES = 5;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000];

function productId(payload: JsonValue): string {
  return typeof payload === "object" && payload && "id" in payload
    ? String(payload.id)
    : "unknown";
}

function productKey(shop: string, payload: JsonValue): string {
  return shop + ":" + productId(payload);
}

function newJobId(): string {
  return (
    "shopify_job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10)
  );
}

async function ensureQueueSchema(): Promise<void> {
  if (worker.schemaChecked) return;
  const sql = getSharedSql();
  const rows = await sql<{ table_exists: boolean }[]>`
    SELECT to_regclass('public.shopify_sync_jobs') IS NOT NULL AS table_exists
  `;
  if (!rows[0]?.table_exists) {
    throw new Error(
      "shopify_sync_jobs table is missing; apply 008_shopify_sync_jobs.sql"
    );
  }
  worker.schemaChecked = true;
}

async function recoverStaleJobs(): Promise<void> {
  const sql = getSharedSql();
  const recovered = await sql<{ id: string }[]>`
    UPDATE shopify_sync_jobs
    SET status = 'pending',
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = NOW(),
        updated_at = NOW(),
        last_error = COALESCE(last_error, 'Worker lock expired')
    WHERE status = 'processing'
      AND locked_at < NOW() - (${STALE_LOCK_MINUTES} * INTERVAL '1 minute')
    RETURNING id
  `;
  if (recovered.length > 0) {
    console.warn("[OCL_QUEUE] stale_jobs_recovered", {
      count: recovered.length,
    });
  }
}

async function claimNextJob(): Promise<ProductWebhookJob | null> {
  const sql = getSharedSql();
  const jobs = await sql<ProductWebhookJob[]>`
    WITH candidate AS (
      SELECT queued.id
      FROM shopify_sync_jobs AS queued
      WHERE queued.status = 'pending'
        AND queued.next_attempt_at <= NOW()
        AND NOT EXISTS (
          SELECT 1
          FROM shopify_sync_jobs AS active
          WHERE active.job_key = queued.job_key
            AND active.status = 'processing'
        )
        AND pg_try_advisory_xact_lock(hashtext(queued.job_key))
      ORDER BY queued.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE shopify_sync_jobs AS job
    SET status = 'processing',
        attempts = job.attempts + 1,
        locked_at = NOW(),
        locked_by = ${worker.workerId},
        updated_at = NOW()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.id, job.webhook_id, job.job_key, job.shop, job.topic,
              job.product_id, job.payload, job.attempts, job.max_attempts
  `;
  return jobs[0] ?? null;
}

async function completeJob(job: ProductWebhookJob): Promise<void> {
  const sql = getSharedSql();
  await sql`
    UPDATE shopify_sync_jobs
    SET status = 'completed',
        completed_at = NOW(),
        updated_at = NOW(),
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL
    WHERE id = ${job.id}
  `;
  console.info("[OCL_QUEUE] job_completed", {
    jobId: job.id,
    key: job.job_key,
    attempt: job.attempts,
  });
}

async function rescheduleOrFailJob(
  job: ProductWebhookJob,
  error: unknown
): Promise<void> {
  const sql = getSharedSql();
  const errorMessage = syncErrorMessage(error);
  const exhausted = job.attempts >= job.max_attempts;
  const delayMs =
    RETRY_DELAYS_MS[
      Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)
    ];
  const nextAttemptAt = new Date(Date.now() + delayMs);

  await sql`
    UPDATE shopify_sync_jobs
    SET status = ${exhausted ? "failed" : "pending"},
        next_attempt_at = ${nextAttemptAt},
        locked_at = NULL,
        locked_by = NULL,
        last_error = ${errorMessage},
        updated_at = NOW()
    WHERE id = ${job.id}
  `;
  console.error(
    exhausted ? "[OCL_QUEUE] job_failed" : "[OCL_QUEUE] job_retry_scheduled",
    {
      jobId: job.id,
      key: job.job_key,
      attempt: job.attempts,
      maxAttempts: job.max_attempts,
      nextDelayMs: exhausted ? null : delayMs,
      errorMessage,
    }
  );
}

async function runWorker(): Promise<void> {
  if (worker.running) return;
  worker.running = true;
  try {
    await ensureQueueSchema();
    await recoverStaleJobs();

    let job: ProductWebhookJob | null;
    while ((job = await claimNextJob())) {
      console.info("[OCL_QUEUE] job_claimed", {
        jobId: job.id,
        key: job.job_key,
        webhookId: job.webhook_id,
        attempt: job.attempts,
        maxAttempts: job.max_attempts,
      });
      try {
        await handleProductWebhook(job.shop, job.payload);
        await completeJob(job);
      } catch (error) {
        await rescheduleOrFailJob(job, error);
      }
    }
  } catch (error) {
    console.error("[OCL_QUEUE] worker_cycle_failed", {
      workerId: worker.workerId,
      errorMessage: syncErrorMessage(error),
    });
  } finally {
    worker.running = false;
    scheduleWorker();
  }
}

function scheduleWorker(delayMs = POLL_INTERVAL_MS, wake = false): void {
  if (worker.timer) {
    if (!wake) return;
    clearTimeout(worker.timer);
    worker.timer = null;
  }
  worker.timer = setTimeout(() => {
    worker.timer = null;
    void runWorker();
  }, delayMs);
  worker.timer.unref?.();
}

export function startProductWebhookWorker(): void {
  if (!worker.running && !worker.timer) {
    console.info("[OCL_QUEUE] worker_started", { workerId: worker.workerId });
  }
  scheduleWorker(0);
}

export async function getProductWebhookQueueStats(
  shop: string
): Promise<ProductWebhookQueueStats> {
  await ensureQueueSchema();
  const sql = getSharedSql();
  const rows = await sql<
    {
      pending: string;
      processing: string;
      failed: string;
      last_completed_at: Date | null;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'processing') AS processing,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      MAX(completed_at) AS last_completed_at
    FROM shopify_sync_jobs
    WHERE shop = ${shop}
  `;
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    processing: Number(row?.processing ?? 0),
    failed: Number(row?.failed ?? 0),
    lastCompletedAt: row?.last_completed_at ?? null,
  };
}

export async function retryFailedProductWebhookJobs(
  shop: string
): Promise<number> {
  await ensureQueueSchema();
  const sql = getSharedSql();
  const jobs = await sql<{ id: string }[]>`
    UPDATE shopify_sync_jobs
    SET status = 'pending',
        attempts = 0,
        next_attempt_at = NOW(),
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE shop = ${shop}
      AND status = 'failed'
    RETURNING id
  `;
  if (jobs.length > 0) {
    console.info("[OCL_QUEUE] failed_jobs_requeued", {
      shop,
      count: jobs.length,
    });
    scheduleWorker(0, true);
  }
  return jobs.length;
}

export async function enqueueProductWebhook(
  shop: string,
  payload: JsonValue,
  options: { topic?: string; webhookId?: string | null } = {}
): Promise<{
  accepted: true;
  duplicate: boolean;
  coalesced: boolean;
  key: string;
  jobId: string | null;
}> {
  await ensureQueueSchema();
  const sql = getSharedSql();
  const id = newJobId();
  const key = productKey(shop, payload);
  const webhookId = options.webhookId ?? "generated:" + id;
  const topic = options.topic ?? "PRODUCTS_UPDATE";
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO shopify_sync_jobs (
      id, webhook_id, job_key, shop, topic, product_id, payload
    ) VALUES (
      ${id}, ${webhookId}, ${key}, ${shop}, ${topic},
      ${productId(payload)}, ${sql.json(payload)}
    )
    ON CONFLICT (webhook_id) DO NOTHING
    RETURNING id
  `;

  if (inserted.length === 0) {
    console.info("[OCL_QUEUE] duplicate_delivery_ignored", {
      key,
      webhookId,
    });
    scheduleWorker(0, true);
    return {
      accepted: true,
      duplicate: true,
      coalesced: false,
      key,
      jobId: null,
    };
  }

  console.info("[OCL_QUEUE] job_persisted", {
    jobId: id,
    key,
    webhookId,
  });
  scheduleWorker(0, true);
  return {
    accepted: true,
    duplicate: false,
    coalesced: false,
    key,
    jobId: id,
  };
}
