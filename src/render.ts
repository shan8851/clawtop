import { BoardSnapshot, BoardWarning, Metric, StatusLevel } from "./types.js";

interface RenderOptions {
  readonly colorEnabled: boolean;
  readonly columns: number;
  readonly compact: boolean;
}

type CardTone = "neutral" | "green" | "amber" | "red";

interface AnsiPalette {
  readonly amber: string;
  readonly border: string;
  readonly dim: string;
  readonly green: string;
  readonly red: string;
  readonly reset: string;
}

const createAnsiPalette = (colorEnabled: boolean): AnsiPalette => (
  colorEnabled
    ? {
      amber: "\u001b[38;5;221m",
      border: "\u001b[38;5;240m",
      dim: "\u001b[38;5;245m",
      green: "\u001b[38;5;114m",
      red: "\u001b[38;5;203m",
      reset: "\u001b[0m"
    }
    : {
      amber: "",
      border: "",
      dim: "",
      green: "",
      red: "",
      reset: ""
    }
);

// eslint-disable-next-line no-control-regex
const stripAnsi = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

const truncateText = (value: string, maxLength: number): string => {
  if (maxLength <= 0) {
    return "";
  }

  const plainText = stripAnsi(value);

  if (plainText.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return plainText.slice(0, maxLength);
  }

  return `${plainText.slice(0, maxLength - 1)}…`;
};

const padText = (value: string, width: number): string => {
  const truncated = truncateText(value, width);
  const visibleLength = stripAnsi(truncated).length;
  const padding = Math.max(width - visibleLength, 0);
  return `${truncated}${" ".repeat(padding)}`;
};

const metricText = <T>(metric: Metric<T>): string => {
  if (!metric.known || metric.value === null) {
    return "unknown";
  }

  if (typeof metric.value === "boolean") {
    return metric.value ? "yes" : "no";
  }

  return String(metric.value);
};

const toneColor = (ansi: AnsiPalette, tone: CardTone): string => {
  if (tone === "green") {
    return ansi.green;
  }

  if (tone === "amber") {
    return ansi.amber;
  }

  if (tone === "red") {
    return ansi.red;
  }

  return ansi.border;
};

const toneForLevel = (level: StatusLevel): CardTone => {
  if (level === "GREEN") {
    return "green";
  }

  if (level === "RED") {
    return "red";
  }

  return "amber";
};

const levelColorText = (ansi: AnsiPalette, level: StatusLevel): string => {
  const color = toneColor(ansi, toneForLevel(level));
  return `${color}${level}${ansi.reset}`;
};

const buildCard = (
  ansi: AnsiPalette,
  title: string,
  bodyLines: readonly string[],
  width: number,
  tone: CardTone,
  minimumBodyLines: number
): readonly string[] => {
  const contentWidth = Math.max(width - 2, 2);
  const bodyWidth = Math.max(contentWidth - 2, 1);
  const paddedBody = [
    ...bodyLines,
    ...Array.from({ length: Math.max(minimumBodyLines - bodyLines.length, 0) }).map(() => "")
  ];
  const borderColor = toneColor(ansi, tone);

  const topLine = `${borderColor}┌${"─".repeat(contentWidth)}┐${ansi.reset}`;
  const titleLine = `${borderColor}│ ${padText(title, bodyWidth)} │${ansi.reset}`;
  const bodyBlock = paddedBody.map((line) => `${ansi.border}│ ${padText(line, bodyWidth)} │${ansi.reset}`);
  const bottomLine = `${borderColor}└${"─".repeat(contentWidth)}┘${ansi.reset}`;

  return [topLine, titleLine, ...bodyBlock, bottomLine];
};

const mergeCardRows = (
  leftCard: readonly string[],
  rightCard: readonly string[],
  gap = 2
): readonly string[] => {
  const maxRows = Math.max(leftCard.length, rightCard.length);

  return Array.from({ length: maxRows }).map((_, index) => {
    const left = leftCard[index] ?? "";
    const right = rightCard[index] ?? "";
    return `${left}${" ".repeat(gap)}${right}`;
  });
};

const overallCardLines = (ansi: AnsiPalette, snapshot: BoardSnapshot): readonly string[] => {
  const gatewayValue = snapshot.gateway.reachable.known
    ? (snapshot.gateway.reachable.value ? "reachable" : "unreachable")
    : "unknown";

  const firstReason = snapshot.overall.reasons[0] ?? "healthy";

  return [
    `Status: ${levelColorText(ansi, snapshot.overall.level)}`,
    `Gateway: ${gatewayValue}`,
    `Signal: ${firstReason}`,
    `Updated: ${snapshot.generatedAt.replace("T", " ").replace("Z", "")}`
  ];
};

const securityCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Critical: ${metricText(snapshot.security.critical)}`,
  `Warning: ${metricText(snapshot.security.warning)}`,
  `Info: ${metricText(snapshot.security.info)}`
];

const cronCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Enabled jobs: ${metricText(snapshot.cron.enabledCount)}`,
  `Failing/recent errors: ${metricText(snapshot.cron.failingOrRecentErrorCount)}`,
  "Source: openclaw cron state"
];

const channelsCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Configured: ${metricText(snapshot.channels.configuredCount)}`,
  `Connected: ${metricText(snapshot.channels.connectedCount)}`,
  "Connected shown only when detectable"
];

const agentsCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Configured: ${metricText(snapshot.agents.configuredCount)}`,
  "Source: openclaw agents list",
  ""
];

const sessionsCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Active: ${metricText(snapshot.sessions.activeCount)}`,
  `Window: ${snapshot.sessions.activeWindowMinutes} minutes`,
  "Source: openclaw sessions"
];

const repoCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Clean: ${metricText(snapshot.repoDrift.clean)}`,
  `Ahead: ${metricText(snapshot.repoDrift.aheadCount)}  Behind: ${metricText(snapshot.repoDrift.behindCount)}`,
  `Repos: ${metricText(snapshot.repoDrift.repositoryCount)}  Dirty: ${metricText(snapshot.repoDrift.dirtyCount)}`
];

const versionCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Installed: ${metricText(snapshot.versionDrift.installedVersion)}`,
  `Latest: ${metricText(snapshot.versionDrift.latestVersion)}`,
  `Update available: ${metricText(snapshot.versionDrift.updateAvailable)}`
];

const compactLayout = (
  ansi: AnsiPalette,
  snapshot: BoardSnapshot,
  width: number
): readonly string[] => {
  const cardWidth = Math.max(width - 2, 28);

  return [
    ...buildCard(ansi, "Overall Status", overallCardLines(ansi, snapshot), cardWidth, toneForLevel(snapshot.overall.level), 4),
    ...buildCard(ansi, "Security Findings", securityCardLines(snapshot), cardWidth, "neutral", 3),
    ...buildCard(ansi, "Cron Health", cronCardLines(snapshot), cardWidth, "neutral", 3),
    ...buildCard(ansi, "Channels", channelsCardLines(snapshot), cardWidth, "neutral", 3),
    ...buildCard(ansi, "Agents", agentsCardLines(snapshot), cardWidth, "neutral", 3),
    ...buildCard(ansi, "Sessions", sessionsCardLines(snapshot), cardWidth, "neutral", 3),
    ...buildCard(ansi, "Repo Drift", repoCardLines(snapshot), cardWidth, "neutral", 3),
    ...buildCard(ansi, "Version Drift", versionCardLines(snapshot), cardWidth, "neutral", 3)
  ];
};

const wideLayout = (
  ansi: AnsiPalette,
  snapshot: BoardSnapshot,
  width: number
): readonly string[] => {
  const gap = 2;
  const fullWidth = Math.max(width - 2, 40);
  const columnWidth = Math.max(Math.floor((fullWidth - gap) / 2), 24);
  const effectiveWidth = columnWidth * 2 + gap;

  const header = buildCard(
    ansi,
    "Overall Status",
    overallCardLines(ansi, snapshot),
    effectiveWidth,
    toneForLevel(snapshot.overall.level),
    4
  );

  const rowOne = mergeCardRows(
    buildCard(ansi, "Security Findings", securityCardLines(snapshot), columnWidth, "neutral", 3),
    buildCard(ansi, "Cron Health", cronCardLines(snapshot), columnWidth, "neutral", 3),
    gap
  );

  const rowTwo = mergeCardRows(
    buildCard(ansi, "Channels", channelsCardLines(snapshot), columnWidth, "neutral", 3),
    buildCard(ansi, "Agents", agentsCardLines(snapshot), columnWidth, "neutral", 3),
    gap
  );

  const rowThree = mergeCardRows(
    buildCard(ansi, "Sessions", sessionsCardLines(snapshot), columnWidth, "neutral", 3),
    buildCard(ansi, "Repo Drift", repoCardLines(snapshot), columnWidth, "neutral", 3),
    gap
  );

  const footer = buildCard(
    ansi,
    "Version Drift",
    versionCardLines(snapshot),
    effectiveWidth,
    "neutral",
    3
  );

  return [...header, ...rowOne, ...rowTwo, ...rowThree, ...footer];
};

const warningRank: Record<BoardWarning["severity"], number> = {
  error: 3,
  info: 1,
  warn: 2
};

const warningTone = (warnings: readonly BoardWarning[]): CardTone => {
  const highestSeverity = warnings.reduce<BoardWarning["severity"]>((accumulator, warning) => (
    warningRank[warning.severity] > warningRank[accumulator]
      ? warning.severity
      : accumulator
  ), "info");

  if (highestSeverity === "error") {
    return "red";
  }

  if (highestSeverity === "warn") {
    return "amber";
  }

  return "neutral";
};

const warningSummaryLine = (ansi: AnsiPalette, warnings: readonly BoardWarning[]): string => {
  if (warnings.length === 0) {
    return `${ansi.dim}warnings(0): none${ansi.reset}`;
  }

  const visibleWarnings = warnings.slice(0, 2);
  const overflowCount = warnings.length - visibleWarnings.length;
  const visibleText = visibleWarnings
    .map((warning) => `${warning.source}: ${warning.reason}`)
    .join(" | ");
  const overflowText = overflowCount > 0 ? ` (+${overflowCount} more)` : "";
  const color = toneColor(ansi, warningTone(warnings));

  return `${ansi.dim}warnings(${warnings.length}): ${color}${visibleText}${overflowText}${ansi.reset}`;
};

export const renderBoard = (
  snapshot: BoardSnapshot,
  options: RenderOptions
): string => {
  const ansi = createAnsiPalette(options.colorEnabled);
  const compact = options.compact || options.columns < 100;
  const frameLines = compact
    ? compactLayout(ansi, snapshot, options.columns)
    : wideLayout(ansi, snapshot, options.columns);

  return [
    `${ansi.dim}clawtop · OpenClaw health board${ansi.reset}`,
    warningSummaryLine(ansi, snapshot.warnings),
    ...frameLines
  ].join("\n");
};
