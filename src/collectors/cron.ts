import { z } from "zod";
import { CollectorOutput, CronCard, buildWarning, knownMetric, unknownMetric } from "../types.js";
import { runOpenClawJson } from "./openclaw.js";

const cronStatusSchema = z.object({
  enabled: z.boolean(),
  jobs: z.number()
}).passthrough();

const cronJobSchema = z.object({
  enabled: z.boolean().optional(),
  id: z.string(),
  state: z.object({
    consecutiveErrors: z.number().optional(),
    lastStatus: z.string().optional()
  }).optional()
}).passthrough();

const cronListSchema = z.object({
  jobs: z.array(cronJobSchema)
});

const collectFailingCount = (jobs: readonly z.infer<typeof cronJobSchema>[]): number => jobs
  .filter((job) => job.enabled === true)
  .filter((job) => {
    const hasConsecutiveErrors = (job.state?.consecutiveErrors ?? 0) > 0;
    const hasNonOkLastStatus = job.state?.lastStatus !== undefined && job.state?.lastStatus !== "ok";
    return hasConsecutiveErrors || hasNonOkLastStatus;
  })
  .length;

const unknownCronCard = (reason: string): CronCard => ({
  enabledCount: unknownMetric<number>(reason),
  failingOrRecentErrorCount: unknownMetric<number>(reason)
});

export const collectCronCard = async (): Promise<CollectorOutput<CronCard>> => {
  const [cronStatusMetric, cronListMetric] = await Promise.all([
    runOpenClawJson(["cron", "status", "--json"], cronStatusSchema, "openclaw cron status --json"),
    runOpenClawJson(["cron", "list", "--all", "--json"], cronListSchema, "openclaw cron list --all --json")
  ]);

  if (cronListMetric.known && cronListMetric.value !== null) {
    const enabledCount = cronListMetric.value.jobs.filter((job) => job.enabled === true).length;
    const failingOrRecentErrorCount = collectFailingCount(cronListMetric.value.jobs);

    const warnings = cronStatusMetric.known
      ? []
      : [buildWarning(
        "cron",
        "cron_status_unavailable",
        cronStatusMetric.reason ?? "cron status command unavailable",
        "warn"
      )];

    return {
      card: {
        enabledCount: knownMetric(enabledCount),
        failingOrRecentErrorCount: knownMetric(failingOrRecentErrorCount)
      },
      warnings
    };
  }

  if (cronStatusMetric.known && cronStatusMetric.value !== null) {
    return {
      card: {
        enabledCount: knownMetric(cronStatusMetric.value.enabled ? cronStatusMetric.value.jobs : 0),
        failingOrRecentErrorCount: unknownMetric<number>(cronListMetric.reason ?? "cron list unavailable")
      },
      warnings: [buildWarning(
        "cron",
        "cron_list_unavailable",
        cronListMetric.reason ?? "cron list unavailable",
        "warn"
      )]
    };
  }

  const reason = cronListMetric.reason
    ?? cronStatusMetric.reason
    ?? "cron status unavailable";

  return {
    card: unknownCronCard(reason),
    warnings: [buildWarning("cron", "cron_unknown", reason, "warn")]
  };
};
