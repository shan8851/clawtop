export type StatusLevel = "GREEN" | "AMBER" | "RED";

export interface Metric<T> {
  readonly known: boolean;
  readonly reason?: string;
  readonly value: T | null;
}

export type WarningSeverity = "info" | "warn" | "error";

export interface BoardWarning {
  readonly code: string;
  readonly context?: string;
  readonly reason: string;
  readonly severity: WarningSeverity;
  readonly source: string;
}

export interface CollectorOutput<T> {
  readonly card: T;
  readonly warnings: readonly BoardWarning[];
}

export interface OverallCard {
  readonly level: StatusLevel;
  readonly reasons: readonly string[];
}

export interface SecurityCard {
  readonly critical: Metric<number>;
  readonly info: Metric<number>;
  readonly warning: Metric<number>;
}

export interface CronCard {
  readonly enabledCount: Metric<number>;
  readonly failingOrRecentErrorCount: Metric<number>;
}

export interface ChannelsCard {
  readonly configuredCount: Metric<number>;
  readonly connectedCount: Metric<number>;
}

export interface AgentsCard {
  readonly configuredCount: Metric<number>;
}

export interface SessionsCard {
  readonly activeCount: Metric<number>;
  readonly activeWindowMinutes: number;
}

export interface RepoWorkspaceDrift {
  readonly aheadCount: Metric<number>;
  readonly behindCount: Metric<number>;
  readonly clean: Metric<boolean>;
  readonly diagnostics?: readonly BoardWarning[];
  readonly repositoryRoot: Metric<string>;
  readonly workspacePath: string;
}

export interface RepoDriftCard {
  readonly aheadCount: Metric<number>;
  readonly behindCount: Metric<number>;
  readonly clean: Metric<boolean>;
  readonly dirtyCount: Metric<number>;
  readonly repositoryCount: Metric<number>;
  readonly workspaces: readonly RepoWorkspaceDrift[];
}

export interface VersionDriftCard {
  readonly installedVersion: Metric<string>;
  readonly latestVersion: Metric<string>;
  readonly updateAvailable: Metric<boolean>;
}

export interface GatewayCard {
  readonly error: Metric<string>;
  readonly reachable: Metric<boolean>;
}

export interface BoardSnapshot {
  readonly agents: AgentsCard;
  readonly channels: ChannelsCard;
  readonly cron: CronCard;
  readonly gateway: GatewayCard;
  readonly generatedAt: string;
  readonly overall: OverallCard;
  readonly repoDrift: RepoDriftCard;
  readonly security: SecurityCard;
  readonly sessions: SessionsCard;
  readonly versionDrift: VersionDriftCard;
  readonly warnings: readonly BoardWarning[];
}

export const knownMetric = <T>(value: T): Metric<T> => ({
  known: true,
  value
});

export const unknownMetric = <T>(reason: string): Metric<T> => ({
  known: false,
  reason,
  value: null
});

export const buildWarning = (
  source: string,
  code: string,
  reason: string,
  severity: WarningSeverity = "warn",
  context?: string
): BoardWarning => (
  context === undefined
    ? {
      code,
      reason,
      severity,
      source
    }
    : {
      code,
      context,
      reason,
      severity,
      source
    }
);
