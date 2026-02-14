import { BoardSnapshot, BoardWarning, Metric, StatusLevel } from "./types.js";

export interface RenderOptions {
  readonly colorEnabled: boolean;
  readonly columns: number;
  readonly compact: boolean;
}

type CardTone = "neutral" | "green" | "amber" | "red";

interface AnsiPalette {
  readonly amber: string;
  readonly border: string;
  readonly brand: string;
  readonly dim: string;
  readonly green: string;
  readonly red: string;
  readonly reset: string;
}

const minimumViewportWidth = 40;

const createAnsiPalette = (colorEnabled: boolean): AnsiPalette => (
  colorEnabled
    ? {
      amber: "\u001b[38;5;221m",
      border: "\u001b[38;5;240m",
      brand: "\u001b[38;5;81m",
      dim: "\u001b[38;5;245m",
      green: "\u001b[38;5;114m",
      red: "\u001b[38;5;203m",
      reset: "\u001b[0m"
    }
    : {
      amber: "",
      border: "",
      brand: "",
      dim: "",
      green: "",
      red: "",
      reset: ""
    }
);

// eslint-disable-next-line no-control-regex
const stripAnsi = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

const normalizeColumns = (columns: number): number => Math.max(columns, minimumViewportWidth);

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

const numberMetricValue = (metric: Metric<number>): number | null => (
  metric.known && metric.value !== null
    ? metric.value
    : null
);

const booleanMetricValue = (metric: Metric<boolean>): boolean | null => (
  metric.known && metric.value !== null
    ? metric.value
    : null
);

const metricUnknown = (metric: Metric<unknown>): boolean => !metric.known || metric.value === null;

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

const toneTag: Record<CardTone, string> = {
  amber: "ATTN",
  green: "OK",
  neutral: "INFO",
  red: "ALERT"
};

const levelBadge = (ansi: AnsiPalette, level: StatusLevel): string => {
  const color = toneColor(ansi, toneForLevel(level));
  return `${color}[${level}]${ansi.reset}`;
};

const cardTitle = (title: string, tone: CardTone): string => `${title} [${toneTag[tone]}]`;

const formatTimestamp = (value: string): string => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value.replace("T", " ").replace("Z", " UTC");
  }

  return parsedDate
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
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

const securityTone = (snapshot: BoardSnapshot): CardTone => {
  const criticalCount = numberMetricValue(snapshot.security.critical);
  const warningCount = numberMetricValue(snapshot.security.warning);

  if (criticalCount !== null && criticalCount > 0) {
    return "red";
  }

  if (warningCount !== null && warningCount > 0) {
    return "amber";
  }

  if ([snapshot.security.critical, snapshot.security.warning, snapshot.security.info].some(metricUnknown)) {
    return "amber";
  }

  return "green";
};

const cronTone = (snapshot: BoardSnapshot): CardTone => {
  const failingCount = numberMetricValue(snapshot.cron.failingOrRecentErrorCount);

  if (failingCount !== null && failingCount > 0) {
    return "red";
  }

  if ([snapshot.cron.enabledCount, snapshot.cron.failingOrRecentErrorCount].some(metricUnknown)) {
    return "amber";
  }

  return "green";
};

const channelsTone = (snapshot: BoardSnapshot): CardTone => {
  const configuredCount = numberMetricValue(snapshot.channels.configuredCount);
  const connectedCount = numberMetricValue(snapshot.channels.connectedCount);

  if (configuredCount === null || connectedCount === null) {
    return "amber";
  }

  if (configuredCount === 0) {
    return "neutral";
  }

  return connectedCount < configuredCount ? "amber" : "green";
};

const agentsTone = (snapshot: BoardSnapshot): CardTone => {
  const configuredCount = numberMetricValue(snapshot.agents.configuredCount);

  if (configuredCount === null) {
    return "amber";
  }

  if (configuredCount === 0) {
    return "neutral";
  }

  return "green";
};

const sessionsTone = (snapshot: BoardSnapshot): CardTone => {
  const activeCount = numberMetricValue(snapshot.sessions.activeCount);

  if (activeCount === null) {
    return "amber";
  }

  if (activeCount === 0) {
    return "neutral";
  }

  return "green";
};

const repoTone = (snapshot: BoardSnapshot): CardTone => {
  const cleanState = booleanMetricValue(snapshot.repoDrift.clean);
  const behindCount = numberMetricValue(snapshot.repoDrift.behindCount);

  if (cleanState === null || behindCount === null) {
    return "amber";
  }

  if (!cleanState || behindCount > 0) {
    return "amber";
  }

  return "green";
};

