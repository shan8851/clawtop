import {
  BoardWarning,
  BoardSnapshot,
  Metric,
  OverallCard
} from "./types.js";
import { collectAgentsCard } from "./collectors/agents.js";
import { collectChannelsCard } from "./collectors/channels.js";
import { collectCompatibilityWarnings } from "./collectors/compatibility.js";
import { collectCronCard } from "./collectors/cron.js";
import { collectGatewayCard } from "./collectors/gateway.js";
import { collectRepoDriftCard } from "./collectors/repoDrift.js";
import { collectSecurityCard } from "./collectors/security.js";
import { collectSessionsCard, defaultActiveSessionWindowMinutes } from "./collectors/sessions.js";
import { collectStatusSource } from "./collectors/statusSource.js";
import { collectVersionDriftCard } from "./collectors/versionDrift.js";

const metricGreaterThan = (metric: Metric<number>, threshold: number): boolean => (
  metric.known && metric.value !== null && metric.value > threshold
);

const metricEqualsBoolean = (metric: Metric<boolean>, expected: boolean): boolean => (
  metric.known && metric.value === expected
);

const metricUnknown = (metric: Metric<unknown>): boolean => !metric.known;

const warningKey = (warning: BoardWarning): string => [
  warning.source,
  warning.code,
  warning.reason,
  warning.context ?? ""
].join("|");

const uniqueWarnings = (warnings: readonly BoardWarning[]): readonly BoardWarning[] => {
  const warningsByKey = warnings.reduce<Map<string, BoardWarning>>((accumulator, warning) => {
    const key = warningKey(warning);

    if (!accumulator.has(key)) {
      accumulator.set(key, warning);
    }

    return accumulator;
  }, new Map<string, BoardWarning>());

  return Array.from(warningsByKey.values());
};

export const deriveOverallCard = (
  snapshotWithoutOverall: Omit<BoardSnapshot, "overall">
): OverallCard => {
  const redReasons = [
    metricGreaterThan(snapshotWithoutOverall.security.critical, 0)
      ? "critical security findings > 0"
      : "",
    metricGreaterThan(snapshotWithoutOverall.cron.failingOrRecentErrorCount, 0)
      ? "failing cron jobs > 0"
      : "",
    metricEqualsBoolean(snapshotWithoutOverall.gateway.reachable, false)
      ? "gateway unreachable"
      : ""
  ].filter((reason) => reason.length > 0);

  if (redReasons.length > 0) {
    return {
      level: "RED",
      reasons: redReasons
    };
  }

  const criticalUnknown = [
    snapshotWithoutOverall.security.critical,
    snapshotWithoutOverall.security.warning,
    snapshotWithoutOverall.cron.failingOrRecentErrorCount,
    snapshotWithoutOverall.channels.configuredCount,
    snapshotWithoutOverall.gateway.reachable,
    snapshotWithoutOverall.repoDrift.clean,
    snapshotWithoutOverall.repoDrift.behindCount,
    snapshotWithoutOverall.versionDrift.installedVersion,
    snapshotWithoutOverall.versionDrift.latestVersion
  ].some((metric) => metricUnknown(metric));

  const amberReasons = [
    metricGreaterThan(snapshotWithoutOverall.security.warning, 0)
      ? "warning findings > 0"
      : "",
    criticalUnknown
      ? "unknown state in critical cards"
      : "",
    metricEqualsBoolean(snapshotWithoutOverall.repoDrift.clean, false)
      ? "repo drift: dirty repository"
      : "",
    metricGreaterThan(snapshotWithoutOverall.repoDrift.behindCount, 0)
      ? "repo drift: behind upstream"
      : ""
  ].filter((reason) => reason.length > 0);

  if (amberReasons.length > 0) {
    return {
      level: "AMBER",
      reasons: amberReasons
    };
  }

  return {
    level: "GREEN",
    reasons: ["all health checks passed"]
  };
};

export interface SnapshotOptions {
  readonly activeSessionWindowMinutes?: number;
}

export const collectBoardSnapshot = async (
  options: SnapshotOptions = {}
): Promise<BoardSnapshot> => {
  const activeSessionWindowMinutes = options.activeSessionWindowMinutes
    ?? defaultActiveSessionWindowMinutes;

  const statusSourceMetric = await collectStatusSource();

  const gatewayOutput = collectGatewayCard(statusSourceMetric);

  const [
    compatibilityWarnings,
    securityOutput,
    cronOutput,
    channelsOutput,
    agentsOutput,
    sessionsOutput,
    repoDriftOutput,
    versionDriftOutput
  ] = await Promise.all([
    collectCompatibilityWarnings(),
    collectSecurityCard(statusSourceMetric),
    collectCronCard(),
    collectChannelsCard(),
    collectAgentsCard(statusSourceMetric),
    collectSessionsCard(activeSessionWindowMinutes),
    collectRepoDriftCard(statusSourceMetric),
    collectVersionDriftCard(statusSourceMetric)
  ]);

  const partialSnapshot: Omit<BoardSnapshot, "overall"> = {
    agents: agentsOutput.card,
    channels: channelsOutput.card,
    cron: cronOutput.card,
    gateway: gatewayOutput.card,
    generatedAt: new Date().toISOString(),
    repoDrift: repoDriftOutput.card,
    security: securityOutput.card,
    sessions: sessionsOutput.card,
    versionDrift: versionDriftOutput.card,
    warnings: uniqueWarnings([
      ...compatibilityWarnings,
      ...gatewayOutput.warnings,
      ...securityOutput.warnings,
      ...cronOutput.warnings,
      ...channelsOutput.warnings,
      ...agentsOutput.warnings,
      ...sessionsOutput.warnings,
      ...repoDriftOutput.warnings,
      ...versionDriftOutput.warnings
    ])
  };

  return {
    ...partialSnapshot,
    overall: deriveOverallCard(partialSnapshot)
  };
};
