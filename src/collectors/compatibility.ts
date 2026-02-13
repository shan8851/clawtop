import { BoardWarning, buildWarning } from "../types.js";
import { runCommand } from "./openclaw.js";

const minimumSupportedOpenClawVersion = "2026.2.9";

const requiredTopLevelCommands = [
  "status",
  "security",
  "cron",
  "channels",
  "agents",
  "sessions"
] as const;

const parseVersionNumber = (rawVersion: string): string | null => {
  const matchedVersion = rawVersion.match(/([0-9]+(?:\.[0-9]+)+)/);
  return matchedVersion?.[1] ?? null;
};

const compareDotVersions = (left: string, right: string): number => {
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

const checkOpenClawVersion = async (): Promise<readonly BoardWarning[]> => {
  const versionResult = await runCommand({
    args: ["--version"],
    command: "openclaw",
    timeoutMs: 8_000
  });

  if (!versionResult.ok) {
    return [buildWarning(
      "compatibility",
      "openclaw_version_unavailable",
      versionResult.reason ?? "unable to read openclaw version",
      "warn"
    )];
  }

  const rawVersion = versionResult.stdout.trim();
  const parsedVersion = parseVersionNumber(rawVersion);

  if (parsedVersion === null) {
    return [buildWarning(
      "compatibility",
      "openclaw_version_parse_failed",
      `unable to parse openclaw version from '${rawVersion}'`,
      "warn"
    )];
  }

  const isSupported = compareDotVersions(parsedVersion, minimumSupportedOpenClawVersion) >= 0;

  if (isSupported) {
    return [];
  }

  return [buildWarning(
    "compatibility",
    "openclaw_version_unsupported",
    `detected OpenClaw ${parsedVersion}; clawtop expects >= ${minimumSupportedOpenClawVersion}`,
    "warn"
  )];
};

const parseCommandNames = (helpOutput: string): readonly string[] => {
  const commandLinePattern = /^\s{2}([a-z][a-z0-9-]*)\s+/;

  return helpOutput
    .split("\n")
    .map((line) => line.match(commandLinePattern)?.[1] ?? "")
    .filter((commandName) => commandName.length > 0);
};

let compatibilityWarningsPromise: Promise<readonly BoardWarning[]> | null = null;

const collectCompatibilityWarningsInner = async (): Promise<readonly BoardWarning[]> => {
  const binaryHelpResult = await runCommand({
    args: ["--help"],
    command: "openclaw",
    timeoutMs: 8_000
  });

  if (!binaryHelpResult.ok) {
    return [buildWarning(
      "compatibility",
      "openclaw_binary_unavailable",
      binaryHelpResult.reason ?? "openclaw --help failed",
      "error"
    )];
  }

  const availableCommands = parseCommandNames(binaryHelpResult.stdout);
  const missingCommands = requiredTopLevelCommands
    .filter((requiredCommand) => !availableCommands.includes(requiredCommand));

  const missingCommandWarnings = missingCommands.map((missingCommand) => buildWarning(
    "compatibility",
    "openclaw_command_missing",
    `openclaw command not found in --help output: ${missingCommand}`,
    "warn",
    missingCommand
  ));

  const versionWarnings = await checkOpenClawVersion();

  return [
    ...missingCommandWarnings,
    ...versionWarnings
  ];
};

export const collectCompatibilityWarnings = async (): Promise<readonly BoardWarning[]> => {
  if (compatibilityWarningsPromise === null) {
    compatibilityWarningsPromise = collectCompatibilityWarningsInner();
  }

  return compatibilityWarningsPromise;
};