const versionTone = (snapshot: BoardSnapshot): CardTone => {
  const updateAvailable = booleanMetricValue(snapshot.versionDrift.updateAvailable);

  if (updateAvailable === true) {
    return "amber";
  }

  if ([
    snapshot.versionDrift.installedVersion,
    snapshot.versionDrift.latestVersion,
    snapshot.versionDrift.updateAvailable
  ].some(metricUnknown)) {
    return "amber";
  }

  return "green";
};

const overallCardLines = (ansi: AnsiPalette, snapshot: BoardSnapshot): readonly string[] => {
  const gatewayValue = snapshot.gateway.reachable.known
    ? (snapshot.gateway.reachable.value ? "reachable" : "unreachable")
    : "unknown";

  const firstReason = snapshot.overall.reasons[0] ?? "healthy";

  return [
    `Health: ${levelBadge(ansi, snapshot.overall.level)}`,
    `Gateway: ${gatewayValue}`,
    `Signal: ${firstReason}`,
    `Updated: ${formatTimestamp(snapshot.generatedAt)}`
  ];
};

const securityCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Critical findings: ${metricText(snapshot.security.critical)}`,
  `Warning findings: ${metricText(snapshot.security.warning)}`,
  `Info findings: ${metricText(snapshot.security.info)}`
];

const cronCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Enabled jobs: ${metricText(snapshot.cron.enabledCount)}`,
  `Failing/recent: ${metricText(snapshot.cron.failingOrRecentErrorCount)}`,
  "Data source: openclaw cron"
];

const channelsCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Configured channels: ${metricText(snapshot.channels.configuredCount)}`,
  `Connected channels: ${metricText(snapshot.channels.connectedCount)}`,
  "Connected signal may be unknown"
];

const agentsCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Configured agents: ${metricText(snapshot.agents.configuredCount)}`,
  "Data source: openclaw agents",
  ""
];

const sessionsCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Active sessions: ${metricText(snapshot.sessions.activeCount)}`,
  `Activity window: ${snapshot.sessions.activeWindowMinutes} minutes`,
  "Data source: openclaw sessions"
];

const repoCardLines = (snapshot: BoardSnapshot): readonly string[] => [
  `Clean repos: ${metricText(snapshot.repoDrift.clean)}`,
  `Ahead/Behind: ${metricText(snapshot.repoDrift.aheadCount)} / ${metricText(snapshot.repoDrift.behindCount)}`,
  `Repos/Dirty: ${metricText(snapshot.repoDrift.repositoryCount)} / ${metricText(snapshot.repoDrift.dirtyCount)}`
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
    ...buildCard(
      ansi,
      cardTitle("Overall Status", toneForLevel(snapshot.overall.level)),
      overallCardLines(ansi, snapshot),
      cardWidth,
      toneForLevel(snapshot.overall.level),
      4
    ),
    ...buildCard(ansi, cardTitle("Security Findings", securityTone(snapshot)), securityCardLines(snapshot), cardWidth, securityTone(snapshot), 3),
    ...buildCard(ansi, cardTitle("Cron Health", cronTone(snapshot)), cronCardLines(snapshot), cardWidth, cronTone(snapshot), 3),
    ...buildCard(ansi, cardTitle("Channels", channelsTone(snapshot)), channelsCardLines(snapshot), cardWidth, channelsTone(snapshot), 3),
    ...buildCard(ansi, cardTitle("Agents", agentsTone(snapshot)), agentsCardLines(snapshot), cardWidth, agentsTone(snapshot), 3),
    ...buildCard(ansi, cardTitle("Sessions", sessionsTone(snapshot)), sessionsCardLines(snapshot), cardWidth, sessionsTone(snapshot), 3),
    ...buildCard(ansi, cardTitle("Repo Drift", repoTone(snapshot)), repoCardLines(snapshot), cardWidth, repoTone(snapshot), 3),
    ...buildCard(ansi, cardTitle("Version Drift", versionTone(snapshot)), versionCardLines(snapshot), cardWidth, versionTone(snapshot), 3)
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
    cardTitle("Overall Status", toneForLevel(snapshot.overall.level)),
    overallCardLines(ansi, snapshot),
    effectiveWidth,
    toneForLevel(snapshot.overall.level),
    4
  );

  const rowOne = mergeCardRows(
    buildCard(ansi, cardTitle("Security Findings", securityTone(snapshot)), securityCardLines(snapshot), columnWidth, securityTone(snapshot), 3),
    buildCard(ansi, cardTitle("Cron Health", cronTone(snapshot)), cronCardLines(snapshot), columnWidth, cronTone(snapshot), 3),
    gap
  );

  const rowTwo = mergeCardRows(
    buildCard(ansi, cardTitle("Channels", channelsTone(snapshot)), channelsCardLines(snapshot), columnWidth, channelsTone(snapshot), 3),
    buildCard(ansi, cardTitle("Agents", agentsTone(snapshot)), agentsCardLines(snapshot), columnWidth, agentsTone(snapshot), 3),
    gap
  );

  const rowThree = mergeCardRows(
    buildCard(ansi, cardTitle("Sessions", sessionsTone(snapshot)), sessionsCardLines(snapshot), columnWidth, sessionsTone(snapshot), 3),
    buildCard(ansi, cardTitle("Repo Drift", repoTone(snapshot)), repoCardLines(snapshot), columnWidth, repoTone(snapshot), 3),
    gap
  );

  const footer = buildCard(
    ansi,
    cardTitle("Version Drift", versionTone(snapshot)),
    versionCardLines(snapshot),
    effectiveWidth,
    versionTone(snapshot),
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
    return `${ansi.dim}Advisories: none${ansi.reset}`;
  }

  const visibleWarnings = warnings.slice(0, 2);
  const overflowCount = warnings.length - visibleWarnings.length;
  const visibleText = visibleWarnings
    .map((warning) => `${warning.source}: ${warning.reason}`)
    .join(" | ");
  const overflowText = overflowCount > 0 ? ` (+${overflowCount} more)` : "";
  const color = toneColor(ansi, warningTone(warnings));

  return `${ansi.dim}Advisories(${warnings.length}): ${color}${visibleText}${overflowText}${ansi.reset}`;
};

const boardHeaderLines = (
  ansi: AnsiPalette,
  snapshot: BoardSnapshot,
  columns: number
): readonly string[] => {
  const viewportWidth = normalizeColumns(columns);
  const title = `${ansi.brand}CLAWTOP${ansi.reset} ${ansi.dim}OpenClaw health board${ansi.reset}`;
  const summary = [
    `Overall ${levelBadge(ansi, snapshot.overall.level)}`,
    `Warnings ${snapshot.warnings.length}`,
    `Updated ${formatTimestamp(snapshot.generatedAt)}`
  ].join("  ·  ");

  return [
    truncateText(title, viewportWidth),
    truncateText(`${ansi.dim}${summary}${ansi.reset}`, viewportWidth)
  ];
};

const stateCard = (
  ansi: AnsiPalette,
  columns: number,
  title: string,
  lines: readonly string[],
  tone: CardTone
): string => {
  const width = Math.max(normalizeColumns(columns) - 2, 38);
  return buildCard(ansi, cardTitle(title, tone), lines, width, tone, 4).join("\n");
};

export const renderLoadingState = (options: RenderOptions): string => {
  const ansi = createAnsiPalette(options.colorEnabled);
  const viewportWidth = normalizeColumns(options.columns);
  const title = truncateText(`${ansi.brand}CLAWTOP${ansi.reset} ${ansi.dim}OpenClaw health board${ansi.reset}`, viewportWidth);
  const subtitle = truncateText(`${ansi.dim}Starting dashboard refresh loop...${ansi.reset}`, viewportWidth);
  const loadingCard = stateCard(ansi, viewportWidth, "Starting clawtop", [
    "Collecting OpenClaw metrics...",
    "Preparing dashboard layout...",
    "First snapshot will appear automatically."
  ], "neutral");

  return [title, subtitle, "", loadingCard].join("\n");
};

export const renderErrorState = (
  message: string,
  options: RenderOptions
): string => {
  const ansi = createAnsiPalette(options.colorEnabled);
  const viewportWidth = normalizeColumns(options.columns);
  const title = truncateText(`${ansi.brand}CLAWTOP${ansi.reset} ${ansi.dim}OpenClaw health board${ansi.reset}`, viewportWidth);
  const subtitle = truncateText(`${ansi.red}Snapshot refresh failed${ansi.reset}`, viewportWidth);
  const errorCard = stateCard(ansi, viewportWidth, "Refresh Error", [
    "Snapshot collection failed.",
    `Reason: ${message}`,
    "Check openclaw CLI access and command compatibility.",
    "Retry with: clawtop --once --json"
  ], "red");

  return [title, subtitle, "", errorCard].join("\n");
};

export const renderBoard = (
  snapshot: BoardSnapshot,
  options: RenderOptions
): string => {
  const ansi = createAnsiPalette(options.colorEnabled);
  const viewportWidth = normalizeColumns(options.columns);
  const compact = options.compact || viewportWidth < 100;
  const frameLines = compact
    ? compactLayout(ansi, snapshot, viewportWidth)
    : wideLayout(ansi, snapshot, viewportWidth);

  return [
    ...boardHeaderLines(ansi, snapshot, viewportWidth),
    truncateText(warningSummaryLine(ansi, snapshot.warnings), viewportWidth),
    "",
    ...frameLines
  ].join("\n");
};
