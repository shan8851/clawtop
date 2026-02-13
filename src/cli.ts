#!/usr/bin/env node

import { collectBoardSnapshot } from "./status.js";
import { renderBoard } from "./render.js";

type ColorMode = "auto" | "always" | "never";

interface CliOptions {
  readonly activeWindowMinutes: number;
  readonly colorMode: ColorMode;
  readonly compact: boolean;
  readonly help: boolean;
  readonly json: boolean;
  readonly once: boolean;
  readonly refreshSeconds: number;
}

const defaultActiveWindowMinutes = 60;
const defaultRefreshSeconds = 10;

const usageText = (): string => [
  "Usage: clawtop [options]",
  "",
  "One-screen OpenClaw health board (non-interactive).",
  "",
  "Options:",
  "  --once                   Render once and exit",
  "  --refresh <seconds>      Auto-refresh interval in seconds (default: 10)",
  "  --active-window <mins>   Session active window in minutes (default: 60)",
  "  --json                   Print one machine-readable snapshot and exit",
  "  --compact                Force compact single-column layout",
  "  --color <mode>           Color mode: auto|always|never (default: auto)",
  "  --help                   Show available commands and descriptions",
  "",
  "Examples:",
  "  clawtop",
  "  clawtop --once",
  "  clawtop --refresh 5",
  "  clawtop --active-window 120",
  "  clawtop --color never",
  "  clawtop --json"
].join("\n");

const parsePositiveNumberOption = (
  optionName: string,
  rawValue: string | undefined
): number => {
  const parsedValue = Number(rawValue);

  if (rawValue === undefined || !Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`${optionName} requires a positive number`);
  }

  return parsedValue;
};

const parseColorMode = (rawValue: string | undefined): ColorMode => {
  if (rawValue === "auto" || rawValue === "always" || rawValue === "never") {
    return rawValue;
  }

  throw new Error("--color requires one of: auto, always, never");
};

const parseCliArgs = (argv: readonly string[]): CliOptions => {
  const defaultOptions: CliOptions = {
    activeWindowMinutes: defaultActiveWindowMinutes,
    colorMode: "auto",
    compact: false,
    help: false,
    json: false,
    once: false,
    refreshSeconds: defaultRefreshSeconds
  };

  const mutableOptions: {
    activeWindowMinutes: number;
    colorMode: ColorMode;
    compact: boolean;
    help: boolean;
    json: boolean;
    once: boolean;
    refreshSeconds: number;
  } = { ...defaultOptions };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === undefined) {
      continue;
    }

    if (token === "--once") {
      mutableOptions.once = true;
      continue;
    }

    if (token === "--json") {
      mutableOptions.json = true;
      mutableOptions.once = true;
      continue;
    }

    if (token === "--compact") {
      mutableOptions.compact = true;
      continue;
    }

    if (token === "--help" || token === "-h") {
      mutableOptions.help = true;
      continue;
    }

    if (token === "--refresh") {
      mutableOptions.refreshSeconds = parsePositiveNumberOption("--refresh", argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--active-window") {
      mutableOptions.activeWindowMinutes = parsePositiveNumberOption("--active-window", argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--color") {
      mutableOptions.colorMode = parseColorMode(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token.startsWith("--color=")) {
      const rawMode = token.split("=")[1];
      mutableOptions.colorMode = parseColorMode(rawMode);
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return {
    activeWindowMinutes: mutableOptions.activeWindowMinutes,
    colorMode: mutableOptions.colorMode,
    compact: mutableOptions.compact,
    help: mutableOptions.help,
    json: mutableOptions.json,
    once: mutableOptions.once,
    refreshSeconds: mutableOptions.refreshSeconds
  };
};

const writeLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

const writeError = (value: string): void => {
  process.stderr.write(`${value}\n`);
};

const resolveColorEnabled = (colorMode: ColorMode, stdoutIsTty: boolean): boolean => {
  if (colorMode === "always") {
    return true;
  }

  if (colorMode === "never") {
    return false;
  }

  const noColorRequested = (process.env["NO_COLOR"] ?? "").length > 0;

  if (noColorRequested) {
    return false;
  }

  return stdoutIsTty;
};

const renderCurrentSnapshot = async (options: CliOptions): Promise<string> => {
  const snapshot = await collectBoardSnapshot({
    activeSessionWindowMinutes: options.activeWindowMinutes
  });

  return renderBoard(snapshot, {
    colorEnabled: resolveColorEnabled(options.colorMode, process.stdout.isTTY === true),
    columns: process.stdout.columns ?? 80,
    compact: options.compact
  });
};

const runOnce = async (options: CliOptions): Promise<void> => {
  const snapshot = await collectBoardSnapshot({
    activeSessionWindowMinutes: options.activeWindowMinutes
  });

  if (options.json) {
    writeLine(JSON.stringify(snapshot, null, 2));
    return;
  }

  writeLine(renderBoard(snapshot, {
    colorEnabled: resolveColorEnabled(options.colorMode, process.stdout.isTTY === true),
    columns: process.stdout.columns ?? 80,
    compact: options.compact
  }));
};

const enterAlternateScreen = (): void => {
  process.stdout.write("\u001b[?1049h\u001b[?25l");
};

const leaveAlternateScreen = (): void => {
  process.stdout.write("\u001b[?25h\u001b[?1049l");
};

const drawFrame = (frame: string, terminalControlsEnabled: boolean): void => {
  if (!terminalControlsEnabled) {
    process.stdout.write(`${frame}\n\n`);
    return;
  }

  process.stdout.write("\u001b[H");
  process.stdout.write(frame);
  process.stdout.write("\u001b[J");
};

const runRefreshLoop = async (options: CliOptions): Promise<void> => {
  const terminalControlsEnabled = process.stdout.isTTY === true;

  if (terminalControlsEnabled) {
    enterAlternateScreen();
  }

  let renderInFlight = false;

  const renderFrame = async (): Promise<void> => {
    if (renderInFlight) {
      return;
    }

    renderInFlight = true;

    try {
      const frame = await renderCurrentSnapshot(options);
      drawFrame(frame, terminalControlsEnabled);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "snapshot collection failed";
      drawFrame(`clawtop render error: ${message}`, terminalControlsEnabled);
    } finally {
      renderInFlight = false;
    }
  };

  const redrawOnResize = (): void => {
    void renderFrame();
  };

  await renderFrame();

  const intervalHandle = setInterval(() => {
    void renderFrame();
  }, options.refreshSeconds * 1000);

  const cleanup = (): void => {
    clearInterval(intervalHandle);

    if (terminalControlsEnabled) {
      process.off("SIGWINCH", redrawOnResize);
      leaveAlternateScreen();
    }

    process.off("SIGINT", cleanup);
    process.off("SIGTERM", cleanup);
    process.exit(0);
  };

  if (terminalControlsEnabled) {
    process.on("SIGWINCH", redrawOnResize);
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
};

const main = async (): Promise<void> => {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    writeLine(usageText());
    return;
  }

  if (options.once) {
    await runOnce(options);
    return;
  }

  await runRefreshLoop(options);
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown clawtop error";
  writeError(`clawtop failed: ${message}`);
  writeError("");
  writeError(usageText());
  process.exit(1);
});
