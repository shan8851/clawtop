import * as path from "node:path";
import {
  BoardWarning,
  CollectorOutput,
  Metric,
  RepoDriftCard,
  RepoWorkspaceDrift,
  buildWarning,
  knownMetric,
  unknownMetric
} from "../types.js";
import { OpenClawConfig, readOpenClawConfig, runCommand } from "./openclaw.js";
import { StatusSource } from "./statusSource.js";

const uniqueValues = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((value) => value.length > 0))
];

const workspacePathsFromStatus = (statusSource: Metric<StatusSource>): readonly string[] => {
  const agentEntries = statusSource.value?.agents?.agents ?? [];

  return uniqueValues(
    agentEntries
      .map((agent) => agent.workspaceDir ?? "")
      .filter((workspaceDir) => workspaceDir.length > 0)
  );
};

const workspacePathsFromConfig = (configMetric: Metric<OpenClawConfig>): readonly string[] => {
  const agents = configMetric.value?.agents?.list ?? [];

  return uniqueValues(
    agents
      .map((agent) => agent.workspaceDir ?? agent.workspace ?? "")
      .filter((workspace) => workspace.length > 0)
  );
};

const parseAheadBehind = (rawValue: string): Metric<{ ahead: number; behind: number }> => {
  const [aheadText, behindText] = rawValue.trim().split(/\s+/);
  const ahead = Number(aheadText);
  const behind = Number(behindText);

  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    return unknownMetric<{ ahead: number; behind: number }>("invalid ahead/behind format");
  }

  return knownMetric({ ahead, behind });
};

const firstLine = (value: string): string => value
  .trim()
  .split("\n")
  .map((line) => line.trim())
  .find((line) => line.length > 0)
  ?? "";

const includesAny = (value: string, patterns: readonly string[]): boolean => patterns
  .some((pattern) => value.includes(pattern));

const describeGitFailure = (
  workspacePath: string,
  resultReason: string,
  stderr: string,
  repositoryRoot?: string
): { warning: BoardWarning; reason: string } => {
  const stderrLine = firstLine(stderr);
  const searchable = `${resultReason.toLowerCase()} ${stderrLine.toLowerCase()}`;
  const contextPath = repositoryRoot ?? workspacePath;

  if (searchable.includes("not found")) {
    const reason = `git binary not found while checking ${contextPath}`;
    return {
      warning: buildWarning("repoDrift", "git_not_found", reason, "error", contextPath),
      reason
    };
  }

  if (includesAny(searchable, ["not a git repository", "not in a git directory"])) {
    const reason = `workspace is not a git repository: ${workspacePath}`;
    return {
      warning: buildWarning("repoDrift", "workspace_not_git_repo", reason, "warn", workspacePath),
      reason
    };
  }

  if (includesAny(searchable, ["no upstream configured", "no upstream branch", "does not point to a branch", "has no upstream branch", "no such branch"])) {
    const reason = `upstream is not configured for repository: ${contextPath}`;
    return {
      warning: buildWarning("repoDrift", "repo_upstream_missing", reason, "info", contextPath),
      reason
    };
  }

  const detail = stderrLine.length > 0
    ? `${resultReason} (${stderrLine})`
    : resultReason;

  const reason = `git command failed for ${contextPath}: ${detail}`;

  return {
    warning: buildWarning("repoDrift", "git_command_failed", reason, "warn", contextPath),
    reason
  };
};

