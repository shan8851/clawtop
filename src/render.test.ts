import { describe, expect, it } from "vitest";
import {
  renderBoard,
  renderErrorState,
  renderLoadingState
} from "./render.js";
import { BoardSnapshot, buildWarning, knownMetric } from "./types.js";

const boardSnapshot = (): BoardSnapshot => ({
  agents: {
    configuredCount: knownMetric(2)
  },
  channels: {
    configuredCount: knownMetric(2),
    connectedCount: knownMetric(2)
  },
  cron: {
    enabledCount: knownMetric(3),
    failingOrRecentErrorCount: knownMetric(0)
  },
  gateway: {
    error: knownMetric(""),
    reachable: knownMetric(true)
  },
  generatedAt: "2026-02-14T12:00:00.000Z",
  overall: {
    level: "GREEN",
    reasons: ["all health checks passed"]
  },
  repoDrift: {
    aheadCount: knownMetric(0),
    behindCount: knownMetric(0),
    clean: knownMetric(true),
    dirtyCount: knownMetric(0),
    repositoryCount: knownMetric(2),
    workspaces: []
  },
  security: {
    critical: knownMetric(0),
    info: knownMetric(4),
    warning: knownMetric(0)
  },
  sessions: {
    activeCount: knownMetric(1),
    activeWindowMinutes: 60
  },
  versionDrift: {
    installedVersion: knownMetric("2026.2.10"),
    latestVersion: knownMetric("2026.2.10"),
    updateAvailable: knownMetric(false)
  },
  warnings: []
});

describe("renderBoard", () => {
  it("renders readable text output with colors disabled", () => {
    const output = renderBoard(boardSnapshot(), {
      colorEnabled: false,
      columns: 120,
      compact: false
    });

    expect(output).toContain("CLAWTOP OpenClaw health board");
    expect(output).toContain("Advisories: none");
    expect(output).toContain("Overall Status [OK]");
    expect(output.includes(`${String.fromCharCode(27)}[`)).toBe(false);
  });

  it("summarizes warnings in the top advisory line", () => {
    const output = renderBoard({
      ...boardSnapshot(),
      warnings: [buildWarning("compatibility", "missing", "openclaw command missing")]
    }, {
      colorEnabled: false,
      columns: 120,
      compact: false
    });

    expect(output).toContain("Advisories(1): compatibility: openclaw command missing");
  });
});

describe("status state renders", () => {
  it("renders loading state with startup guidance", () => {
    const output = renderLoadingState({
      colorEnabled: false,
      columns: 100,
      compact: false
    });

    expect(output).toContain("Starting dashboard refresh loop");
    expect(output).toContain("Collecting OpenClaw metrics");
  });

  it("renders error state with retry hint", () => {
    const output = renderErrorState("openclaw not found", {
      colorEnabled: false,
      columns: 100,
      compact: false
    });

    expect(output).toContain("Snapshot refresh failed");
    expect(output).toContain("Reason: openclaw not found");
    expect(output).toContain("Retry with: clawtop --once --json");
  });
});
