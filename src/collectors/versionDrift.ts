import * as path from "node:path";
import { z } from "zod";
import { CollectorOutput, Metric, VersionDriftCard, buildWarning, knownMetric, unknownMetric } from "../types.js";
import {
  readJsonFileWithSchema,
  resolveOpenClawStateRoots,
  runOpenClawText
} from "./openclaw.js";
import { StatusSource } from "./statusSource.js";

const versionTokenPattern = /([0-9]+(?:\.[0-9]+)+)/;

const normalizeVersion = (rawValue: string): string => {
  const match = rawValue.match(versionTokenPattern);
  return match?.[1] ?? rawValue.trim();
};

export const compareDotVersions = (left: string, right: string): number => {
  const toParts = (value: string): readonly number[] => value
    .split(".")
    .map((part) => Number(part))
    .map((part) => Number.isFinite(part) ? part : 0);

  const leftParts = toParts(left);
  const rightParts = toParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
};

const updateCheckSchema = z.object({
  latest: z.string().optional(),
  latestVersion: z.string().optional(),
  version: z.string().optional()
}).passthrough();

const latestVersionFromStatus = (statusSourceMetric: Metric<StatusSource>): Metric<string> => {
  const latestVersion = statusSourceMetric.value?.update?.registry?.latestVersion;

  if (latestVersion !== undefined && latestVersion.length > 0) {
    return knownMetric(latestVersion);
  }

  return unknownMetric<string>(statusSourceMetric.reason ?? "latest version unavailable from status source");
};

const latestVersionFromState = async (): Promise<Metric<string>> => {
  const stateRoots = resolveOpenClawStateRoots();

  for (const stateRoot of stateRoots) {
    const candidate = path.join(stateRoot, "update-check.json");
    const parsed = await readJsonFileWithSchema(candidate, updateCheckSchema);

    if (!parsed.known || parsed.value === null) {
      continue;
    }

    const rawVersion = parsed.value.latestVersion ?? parsed.value.latest ?? parsed.value.version;

    if (rawVersion !== undefined && rawVersion.length > 0) {
      return knownMetric(rawVersion);
    }
  }

  return unknownMetric<string>("latest version unavailable from state update-check.json");
};

const normalizeVersionMetric = (metric: Metric<string>): Metric<string> => {
  if (!metric.known || metric.value === null) {
    return metric;
  }

  return knownMetric(normalizeVersion(metric.value));
};

export const deriveUpdateAvailabilityMetric = (
  installedVersion: Metric<string>,
  latestVersion: Metric<string>
): Metric<boolean> => {
  if (!installedVersion.known || installedVersion.value === null) {
    return unknownMetric<boolean>(installedVersion.reason ?? "installed version unknown");
  }

  if (!latestVersion.known || latestVersion.value === null) {
    return unknownMetric<boolean>(latestVersion.reason ?? "latest version unknown");
  }

  return knownMetric(compareDotVersions(latestVersion.value, installedVersion.value) > 0);
};

export const collectVersionDriftCard = async (
  statusSourceMetric: Metric<StatusSource>
): Promise<CollectorOutput<VersionDriftCard>> => {
  const installedVersionMetric = normalizeVersionMetric(
    await runOpenClawText(["--version"], "openclaw --version")
  );

  const statusLatestVersionMetric = latestVersionFromStatus(statusSourceMetric);
  const stateLatestVersionMetric = await latestVersionFromState();

  const latestVersionMetric = statusLatestVersionMetric.known
    ? normalizeVersionMetric(statusLatestVersionMetric)
    : normalizeVersionMetric(stateLatestVersionMetric);

  const updateAvailableMetric = deriveUpdateAvailabilityMetric(installedVersionMetric, latestVersionMetric);

  const warnings = [
    installedVersionMetric.known
      ? null
      : buildWarning(
        "version",
        "installed_version_unknown",
        installedVersionMetric.reason ?? "installed version unknown",
        "warn"
      ),
    latestVersionMetric.known
      ? null
      : buildWarning(
        "version",
        "latest_version_unknown",
        latestVersionMetric.reason ?? "latest version unknown",
        "warn"
      ),
    updateAvailableMetric.known
      ? null
      : buildWarning(
        "version",
        "update_availability_unknown",
        updateAvailableMetric.reason ?? "update availability unknown",
        "info"
      )
  ].filter((warning): warning is NonNullable<typeof warning> => warning !== null);

  return {
    card: {
      installedVersion: installedVersionMetric,
      latestVersion: latestVersionMetric,
      updateAvailable: updateAvailableMetric
    },
    warnings
  };
};