const inspectWorkspace = async (workspacePath: string): Promise<RepoWorkspaceDrift> => {
  const rootResult = await runCommand({
    args: ["-C", workspacePath, "rev-parse", "--show-toplevel"],
    command: "git",
    timeoutMs: 4_000
  });

  if (!rootResult.ok) {
    const { warning, reason } = describeGitFailure(
      workspacePath,
      rootResult.reason ?? "unable to resolve repository root",
      rootResult.stderr
    );

    return {
      aheadCount: unknownMetric<number>(reason),
      behindCount: unknownMetric<number>(reason),
      clean: unknownMetric<boolean>(reason),
      diagnostics: [warning],
      repositoryRoot: unknownMetric<string>(reason),
      workspacePath
    };
  }

  const repositoryRoot = rootResult.stdout.trim();

  const statusResult = await runCommand({
    args: ["-C", repositoryRoot, "status", "--porcelain", "--untracked-files=normal"],
    command: "git",
    timeoutMs: 4_000
  });

  const cleanMetric = statusResult.ok
    ? knownMetric(statusResult.stdout.trim().length === 0)
    : unknownMetric<boolean>(
      describeGitFailure(
        workspacePath,
        statusResult.reason ?? "unable to inspect git status",
        statusResult.stderr,
        repositoryRoot
      ).reason
    );

  const statusDiagnostics = statusResult.ok
    ? []
    : [describeGitFailure(
      workspacePath,
      statusResult.reason ?? "unable to inspect git status",
      statusResult.stderr,
      repositoryRoot
    ).warning];

  const upstreamResult = await runCommand({
    args: ["-C", repositoryRoot, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    command: "git",
    timeoutMs: 4_000
  });

  if (!upstreamResult.ok) {
    const upstreamFailure = describeGitFailure(
      workspacePath,
      upstreamResult.reason ?? "unable to resolve upstream branch",
      upstreamResult.stderr,
      repositoryRoot
    );

    return {
      aheadCount: unknownMetric<number>(upstreamFailure.reason),
      behindCount: unknownMetric<number>(upstreamFailure.reason),
      clean: cleanMetric,
      diagnostics: [...statusDiagnostics, upstreamFailure.warning],
      repositoryRoot: knownMetric(repositoryRoot),
      workspacePath
    };
  }

  const aheadBehindResult = await runCommand({
    args: ["-C", repositoryRoot, "rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    command: "git",
    timeoutMs: 4_000
  });

  if (!aheadBehindResult.ok) {
    const driftFailure = describeGitFailure(
      workspacePath,
      aheadBehindResult.reason ?? "unable to compute ahead/behind",
      aheadBehindResult.stderr,
      repositoryRoot
    );

    return {
      aheadCount: unknownMetric<number>(driftFailure.reason),
      behindCount: unknownMetric<number>(driftFailure.reason),
      clean: cleanMetric,
      diagnostics: [...statusDiagnostics, driftFailure.warning],
      repositoryRoot: knownMetric(repositoryRoot),
      workspacePath
    };
  }

  const parsedAheadBehindMetric = parseAheadBehind(aheadBehindResult.stdout);

  if (!parsedAheadBehindMetric.known || parsedAheadBehindMetric.value === null) {
    const reason = `invalid ahead/behind value for ${repositoryRoot}`;

    return {
      aheadCount: unknownMetric<number>(reason),
      behindCount: unknownMetric<number>(reason),
      clean: cleanMetric,
      diagnostics: [...statusDiagnostics, buildWarning(
        "repoDrift",
        "repo_ahead_behind_parse_failed",
        reason,
        "warn",
        repositoryRoot
      )],
      repositoryRoot: knownMetric(repositoryRoot),
      workspacePath
    };
  }

  return {
    aheadCount: knownMetric(parsedAheadBehindMetric.value.ahead),
    behindCount: knownMetric(parsedAheadBehindMetric.value.behind),
    clean: cleanMetric,
    diagnostics: statusDiagnostics,
    repositoryRoot: knownMetric(repositoryRoot),
    workspacePath
  };
};

const aggregateBooleanMetric = (
  metrics: readonly Metric<boolean>[],
  unknownReason: string
): Metric<boolean> => {
  const knownValues = metrics
    .filter((metric) => metric.known && metric.value !== null)
    .map((metric) => metric.value === true);

  const unknownMetrics = metrics.filter((metric) => !metric.known);

  if (knownValues.includes(false)) {
    return knownMetric(false);
  }

  if (unknownMetrics.length > 0) {
    return unknownMetric<boolean>(unknownMetrics[0]?.reason ?? unknownReason);
  }

  return knownMetric(true);
};

const aggregateCountMetric = (
  metrics: readonly Metric<number>[],
  unknownReason: string
): Metric<number> => {
  const unknownMetrics = metrics.filter((metric) => !metric.known || metric.value === null);

  if (unknownMetrics.length > 0) {
    return unknownMetric<number>(unknownMetrics[0]?.reason ?? unknownReason);
  }

  const total = metrics
    .map((metric) => metric.value ?? 0)
    .reduce((sum, value) => sum + value, 0);

  return knownMetric(total);
};

export const aggregateRepoDrift = (
  workspaceDrifts: readonly RepoWorkspaceDrift[],
  missingWorkspaceReason: string
): RepoDriftCard => {
  if (workspaceDrifts.length === 0) {
    return {
      aheadCount: unknownMetric<number>(missingWorkspaceReason),
      behindCount: unknownMetric<number>(missingWorkspaceReason),
      clean: unknownMetric<boolean>(missingWorkspaceReason),
      dirtyCount: unknownMetric<number>(missingWorkspaceReason),
      repositoryCount: unknownMetric<number>(missingWorkspaceReason),
      workspaces: []
    };
  }

  const cleanMetric = aggregateBooleanMetric(
    workspaceDrifts.map((workspace) => workspace.clean),
    "repo cleanliness unknown"
  );

  const dirtyCountMetric = workspaceDrifts.every((workspace) => workspace.clean.known)
    ? knownMetric(workspaceDrifts.filter((workspace) => workspace.clean.value === false).length)
    : unknownMetric<number>("dirty count unavailable from one or more repositories");

  const repositoryCount = workspaceDrifts.filter((workspace) => workspace.repositoryRoot.known).length;

  return {
    aheadCount: aggregateCountMetric(
      workspaceDrifts.map((workspace) => workspace.aheadCount),
      "ahead count unknown"
    ),
    behindCount: aggregateCountMetric(
      workspaceDrifts.map((workspace) => workspace.behindCount),
      "behind count unknown"
    ),
    clean: cleanMetric,
    dirtyCount: dirtyCountMetric,
    repositoryCount: knownMetric(repositoryCount),
    workspaces: workspaceDrifts
  };
};

export const collectRepoDriftCard = async (
  statusSourceMetric: Metric<StatusSource>
): Promise<CollectorOutput<RepoDriftCard>> => {
  const configMetric = await readOpenClawConfig();

  const workspaces = uniqueValues([
    ...workspacePathsFromStatus(statusSourceMetric),
    ...workspacePathsFromConfig(configMetric)
  ]).map((workspace) => path.resolve(workspace));

  if (workspaces.length === 0) {
    const reason = statusSourceMetric.reason
      ?? configMetric.reason
      ?? "no OpenClaw workspaces discovered";

    return {
      card: aggregateRepoDrift([], reason),
      warnings: [buildWarning("repoDrift", "repo_workspaces_missing", reason, "warn")]
    };
  }

  const workspaceDrifts = await Promise.all(workspaces.map((workspace) => inspectWorkspace(workspace)));
  const card = aggregateRepoDrift(workspaceDrifts, "no repositories discovered");

  return {
    card,
    warnings: workspaceDrifts.flatMap((workspace) => workspace.diagnostics ?? [])
  };
};
