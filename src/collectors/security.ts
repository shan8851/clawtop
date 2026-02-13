import { z } from "zod";
import { CollectorOutput, Metric, SecurityCard, buildWarning, knownMetric, unknownMetric } from "../types.js";
import { runOpenClawJson } from "./openclaw.js";
import { StatusSource } from "./statusSource.js";

const securityAuditSchema = z.object({
  summary: z.object({
    critical: z.number(),
    info: z.number(),
    warn: z.number()
  })
}).passthrough();

const securityFromSummary = (
  summary: { critical: number; info: number; warn: number }
): SecurityCard => ({
  critical: knownMetric(summary.critical),
  info: knownMetric(summary.info),
  warning: knownMetric(summary.warn)
});

const unknownSecurityCard = (reason: string): SecurityCard => ({
  critical: unknownMetric<number>(reason),
  info: unknownMetric<number>(reason),
  warning: unknownMetric<number>(reason)
});

export const collectSecurityCard = async (
  statusSourceMetric: Metric<StatusSource>
): Promise<CollectorOutput<SecurityCard>> => {
  const securityAuditMetric = await runOpenClawJson(
    ["security", "audit", "--json"],
    securityAuditSchema,
    "openclaw security audit --json"
  );

  if (securityAuditMetric.known && securityAuditMetric.value !== null) {
    return {
      card: securityFromSummary(securityAuditMetric.value.summary),
      warnings: []
    };
  }

  const fallbackSummary = statusSourceMetric.value?.securityAudit?.summary;

  if (fallbackSummary !== undefined) {
    return {
      card: securityFromSummary(fallbackSummary),
      warnings: [buildWarning(
        "security",
        "security_audit_fallback_status",
        securityAuditMetric.reason ?? "security audit command unavailable",
        "warn"
      )]
    };
  }

  const reason = securityAuditMetric.reason
    ?? statusSourceMetric.reason
    ?? "security summary unavailable";

  return {
    card: unknownSecurityCard(reason),
    warnings: [buildWarning("security", "security_summary_unknown", reason, "warn")]
  };
};
